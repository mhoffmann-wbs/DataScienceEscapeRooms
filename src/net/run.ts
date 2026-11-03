import { z } from 'zod';
import { Emitter } from '../lib/emitter';
import type { NetRoom } from './transport';

// Shared progress of one team in one room. It converges without a leader:
// every field is "earliest timestamp wins", so merging is commutative,
// associative and idempotent, and peers can exchange full states in any order.

const key = z.string().min(1).max(64);
const timestamps = z.record(key, z.number().finite()).refine((r) => Object.keys(r).length <= 200);

export const runStateSchema = z.object({
  startedAt: z.number().finite().nullable(),
  /** puzzleId -> when it was first solved */
  solved: timestamps,
  /** `${puzzleId}#${tier}` -> when that hint was first revealed */
  hints: timestamps,
});
export type RunState = z.infer<typeof runStateSchema>;

export const emptyRun = (startedAt: number | null = null): RunState => ({ startedAt, solved: {}, hints: {} });

const minOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

function mergeTimes(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, t] of Object.entries(b)) out[k] = k in out ? Math.min(out[k]!, t) : t;
  return out;
}

export function mergeRun(a: RunState, b: RunState): RunState {
  return { startedAt: minOf(a.startedAt, b.startedAt), solved: mergeTimes(a.solved, b.solved), hints: mergeTimes(a.hints, b.hints) };
}

export function sameRun(a: RunState, b: RunState): boolean {
  const same = (x: Record<string, number>, y: Record<string, number>) =>
    Object.keys(x).length === Object.keys(y).length && Object.entries(x).every(([k, t]) => y[k] === t);
  return a.startedAt === b.startedAt && same(a.solved, b.solved) && same(a.hints, b.hints);
}

export const hintKey = (puzzleId: string, tier: number) => `${puzzleId}#${tier}`;

/** Keeps a RunState in sync across a team's NetRoom by exchanging full states. */
export class RunSync {
  readonly events = new Emitter<{ state: RunState }>();
  private current: RunState;
  private readonly offs: (() => void)[];
  private readonly channel;

  constructor(
    room: NetRoom,
    initial: RunState,
    private readonly now: () => number = Date.now,
  ) {
    this.current = initial;
    this.channel = room.channel<RunState>('run');
    this.offs = [
      room.onPeerJoin((id) => this.channel.send(this.current, [id])),
      this.channel.subscribe((data) => {
        const parsed = runStateSchema.safeParse(data);
        if (parsed.success) this.apply(parsed.data, false);
      }),
    ];
  }

  get state(): RunState {
    return this.current;
  }

  markSolved(puzzleId: string): void {
    this.apply({ ...emptyRun(), solved: { [puzzleId]: this.now() } }, true);
  }

  revealHint(puzzleId: string, tier: number): void {
    this.apply({ ...emptyRun(), hints: { [hintKey(puzzleId, tier)]: this.now() } }, true);
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.events.clear();
  }

  private apply(incoming: RunState, local: boolean): void {
    const merged = mergeRun(this.current, incoming);
    if (sameRun(merged, this.current)) return;
    this.current = merged;
    this.events.emit('state', merged);
    // Peers only need to hear about our own changes; merged remote news reaches
    // them from its origin. A full state also repairs anything they missed.
    if (local) this.channel.send(merged);
  }
}
