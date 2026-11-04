import { z } from 'zod';
import { Emitter } from '../lib/emitter';
import type { NetRoom } from './transport';

// Team formation in the lobby. A forming team is owned by its leader, who is the
// only peer allowed to publish its record; others ask the leader to join/leave.
// Once started, the team moves to its own room scope and drops out of the lobby list.
// A team can be password-protected: only the leader knows the password, joiners send a
// salted hash of what they typed, and the room itself is joined with the password.

export const MAX_TEAM_SIZE = 5;

const id = z.string().min(1).max(64);

export const teamSchema = z.object({
  id,
  roomId: id,
  leader: id,
  members: z.array(id).min(1).max(MAX_TEAM_SIZE),
  status: z.enum(['forming', 'started']),
  startedAt: z.number().finite().nullable(),
  /** Password-protected: joining needs the password the leader set. */
  locked: z.boolean().default(false),
});
export type Team = z.infer<typeof teamSchema>;

/** A started team as seen by a member, with the password needed for its room (if locked). */
export interface StartedTeam {
  team: Team;
  password?: string;
}

export const MIN_PASSWORD_LENGTH = 3;

/** What joiners send instead of the password itself. */
export async function passwordHash(teamId: string, password: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`dser-team|${teamId}|${password}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const teamMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('state'), team: teamSchema }),
  z.object({ type: z.literal('join'), teamId: id, passwordHash: z.string().max(128).optional() }),
  /** Leader -> joiner: wrong password. */
  z.object({ type: z.literal('rejected'), teamId: id }),
  z.object({ type: z.literal('leave'), teamId: id }),
  z.object({ type: z.literal('disband'), teamId: id }),
]);
type TeamMessage = z.infer<typeof teamMessage>;

export function roomScope(roomId: string, teamId: string): string {
  return `room:${roomId}:${teamId}`;
}

export class Teams {
  readonly events = new Emitter<{ teams: readonly Team[]; started: StartedTeam; rejected: { teamId: string } }>();
  /** Passwords of teams we lead or asked to join; never sent anywhere. */
  private readonly passwords = new Map<string, string>();
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

  /** Creates a team; with a password, only players who know it can join. */
  create(roomId: string, password?: string): void {
    this.leave();
    const id = `${this.selfId.slice(0, 12)}-${(this.counter++).toString(36)}-${this.now().toString(36)}`;
    if (password) this.passwords.set(id, password);
    this.publish({ id, roomId, leader: this.selfId, members: [this.selfId], status: 'forming', startedAt: null, locked: !!password });
  }

  /** Asks the leader to join. Locked teams need the password; a wrong one fires `rejected`. */
  async join(teamId: string, password?: string): Promise<void> {
    const team = this.teams.get(teamId);
    if (!team || team.members.includes(this.selfId)) return;
    const hash = team.locked && password ? await passwordHash(teamId, password) : undefined;
    this.leave();
    if (password) this.passwords.set(teamId, password);
    this.channel.send({ type: 'join', teamId, ...(hash ? { passwordHash: hash } : {}) }, [team.leader]);
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
    this.events.emit('started', { team: started, password: this.passwords.get(team.id) });
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
          if (team.members.includes(this.selfId)) this.events.emit('started', { team, password: this.passwords.get(team.id) });
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
        if (!team.locked) {
          this.publish({ ...team, members: [...team.members, from] });
          return;
        }
        const password = this.passwords.get(team.id) ?? '';
        void passwordHash(team.id, password).then((expected) => {
          const current = this.led();
          if (current?.id !== team.id || current.members.includes(from) || current.members.length >= MAX_TEAM_SIZE) return;
          if (msg.passwordHash === expected) this.publish({ ...current, members: [...current.members, from] });
          else this.channel.send({ type: 'rejected', teamId: team.id }, [from]);
        });
        return;
      }
      case 'rejected': {
        if (this.teams.get(msg.teamId)?.leader !== from) return;
        this.passwords.delete(msg.teamId);
        this.events.emit('rejected', { teamId: msg.teamId });
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
