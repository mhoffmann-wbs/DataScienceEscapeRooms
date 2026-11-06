import { z } from 'zod';
import { Emitter } from '../lib/emitter';
import { signedSchema, type InstructorChannel, type Signed } from './instructor';
import type { RunSummary, Runs } from './runs';
import type { NetRoom } from './transport';

// The lobby scoreboard: finished runs, gossiped between players' browsers and kept in
// localStorage. Not cheat-proof (anyone can send a result), and the UI says so. Results
// merge by team and epoch, keeping the earliest escape. Instructors can remove results:
// a signed removal deletes the result and is kept as a tombstone, so the result can't come
// back from browsers that missed it; tombstones are relayed to every newcomer.

const MAX_RESULTS = 300;
const MAX_AGE_MS = 60 * 24 * 3600_000;
const STORAGE_KEY = 'dser.scores';
const REMOVED_KEY = 'dser.scores.removed';
const MAX_REMOVED = 300;

export const resultSchema = z.object({
  teamId: z.string().min(1).max(64),
  epoch: z.number().finite(),
  roomId: z.string().min(1).max(64),
  leader: z.string().max(20),
  group: z.string().max(24).nullable(),
  members: z.array(z.string().max(20)).max(10),
  /** Players who left before the escape (older results omit it). */
  left: z.array(z.string().max(20)).max(20).optional(),
  startedAt: z.number().finite(),
  escapedAt: z.number().finite(),
  hints: z.number().int().min(0).max(1000),
});
export type Result = z.infer<typeof resultSchema>;

const resultsSchema = z.array(resultSchema).max(MAX_RESULTS);
const removedSchema = z.array(z.object({ id: z.string(), signed: signedSchema })).max(MAX_REMOVED);
export const idOf = (r: Result) => `${r.teamId}@${r.epoch}`;
/** Escape times outside this range are not plausible results. */
const plausible = (r: Result) => r.escapedAt - r.startedAt > 30_000 && r.escapedAt - r.startedAt < 12 * 3600_000;

/** A finished run's result, from its live summary. */
export function resultOf(s: RunSummary): Result | null {
  if (s.escapedAt === null || s.startedAt === null) return null;
  const hints = Object.values(s.hints).reduce((a, b) => a + b, 0);
  return { teamId: s.teamId, epoch: s.epoch, roomId: s.roomId, leader: s.leader, group: s.group, members: s.members, ...(s.left?.length && { left: s.left }), startedAt: s.startedAt, escapedAt: s.escapedAt, hints };
}

export class Scores {
  readonly events = new Emitter<{ results: readonly Result[] }>();
  private readonly results = new Map<string, Result>();
  /** Removed result ids, with the instructor's signed removal (oldest first). */
  private readonly removed = new Map<string, Signed>();
  private snapshot: readonly Result[] = [];
  private readonly channel;
  private readonly offs: (() => void)[];

  /** `instructor`: where signed removals come from (null: results can't be removed). */
  constructor(
    room: NetRoom,
    runs: Runs,
    instructor: InstructorChannel | null = null,
    private readonly now: () => number = Date.now,
  ) {
    this.load();
    this.channel = room.channel<Result[]>('scores');
    this.offs = [
      room.onPeerJoin((id) => {
        if (this.results.size) this.channel.send([...this.results.values()], [id]);
        for (const signed of this.removed.values()) instructor?.relay(signed, [id]);
      }),
      ...(instructor ? [instructor.events.on('removeScore', ({ id, signed }) => this.remove(id, signed))] : []),
      this.channel.subscribe((data) => {
        const parsed = resultsSchema.safeParse(data);
        if (parsed.success) this.add(parsed.data);
      }),
      runs.events.on('runs', (list) => this.add(list.map(resultOf).filter((r): r is Result => r !== null))),
    ];
    this.add(runs.list().map(resultOf).filter((r): r is Result => r !== null));
  }

  /** All known results, fastest first. Stable between changes. */
  list(): readonly Result[] {
    return this.snapshot;
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.events.clear();
  }

  private add(incoming: readonly Result[]): void {
    let changed = false;
    for (const r of incoming) {
      if (!plausible(r) || this.now() - r.escapedAt > MAX_AGE_MS || this.removed.has(idOf(r))) continue;
      const known = this.results.get(idOf(r));
      if (known && known.escapedAt <= r.escapedAt) continue;
      this.results.set(idOf(r), r);
      changed = true;
    }
    if (changed) this.commit();
  }

  private remove(id: string, signed: Signed): void {
    if (this.removed.has(id)) return;
    this.removed.set(id, signed);
    for (const old of [...this.removed.keys()].slice(0, -MAX_REMOVED)) this.removed.delete(old);
    this.results.delete(id);
    this.commit();
  }

  private commit(): void {
    // Keep the newest MAX_RESULTS.
    const kept = [...this.results.values()].sort((a, b) => b.escapedAt - a.escapedAt).slice(0, MAX_RESULTS);
    this.results.clear();
    kept.forEach((r) => this.results.set(idOf(r), r));
    this.snapshot = [...kept].sort((a, b) => a.escapedAt - a.startedAt - (b.escapedAt - b.startedAt));
    this.save();
    this.events.emit('results', this.snapshot);
  }

  private load(): void {
    try {
      // Our own storage is trusted; others only accept the relayed signatures.
      const removed = removedSchema.safeParse(JSON.parse(localStorage.getItem(REMOVED_KEY) ?? '[]'));
      if (removed.success) removed.data.forEach(({ id, signed }) => this.removed.set(id, signed));
      const parsed = resultsSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
      if (parsed.success) this.add(parsed.data);
    } catch {
      // corrupt or unavailable storage counts as empty
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.results.values()]));
      localStorage.setItem(REMOVED_KEY, JSON.stringify([...this.removed].map(([id, signed]) => ({ id, signed }))));
    } catch {
      // the scoreboard still works for this visit
    }
  }
}
