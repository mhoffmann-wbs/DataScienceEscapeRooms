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
const nickname = z.string().min(1).max(20);

export const runStateSchema = z.object({
  /** 0 until an instructor resets the run; the reset's timestamp afterwards. */
  epoch: z.number().finite().default(0),
  startedAt: z.number().finite().nullable(),
  /** puzzleId -> when it was first solved */
  solved: timestamps,
  /** `${puzzleId}#${tier}` -> when that hint was first revealed */
  hints: timestamps,
  /** puzzleId -> when its code lock was first opened */
  unlocked: timestamps.default({}),
  /** `${puzzleId}|${peerId}` -> failed checks by that player (only they increase it) */
  attempts: z
    .record(attemptKeySchema, z.number().int().min(0).max(100_000))
    .refine((r) => Object.keys(r).length <= 500)
    .default({}),
  /** nickname -> when they first joined, so a result can list players who left before the escape */
  players: z
    .record(nickname, z.number().finite())
    .refine((r) => Object.keys(r).length <= 30)
    .default({}),
  /** When the team's creator ended the run early (earliest wins); null while it is open. */
  endedAt: z.number().finite().nullable().default(null),
});
export type RunState = z.infer<typeof runStateSchema>;

export const emptyRun = (startedAt: number | null = null, epoch = 0): RunState => ({ epoch, startedAt, solved: {}, hints: {}, unlocked: {}, attempts: {}, players: {}, endedAt: null });

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
    unlocked: mergeTimes(a.unlocked, b.unlocked),
    attempts: mergeCounts(a.attempts, b.attempts),
    players: mergeTimes(a.players, b.players),
    endedAt: minOf(a.endedAt, b.endedAt),
  };
}

export function sameRun(a: RunState, b: RunState): boolean {
  const same = (x: Record<string, number>, y: Record<string, number>) =>
    Object.keys(x).length === Object.keys(y).length && Object.entries(x).every(([k, t]) => y[k] === t);
  return a.epoch === b.epoch && a.startedAt === b.startedAt && a.endedAt === b.endedAt && same(a.solved, b.solved) && same(a.hints, b.hints) && same(a.unlocked, b.unlocked) && same(a.attempts, b.attempts) && same(a.players, b.players);
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

  /** Opens a puzzle's code lock for the whole team. */
  unlock(puzzleId: string): void {
    this.apply({ ...emptyRun(), epoch: this.current.epoch, unlocked: { [puzzleId]: this.now() } }, true);
  }

  revealHint(puzzleId: string, tier: number): void {
    this.apply({ ...emptyRun(), epoch: this.current.epoch, hints: { [hintKey(puzzleId, tier)]: this.now() } }, true);
  }

  /** A failed check by the local player (for instructors spotting puzzles that are too hard). */
  recordAttempt(puzzleId: string): void {
    const key = attemptKey(puzzleId, this.room.selfId);
    this.apply({ ...emptyRun(), epoch: this.current.epoch, attempts: { [key]: (this.current.attempts[key] ?? 0) + 1 } }, true);
  }

  /** Records that this player plays the run (once; the earliest time wins). */
  join(nickname: string): void {
    if (nickname in this.current.players) return;
    this.apply({ ...emptyRun(), epoch: this.current.epoch, players: { [nickname]: this.now() } }, true);
  }

  /** Ends the run for the whole team (its creator leaving for good). */
  end(): void {
    this.apply({ ...emptyRun(), epoch: this.current.epoch, endedAt: this.now() }, true);
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
