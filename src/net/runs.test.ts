import { describe, expect, it } from 'vitest';
import { createMemoryTransport, MemoryHub } from './memoryTransport';
import { Runs, type RunSummary } from './runs';

const summary = (teamId: string, at: number, solved: Record<string, number> = {}): RunSummary => ({
  teamId,
  roomId: 'python-lab',
  leader: 'Ada',
  group: 'DS-1',
  members: ['Ada', 'Bob'],
  peers: ['ada', 'bob'],
  epoch: 0,
  startedAt: 1000,
  solved,
  hints: {},
  attempts: {},
  escapedAt: null,
  at,
});

function peer(hub: MemoryHub, id: string) {
  const room = createMemoryTransport(hub, id).join('lobby');
  return { room, runs: new Runs(room) };
}

describe('Runs', () => {
  it('shares run summaries with everyone, including late arrivals', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada');
    ada.runs.publish(summary('t1', 1));
    const teacher = peer(hub, 'teacher');
    expect(teacher.runs.list().map((r) => r.teamId)).toEqual(['t1']);
    // The members' peer ids come along, so an instructor can find a player's team.
    expect(teacher.runs.list()[0]!.peers).toEqual(['ada', 'bob']);
  });

  it('keeps the newest summary when several members report the same team', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada');
    const bob = peer(hub, 'bob');
    const teacher = peer(hub, 'teacher');
    ada.runs.publish(summary('t1', 2, { a: 5 }));
    bob.runs.publish(summary('t1', 1));
    expect(teacher.runs.list()[0]!.solved).toEqual({ a: 5 });
  });

  it('drops a run once no member reports it (withdrawn or disconnected)', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada');
    const bob = peer(hub, 'bob');
    const teacher = peer(hub, 'teacher');
    ada.runs.publish(summary('t1', 1));
    bob.runs.publish(summary('t1', 1));
    ada.runs.withdraw();
    expect(teacher.runs.list()).toHaveLength(1);
    bob.room.leave();
    expect(teacher.runs.list()).toEqual([]);
  });

  it('ignores malformed summaries', () => {
    const hub = new MemoryHub();
    const eve = peer(hub, 'eve');
    const teacher = peer(hub, 'teacher');
    eve.room.channel('runs').send({ type: 'summary', summary: { teamId: 't1' } });
    expect(teacher.runs.list()).toEqual([]);
  });
});
