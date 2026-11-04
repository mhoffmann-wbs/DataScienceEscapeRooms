import { describe, expect, it } from 'vitest';
import { createMemoryTransport, MemoryHub } from './memoryTransport';
import { MAX_TEAM_SIZE, Teams, type StartedTeam, type Team } from './teams';

function lobby(hub: MemoryHub, id: string) {
  const teams = new Teams(createMemoryTransport(hub, id).join('lobby'), () => 1000);
  const started: Team[] = [];
  const startedWith: StartedTeam[] = [];
  const rejected: string[] = [];
  teams.events.on('started', (s) => {
    started.push(s.team);
    startedWith.push(s);
  });
  teams.events.on('rejected', ({ teamId }) => rejected.push(teamId));
  return { teams, started, startedWith, rejected, room: () => teams };
}

// Password checks hash asynchronously.
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('teams', () => {
  it('lets only players with the password join a locked team, and hands it to members on start', async () => {
    const hub = new MemoryHub();
    const ada = lobby(hub, 'ada');
    const bob = lobby(hub, 'bob');
    const eve = lobby(hub, 'eve');
    ada.teams.create('sql-hotel', 'blue-index');
    const teamId = ada.teams.mine()!.id;
    expect(bob.teams.list()[0]).toMatchObject({ locked: true });
    // The password itself is never part of the public record.
    expect(JSON.stringify(bob.teams.list())).not.toContain('blue-index');

    await eve.teams.join(teamId, 'wrong');
    await eve.teams.join(teamId);
    await settle();
    expect(ada.teams.mine()?.members).toEqual(['ada']);
    expect(eve.rejected).toEqual([teamId, teamId]);

    await bob.teams.join(teamId, 'blue-index');
    await settle();
    expect(ada.teams.mine()?.members).toEqual(['ada', 'bob']);
    ada.teams.start();
    expect(ada.startedWith[0]!.password).toBe('blue-index');
    expect(bob.startedWith[0]!.password).toBe('blue-index');
  });

  it('carries an optional group tag', () => {
    const hub = new MemoryHub();
    const ada = lobby(hub, 'ada');
    const bob = lobby(hub, 'bob');
    ada.teams.create('python-lab', undefined, '  DS-Nov-26 ');
    expect(bob.teams.list()[0]!.group).toBe('DS-Nov-26');
    ada.teams.create('python-lab');
    expect(bob.teams.list()[0]!.group).toBeNull();
  });

  it('public teams need no password and start without one', () => {
    const hub = new MemoryHub();
    const ada = lobby(hub, 'ada');
    const bob = lobby(hub, 'bob');
    ada.teams.create('python-lab');
    void bob.teams.join(ada.teams.mine()!.id);
    ada.teams.start();
    expect(bob.startedWith[0]).toMatchObject({ password: undefined, team: { locked: false } });
  });

  it('creates, joins, and shows the team to everyone, including late arrivals', () => {
    const hub = new MemoryHub();
    const ada = lobby(hub, 'ada');
    const bob = lobby(hub, 'bob');
    ada.teams.create('sql-hotel');
    const teamId = ada.teams.mine()!.id;
    bob.teams.join(teamId);
    expect(ada.teams.mine()?.members).toEqual(['ada', 'bob']);
    expect(bob.teams.mine()?.id).toBe(teamId);
    const cy = lobby(hub, 'cy');
    expect(cy.teams.list().map((t) => t.members)).toEqual([['ada', 'bob']]);
  });

  it('starts the run for every member and removes the team from the lobby list', () => {
    const hub = new MemoryHub();
    const ada = lobby(hub, 'ada');
    const bob = lobby(hub, 'bob');
    const cy = lobby(hub, 'cy');
    ada.teams.create('python-lab');
    bob.teams.join(ada.teams.mine()!.id);
    ada.teams.start();
    expect(ada.started.map((t) => t.members)).toEqual([['ada', 'bob']]);
    expect(bob.started.map((t) => t.startedAt)).toEqual([1000]);
    expect(cy.started).toEqual([]);
    expect(cy.teams.list()).toEqual([]);
  });

  it('enforces the team size limit', () => {
    const hub = new MemoryHub();
    const lead = lobby(hub, 'lead');
    lead.teams.create('python-lab');
    const id = lead.teams.mine()!.id;
    const others = Array.from({ length: MAX_TEAM_SIZE }, (_, i) => lobby(hub, `p${i}`));
    others.forEach((o) => o.teams.join(id));
    expect(lead.teams.mine()?.members).toHaveLength(MAX_TEAM_SIZE);
    expect(others.at(-1)!.teams.mine()).toBeUndefined();
  });

  it('handles members leaving, switching teams, and the leader disbanding or disconnecting', () => {
    const hub = new MemoryHub();
    const ada = lobby(hub, 'ada');
    const bob = lobby(hub, 'bob');
    const cyNet = createMemoryTransport(hub, 'cy').join('lobby');
    const cy = new Teams(cyNet);
    ada.teams.create('sql-hotel');
    cy.create('sql-hotel');
    bob.teams.join(ada.teams.mine()!.id);
    // Switching to Cy's team leaves Ada's.
    bob.teams.join(cy.mine()!.id);
    expect(ada.teams.mine()?.members).toEqual(['ada']);
    expect(cy.mine()?.members).toEqual(['cy', 'bob']);
    // Leader disconnects: the team disappears for everyone.
    cyNet.leave();
    expect(bob.teams.mine()).toBeUndefined();
    expect(ada.teams.list().map((t) => t.leader)).toEqual(['ada']);
    // Leader disbands explicitly.
    ada.teams.leave();
    expect(bob.teams.list()).toEqual([]);
  });

  it('ignores team records published by someone other than the leader', () => {
    const hub = new MemoryHub();
    const ada = lobby(hub, 'ada');
    const evil = createMemoryTransport(hub, 'evil').join('lobby');
    evil.channel('team').send({
      type: 'state',
      team: { id: 't', roomId: 'sql-hotel', leader: 'ada', members: ['ada', 'evil'], status: 'started', startedAt: 1 },
    });
    expect(ada.started).toEqual([]);
    expect(ada.teams.list()).toEqual([]);
  });
});
