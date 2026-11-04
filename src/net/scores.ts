import { z } from 'zod';
import { Emitter } from '../lib/emitter';
import type { RunSummary, Runs } from './runs';
import type { NetRoom } from './transport';

// The lobby scoreboard: finished runs, gossiped between players' browsers and kept in
// localStorage. Not cheat-proof (anyone can send a result), and the UI says so. Results
// merge by team and epoch, keeping the earliest escape.

const MAX_RESULTS = 300;
const MAX_AGE_MS = 60 * 24 * 3600_000;
const STORAGE_KEY = 'dser.scores';

export const resultSchema = z.object({
  teamId: z.string().min(1).max(64),
  epoch: z.number().finite(),
  roomId: z.string().min(1).max(64),
  leader: z.string().max(20),
  group: z.string().max(24).nullable(),
  members: z.array(z.string().max(20)).max(10),
  startedAt: z.number().finite(),
  escapedAt: z.number().finite(),
  hints: z.number().int().min(0).max(1000),
});
export type Result = z.infer<typeof resultSchema>;

const resultsSchema = z.array(resultSchema).max(MAX_RESULTS);
const idOf = (r: Result) => `${r.teamId}@${r.epoch}`;
/** Escape times outside this range are not plausible results. */
const plausible = (r: Result) => r.escapedAt - r.startedAt > 30_000 && r.escapedAt - r.startedAt < 12 * 3600_000;

/** A finished run's result, from its live summary. */
export function resultOf(s: RunSummary): Result | null {
  if (s.escapedAt === null || s.startedAt === null) return null;
  const hints = Object.values(s.hints).reduce((a, b) => a + b, 0);
  return { teamId: s.teamId, epoch: s.epoch, roomId: s.roomId, leader: s.leader, group: s.group, members: s.members, startedAt: s.startedAt, escapedAt: s.escapedAt, hints };
}

export class Scores {
  readonly events = new Emitter<{ results: readonly Result[] }>();
  private readonly results = new Map<string, Result>();
  private snapshot: readonly Result[] = [];
  private readonly channel;
  private readonly offs: (() => void)[];

  constructor(
    room: NetRoom,
    runs: Runs,
    private readonly now: () => number = Date.now,
  ) {
    this.load();
    this.channel = room.channel<Result[]>('scores');
    this.offs = [
      room.onPeerJoin((id) => this.results.size && this.channel.send([...this.results.values()], [id])),
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
      if (!plausible(r) || this.now() - r.escapedAt > MAX_AGE_MS) continue;
      const known = this.results.get(idOf(r));
      if (known && known.escapedAt <= r.escapedAt) continue;
      this.results.set(idOf(r), r);
      changed = true;
    }
    if (!changed) return;
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
      const parsed = resultsSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
      if (parsed.success) this.add(parsed.data);
    } catch {
      // corrupt or unavailable storage counts as empty
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.results.values()]));
    } catch {
      // the scoreboard still works for this visit
    }
  }
}
