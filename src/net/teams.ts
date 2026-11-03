import { z } from 'zod';
import { Emitter } from '../lib/emitter';
import type { NetRoom } from './transport';

// Team formation in the lobby. A forming team is owned by its leader, who is the
// only peer allowed to publish its record; others ask the leader to join/leave.
// Once started, the team moves to its own room scope and drops out of the lobby list.

export const MAX_TEAM_SIZE = 5;

const id = z.string().min(1).max(64);

export const teamSchema = z.object({
  id,
  roomId: id,
  leader: id,
  members: z.array(id).min(1).max(MAX_TEAM_SIZE),
  status: z.enum(['forming', 'started']),
  startedAt: z.number().finite().nullable(),
});
export type Team = z.infer<typeof teamSchema>;

const teamMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('state'), team: teamSchema }),
  z.object({ type: z.literal('join'), teamId: id }),
  z.object({ type: z.literal('leave'), teamId: id }),
  z.object({ type: z.literal('disband'), teamId: id }),
]);
type TeamMessage = z.infer<typeof teamMessage>;

export function roomScope(roomId: string, teamId: string): string {
  return `room:${roomId}:${teamId}`;
}

export class Teams {
  readonly events = new Emitter<{ teams: readonly Team[]; started: Team }>();
  private readonly teams = new Map<string, Team>();
  private snapshot: readonly Team[] = [];
  private readonly offs: (() => void)[];
  private readonly channel;
  private counter = 0;

  constructor(
    private readonly room: NetRoom,
    private readonly now: () => number = Date.now,
  ) {
    this.channel = room.channel<TeamMessage>('team');
    this.offs = [
      room.onPeerJoin((peer) => {
        const mine = this.led();
        if (mine) this.channel.send({ type: 'state', team: mine }, [peer]);
      }),
      room.onPeerLeave((peer) => {
        let changed = false;
        for (const t of [...this.teams.values()]) {
          if (t.leader === peer) changed = this.teams.delete(t.id) || changed;
        }
        const mine = this.led();
        if (mine?.members.includes(peer)) {
          this.publish({ ...mine, members: mine.members.filter((m) => m !== peer) });
          return;
        }
        if (changed) this.emit();
      }),
      this.channel.subscribe((data, from) => {
        const parsed = teamMessage.safeParse(data);
        if (parsed.success) this.receive(parsed.data, from);
      }),
    ];
  }

  get selfId(): string {
    return this.room.selfId;
  }

  /** Forming teams, oldest first. Stable between changes (for useSyncExternalStore). */
  list(): readonly Team[] {
    return this.snapshot;
  }

  /** The forming team we're a member of, if any. */
  mine(): Team | undefined {
    return this.snapshot.find((t) => t.members.includes(this.selfId));
  }

  create(roomId: string): void {
    this.leave();
    this.publish({
      id: `${this.selfId.slice(0, 12)}-${(this.counter++).toString(36)}-${this.now().toString(36)}`,
      roomId,
      leader: this.selfId,
      members: [this.selfId],
      status: 'forming',
      startedAt: null,
    });
  }

  join(teamId: string): void {
    const team = this.teams.get(teamId);
    if (!team || team.members.includes(this.selfId)) return;
    this.leave();
    this.channel.send({ type: 'join', teamId }, [team.leader]);
  }

  leave(): void {
    const team = this.mine();
    if (!team) return;
    if (team.leader === this.selfId) {
      this.teams.delete(team.id);
      this.channel.send({ type: 'disband', teamId: team.id });
    } else {
      this.channel.send({ type: 'leave', teamId: team.id }, [team.leader]);
      this.teams.set(team.id, { ...team, members: team.members.filter((m) => m !== this.selfId) });
    }
    this.emit();
  }

  /** Leader only: starts the run for everyone in the team. */
  start(): void {
    const team = this.led();
    if (!team) return;
    const started: Team = { ...team, status: 'started', startedAt: this.now() };
    this.channel.send({ type: 'state', team: started });
    this.teams.delete(team.id);
    this.emit();
    this.events.emit('started', started);
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.events.clear();
  }

  private led(): Team | undefined {
    return [...this.teams.values()].find((t) => t.leader === this.selfId);
  }

  private receive(msg: TeamMessage, from: string): void {
    switch (msg.type) {
      case 'state': {
        const { team } = msg;
        if (team.leader !== from || !team.members.includes(team.leader)) return;
        if (team.status === 'started') {
          this.teams.delete(team.id);
          this.emit();
          if (team.members.includes(this.selfId)) this.events.emit('started', team);
          return;
        }
        this.teams.set(team.id, team);
        this.emit();
        return;
      }
      case 'disband': {
        if (this.teams.get(msg.teamId)?.leader === from && this.teams.delete(msg.teamId)) this.emit();
        return;
      }
      case 'join': {
        const team = this.led();
        if (team?.id !== msg.teamId || team.members.includes(from) || team.members.length >= MAX_TEAM_SIZE) return;
        this.publish({ ...team, members: [...team.members, from] });
        return;
      }
      case 'leave': {
        const team = this.led();
        if (team?.id !== msg.teamId || !team.members.includes(from)) return;
        this.publish({ ...team, members: team.members.filter((m) => m !== from) });
        return;
      }
    }
  }

  private publish(team: Team): void {
    this.teams.set(team.id, team);
    this.channel.send({ type: 'state', team });
    this.emit();
  }

  private emit(): void {
    this.snapshot = [...this.teams.values()];
    this.events.emit('teams', this.snapshot);
  }
}
