import { z } from 'zod';
import { Emitter } from '../lib/emitter';
import type { NetRoom } from './transport';

// Shared progress of one team in one room. It converges without a leader:
// timestamps are "earliest wins", attempt counters "highest wins", and a state with a
// higher epoch (an instructor reset) replaces a lower one outright. So merging is
// commutative, associative and idempotent, and peers can exchange full states in any order.

const key = z.string().min(1).max(64);
const timestamps = z.record(key, z.number().finite()).refine((r) => Object.keys(r).length <= 200);

const attemptKeySchema = z.string().min(1).max(120);

export const runStateSchema = z.object({
  /** 0 until an instructor resets the run; the reset's timestamp afterwards. */
  epoch: z.number().finite().default(0),
  startedAt: z.number().finite().nullable(),
  /** puzzleId -> when it was first solved */
  solved: timestamps,
  /** `${puzzleId}#${tier}` -> when that hint was first revealed */
  hints: timestamps,
  /** `${puzzleId}|${peerId}` -> failed checks by that player (only they increase it) */
  attempts: z
    .record(attemptKeySchema, z.number().int().min(0).max(100_000))
    .refine((r) => Object.keys(r).length <= 500)
    .default({}),
});
export type RunState = z.infer<typeof runStateSchema>;

export const emptyRun = (startedAt: number | null = null, epoch = 0): RunState => ({ epoch, startedAt, solved: {}, hints: {}, attempts: {} });

const minOf = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));

function mergeTimes(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, t] of Object.entries(b)) out[k] = k in out ? Math.min(out[k]!, t) : t;
  return out;
}

function mergeCounts(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a };
  for (const [k, n] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, n);
  return out;
}

export function mergeRun(a: RunState, b: RunState): RunState {
  // A reset starts a new epoch; everything from older epochs is dropped.
  if (a.epoch !== b.epoch) return a.epoch > b.epoch ? a : b;
  return {
    epoch: a.epoch,
    startedAt: minOf(a.startedAt, b.startedAt),
    solved: mergeTimes(a.solved, b.solved),
    hints: mergeTimes(a.hints, b.hints),
    attempts: mergeCounts(a.attempts, b.attempts),
  };
}

export function sameRun(a: RunState, b: RunState): boolean {
  const same = (x: Record<string, number>, y: Record<string, number>) =>
    Object.keys(x).length === Object.keys(y).length && Object.entries(x).every(([k, t]) => y[k] === t);
  return a.epoch === b.epoch && a.startedAt === b.startedAt && same(a.solved, b.solved) && same(a.hints, b.hints) && same(a.attempts, b.attempts);
}

export const hintKey = (puzzleId: string, tier: number) => `${puzzleId}#${tier}`;
export const attemptKey = (puzzleId: string, peerId: string) => `${puzzleId}|${peerId}`;

/** Failed checks per puzzle, summed over players. */
export function attemptsPerPuzzle(state: RunState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(state.attempts)) {
    const puzzleId = key.slice(0, key.lastIndexOf('|'));
    out[puzzleId] = (out[puzzleId] ?? 0) + n;
  }
  return out;
}

/** Keeps a RunState in sync across a team's NetRoom by exchanging full states. */
export class RunSync {
  readonly events = new Emitter<{ state: RunState }>();
  private current: RunState;
  private readonly offs: (() => void)[];
  private readonly channel;

  constructor(
    private readonly room: NetRoom,
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
    this.apply({ ...emptyRun(), epoch: this.current.epoch, solved: { [puzzleId]: this.now() } }, true);
  }

  revealHint(puzzleId: string, tier: number): void {
    this.apply({ ...emptyRun(), epoch: this.current.epoch, hints: { [hintKey(puzzleId, tier)]: this.now() } }, true);
  }

  /** A failed check by the local player (for instructors spotting puzzles that are too hard). */
  recordAttempt(puzzleId: string): void {
    const key = attemptKey(puzzleId, this.room.selfId);
    this.apply({ ...emptyRun(), epoch: this.current.epoch, attempts: { [key]: (this.current.attempts[key] ?? 0) + 1 } }, true);
  }

  /** Starts the run over (instructor reset): a new, higher epoch replaces all progress. */
  reset(epoch: number): void {
    if (epoch <= this.current.epoch) return;
    this.apply(emptyRun(this.now(), epoch), true);
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
