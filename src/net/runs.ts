import { z } from 'zod';
import { Emitter } from '../lib/emitter';
import type { NetRoom } from './transport';

// Live summaries of the runs being played, shared in the lobby: every member of a team
// in a room publishes its run's summary (they converge, since the run state does). The
// scoreboard and the instructor view read them. Not authoritative: peers can lie.
// Runs a team's creator ended are announced too, and every lobby peer passes the list on
// to newcomers (earliest time per team wins), so teammates who were away learn of it.

const key = z.string().min(1).max(64);
const counts = z.record(key, z.number().int().min(0).max(10_000)).refine((r) => Object.keys(r).length <= 60);

export const runSummarySchema = z.object({
  teamId: key,
  roomId: key,
  /** The leader's nickname; the UI shows "<leader>'s team". */
  leader: z.string().max(20),
  group: z.string().max(24).nullable(),
  members: z.array(z.string().max(20)).max(10),
  /** Players who joined the run but aren't in the room any more (older clients omit it). */
  left: z.array(z.string().max(20)).max(20).optional(),
  /** The members' peer ids, so an instructor can find a player's team (older clients omit it). */
  peers: z.array(key).max(10).optional(),
  /** Bumped when an instructor resets the run. */
  epoch: z.number().finite(),
  startedAt: z.number().finite().nullable(),
  /** puzzleId -> when solved */
  solved: z.record(key, z.number().finite()).refine((r) => Object.keys(r).length <= 60),
  /** puzzleId -> hints revealed */
  hints: counts,
  /** puzzleId -> failed checks, summed over players */
  attempts: counts,
  escapedAt: z.number().finite().nullable(),
  /** Sender's clock; the newest summary of a team wins. */
  at: z.number().finite(),
});
export type RunSummary = z.infer<typeof runSummarySchema>;

/** Ended runs remembered; the oldest are forgotten first. */
const MAX_ENDED = 200;

const messageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('summary'), summary: runSummarySchema }),
  z.object({ type: z.literal('withdraw'), teamId: key }),
  z.object({ type: z.literal('ended'), ended: z.record(key, z.number().finite()).refine((r) => Object.keys(r).length <= MAX_ENDED) }),
]);
type RunsMessage = z.infer<typeof messageSchema>;

export class Runs {
  readonly events = new Emitter<{ runs: readonly RunSummary[]; ended: ReadonlyMap<string, number> }>();
  /** teamId -> when its run was ended. */
  private readonly endedRuns = new Map<string, number>();
  /** teamId -> newest summary, and which peers (or we) currently report it. */
  private readonly runs = new Map<string, { summary: RunSummary; reporters: Set<string> }>();
  private mine: RunSummary | null = null;
  private snapshot: readonly RunSummary[] = [];
  private readonly channel;
  private readonly offs: (() => void)[];

  constructor(private readonly room: NetRoom) {
    this.channel = room.channel<RunsMessage>('runs');
    this.offs = [
      room.onPeerJoin((id) => {
        if (this.mine) this.channel.send({ type: 'summary', summary: this.mine }, [id]);
        if (this.endedRuns.size) this.channel.send({ type: 'ended', ended: Object.fromEntries(this.endedRuns) }, [id]);
      }),
      room.onPeerLeave((id) => this.dropReporter(id)),
      this.channel.subscribe((data, from) => {
        const parsed = messageSchema.safeParse(data);
        if (!parsed.success) return;
        if (parsed.data.type === 'summary') this.store(parsed.data.summary, from);
        else if (parsed.data.type === 'ended') this.storeEnded(parsed.data.ended);
        else this.dropReporter(from, parsed.data.teamId);
      }),
    ];
  }

  /** Publishes (or updates) the summary of the run we are playing. */
  publish(summary: RunSummary): void {
    if (this.mine && this.mine.teamId !== summary.teamId) this.withdraw();
    this.mine = summary;
    this.store(summary, this.room.selfId);
    this.channel.send({ type: 'summary', summary });
  }

  /** We stopped playing that run (left the room). */
  withdraw(): void {
    if (!this.mine) return;
    const { teamId } = this.mine;
    this.mine = null;
    this.channel.send({ type: 'withdraw', teamId });
    this.dropReporter(this.room.selfId, teamId);
  }

  /** Announces that this team's run was ended for good (by its creator). */
  end(teamId: string, at = Date.now()): void {
    this.storeEnded({ [teamId]: at });
    this.channel.send({ type: 'ended', ended: { [teamId]: at } });
  }

  /** Whether this team's run was ended. */
  isEnded(teamId: string): boolean {
    return this.endedRuns.has(teamId);
  }

  /** Runs being played right now, oldest first. Stable between changes. */
  list(): readonly RunSummary[] {
    return this.snapshot;
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.events.clear();
  }

  private storeEnded(ended: Record<string, number>): void {
    let changed = false;
    for (const [teamId, at] of Object.entries(ended)) {
      const known = this.endedRuns.get(teamId);
      if (known !== undefined && known <= at) continue;
      this.endedRuns.set(teamId, at);
      changed = true;
    }
    if (!changed) return;
    while (this.endedRuns.size > MAX_ENDED) {
      const oldest = [...this.endedRuns].reduce((a, b) => (b[1] < a[1] ? b : a));
      this.endedRuns.delete(oldest[0]);
    }
    this.events.emit('ended', this.endedRuns);
  }

  private store(summary: RunSummary, from: string): void {
    const entry = this.runs.get(summary.teamId);
    if (!entry) this.runs.set(summary.teamId, { summary, reporters: new Set([from]) });
    else {
      entry.reporters.add(from);
      if (summary.at >= entry.summary.at) entry.summary = summary;
    }
    this.emit();
  }

  private dropReporter(peerId: string, teamId?: string): void {
    let changed = false;
    for (const [id, entry] of this.runs) {
      if (teamId !== undefined && id !== teamId) continue;
      if (entry.reporters.delete(peerId) && entry.reporters.size === 0) {
        this.runs.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  private emit(): void {
    this.snapshot = [...this.runs.values()].map((e) => e.summary).sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
    this.events.emit('runs', this.snapshot);
  }
}
