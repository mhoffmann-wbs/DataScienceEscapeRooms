import { z } from 'zod';
import { Emitter } from '../lib/emitter';
import type { NetRoom } from './transport';

// Live, read-only view of teammates' editors: whoever has a puzzle open broadcasts its code
// (throttled), so others can watch and copy it. Not co-editing; each player keeps their own draft.

export const MAX_SHARED_CODE = 20_000;
export const CODE_THROTTLE_MS = 300;

/** `code: null` means the sender closed that puzzle. */
const codeSchema = z.object({ puzzleId: z.string().min(1).max(40), code: z.string().max(MAX_SHARED_CODE).nullable() });
type CodeMessage = z.infer<typeof codeSchema>;

export interface SharedCode {
  peerId: string;
  code: string;
}

export class CodeShare {
  readonly events = new Emitter<{ change: void }>();
  private mine: { puzzleId: string; code: string } | null = null;
  /** peerId -> what they have open. Replaced (not mutated) on change, so it works as a React snapshot. */
  private theirs: ReadonlyMap<string, { puzzleId: string; code: string }> = new Map();
  private lastSent = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly channel;
  private readonly offs: (() => void)[];

  constructor(
    room: NetRoom,
    private readonly opts: { throttleMs?: number; now?: () => number } = {},
  ) {
    this.channel = room.channel<CodeMessage>('code');
    this.offs = [
      room.onPeerJoin((id) => this.mine && this.channel.send(this.mine, [id])),
      room.onPeerLeave((id) => this.drop(id)),
      this.channel.subscribe((data, from) => {
        const parsed = codeSchema.safeParse(data);
        if (!parsed.success) return;
        const { puzzleId, code } = parsed.data;
        if (code === null) {
          if (this.theirs.get(from)?.puzzleId === puzzleId) this.drop(from);
          return;
        }
        this.theirs = new Map(this.theirs).set(from, { puzzleId, code });
        this.events.emit('change', undefined);
      }),
    ];
  }

  /** The local player opened a puzzle's editor. */
  open(puzzleId: string, code: string): void {
    if (this.mine && this.mine.puzzleId !== puzzleId) this.close();
    this.mine = { puzzleId, code };
    this.flush();
  }

  /** The local player typed; sent at most every CODE_THROTTLE_MS, always ending with the latest code. */
  update(code: string): void {
    if (!this.mine) return;
    this.mine = { ...this.mine, code: code.slice(0, MAX_SHARED_CODE) };
    const wait = this.lastSent + (this.opts.throttleMs ?? CODE_THROTTLE_MS) - this.now();
    if (wait <= 0) this.flush();
    else this.timer ??= setTimeout(() => this.flush(), wait);
  }

  close(): void {
    if (!this.mine) return;
    this.clearTimer();
    this.channel.send({ puzzleId: this.mine.puzzleId, code: null });
    this.mine = null;
  }

  /** Stable until something changes (for React). */
  snapshot(): ReadonlyMap<string, { puzzleId: string; code: string }> {
    return this.theirs;
  }

  /** Teammates with this puzzle open, and their current code. */
  working(puzzleId: string): SharedCode[] {
    return [...this.theirs].filter(([, d]) => d.puzzleId === puzzleId).map(([peerId, d]) => ({ peerId, code: d.code }));
  }

  destroy(): void {
    this.close();
    this.offs.forEach((off) => off());
    this.events.clear();
  }

  private flush(): void {
    this.clearTimer();
    if (!this.mine) return;
    this.channel.send(this.mine);
    this.lastSent = this.now();
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private drop(peerId: string): void {
    if (!this.theirs.has(peerId)) return;
    const next = new Map(this.theirs);
    next.delete(peerId);
    this.theirs = next;
    this.events.emit('change', undefined);
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }
}
