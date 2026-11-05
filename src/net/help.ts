import { z } from 'zod';
import { Emitter } from '../lib/emitter';
import type { InstructorChannel } from './instructor';
import type { RunInfo } from './session';
import type { NetRoom } from './transport';

// Calling the instructor, and instructor visits, over the lobby. A student in a room can call
// the instructor; the instructor panel lists the calls. To visit a team, the instructor sends a
// signed `visit` naming their own lobby peer, and the team's members answer that peer, and only
// that peer, with an invite carrying the room's password (if any), so private rooms stay private.
// Calls and invites aren't signed: a student can fake a call, and a lobby peer could send the
// instructor a bogus invite, which only leads into an empty room.

const key = z.string().min(1).max(64);
const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('call'), teamId: key, roomId: key, at: z.number().finite() }),
  z.object({ type: z.literal('cancel') }),
  z.object({
    type: z.literal('invite'),
    teamId: key,
    roomId: key,
    password: z.string().max(200).nullable(),
    leader: z.string().max(20).nullable(),
    group: z.string().max(24).nullable(),
  }),
]);
type HelpMessage = z.infer<typeof messageSchema>;

/** A team asking for the instructor; `at` is when its first member called. */
export interface HelpCall {
  teamId: string;
  roomId: string;
  at: number;
}
export type Invite = Extract<HelpMessage, { type: 'invite' }>;

/** How long the instructor waits for a team member to answer a visit. */
export const VISIT_TIMEOUT_MS = 10_000;

export class HelpDesk {
  readonly events = new Emitter<{ calls: readonly HelpCall[]; calling: boolean }>();
  /** peerId -> that peer's call (one per peer). */
  private readonly calls = new Map<string, HelpCall>();
  private snapshot: readonly HelpCall[] = [];
  /** The room we're playing in, if any: we answer visits to it. */
  private playing: RunInfo | null = null;
  private mine: HelpCall | null = null;
  /** Lobby peers that visit rooms as instructor (from signed visits). */
  private readonly visitors = new Set<string>();
  /** Visits we're waiting on, by teamId. */
  private readonly waiting = new Map<string, (invite: Invite) => void>();
  private readonly channel;
  private readonly offs: (() => void)[];

  constructor(
    private readonly room: NetRoom,
    private readonly instructor: InstructorChannel,
    private readonly now: () => number = Date.now,
  ) {
    this.channel = room.channel<HelpMessage>('help');
    this.offs = [
      room.onPeerJoin((id) => this.mine && this.channel.send({ type: 'call', ...this.mine }, [id])),
      room.onPeerLeave((id) => this.calls.delete(id) && this.emit()),
      this.channel.subscribe((data, from) => {
        const parsed = messageSchema.safeParse(data);
        if (!parsed.success) return;
        const msg = parsed.data;
        if (msg.type === 'call') {
          this.calls.set(from, { teamId: msg.teamId, roomId: msg.roomId, at: msg.at });
          this.emit();
        } else if (msg.type === 'cancel') {
          if (this.calls.delete(from)) this.emit();
        } else this.waiting.get(msg.teamId)?.(msg);
      }),
      instructor.events.on('visit', ({ teamId, peerId }) => {
        this.visitors.add(peerId);
        // The instructor is on the way: the team's calls are answered.
        let changed = false;
        for (const [id, call] of this.calls) if (call.teamId === teamId) changed = this.calls.delete(id) || changed;
        if (changed) this.emit();
        if (this.playing?.teamId !== teamId) return;
        if (this.mine) {
          this.mine = null;
          this.events.emit('calling', false);
        }
        if (peerId === room.selfId) return;
        const { roomId, password, leader, group } = this.playing;
        this.channel.send({ type: 'invite', teamId, roomId, password: password ?? null, leader: leader ?? null, group: group ?? null }, [peerId]);
      }),
    ];
  }

  /** The run we're playing (null: none, or solo), so we can call and answer visits. */
  setPlaying(info: RunInfo | null): void {
    if (this.playing && info?.teamId !== this.playing.teamId) this.cancel();
    this.playing = info;
  }

  /** Asks the instructor to come to our room. */
  call(): void {
    if (!this.playing || this.mine) return;
    this.mine = { teamId: this.playing.teamId, roomId: this.playing.roomId, at: this.now() };
    this.calls.set(this.room.selfId, this.mine);
    this.channel.send({ type: 'call', ...this.mine });
    this.events.emit('calling', true);
    this.emit();
  }

  cancel(): void {
    if (!this.mine) return;
    this.mine = null;
    this.calls.delete(this.room.selfId);
    this.channel.send({ type: 'cancel' });
    this.events.emit('calling', false);
    this.emit();
  }

  calling(): boolean {
    return this.mine !== null;
  }

  /** Teams calling right now, one entry each, longest waiting first. Stable between changes. */
  list(): readonly HelpCall[] {
    return this.snapshot;
  }

  /** Whether a peer is a visiting instructor (peer ids are the same in the lobby and in rooms). */
  isVisitor(peerId: string): boolean {
    return this.visitors.has(peerId);
  }

  /**
   * Instructor: asks a team to let us into its room. Resolves with the first member's invite,
   * or null if nobody answers within VISIT_TIMEOUT_MS.
   */
  visit(signingKey: CryptoKey, teamId: string): Promise<Invite | null> {
    const invite = new Promise<Invite | null>((resolve) => {
      const done = (inv: Invite | null) => {
        clearTimeout(timer);
        // A repeated visit to the same team replaces this wait; leave that one alone.
        if (this.waiting.get(teamId) === done) this.waiting.delete(teamId);
        resolve(inv);
      };
      const timer = setTimeout(() => done(null), VISIT_TIMEOUT_MS);
      this.waiting.set(teamId, done);
    });
    void this.instructor.send(signingKey, { type: 'visit', teamId, peerId: this.room.selfId });
    return invite;
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.events.clear();
  }

  private emit(): void {
    const byTeam = new Map<string, HelpCall>();
    for (const call of this.calls.values()) {
      const seen = byTeam.get(call.teamId);
      if (!seen || call.at < seen.at) byTeam.set(call.teamId, call);
    }
    this.snapshot = [...byTeam.values()].sort((a, b) => a.at - b.at);
    this.events.emit('calls', this.snapshot);
  }
}
