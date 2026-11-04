import { Emitter } from '../lib/emitter';
import type { Presence } from './presence';
import { avStateSchema, CHANNELS, type AvState } from './protocol';
import type { Proximity } from './proximity';
import type { NetRoom } from './transport';

/** 'proximity': stream to peers near us (lobby). 'team': stream to everyone (a team's room). */
export type MediaMode = 'proximity' | 'team';

/** A linked peer whose stream hasn't arrived after this long is reported as failed (blocked network). */
export const CONNECT_TIMEOUT_MS = 15_000;
/** Streams arriving slightly before a link is noticed locally still count for it. */
const LINK_GRACE_MS = 5_000;
export const MEDIA_TICK_MS = 500;

export interface LocalAv {
  /** null: listening only (no microphone available). */
  stream: MediaStream | null;
  mic: boolean;
  cam: boolean;
}

export interface RemoteMedia {
  peerId: string;
  /** null until their stream arrives. */
  stream: MediaStream | null;
  mic: boolean;
  cam: boolean;
  /** Linked for a while, but their stream never arrived. */
  failed: boolean;
}

const OFF: AvState = { on: false, sending: false, mic: false, cam: false };

/**
 * Who we exchange voice/video with. Each peer decides for itself whom to send its stream to
 * (peers near it that have A/V on) and which received streams to play (peers near it), so no
 * coordination is needed; hysteresis in Proximity keeps both sides from flapping at the edge.
 */
export class Media {
  readonly events = new Emitter<{ remotes: readonly RemoteMedia[] }>();
  private local: LocalAv | null = null;
  private readonly states = new Map<string, AvState>();
  private readonly streams = new Map<string, { stream: MediaStream; at: number }>();
  private near = new Set<string>();
  /** Peers our stream currently goes to. */
  private readonly links = new Set<string>();
  /** Since when each shown peer has been near and sending to us. */
  private readonly linkedSince = new Map<string, number>();
  private remotes: readonly RemoteMedia[] = [];
  private readonly channel;
  private readonly offs: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;
  private tickAgain = false;

  constructor(
    private readonly room: NetRoom,
    private readonly presence: Presence,
    private readonly proximity: Proximity,
    private readonly mode: MediaMode,
    private readonly opts: { now?: () => number; tickMs?: number } = {},
  ) {
    this.channel = room.channel<AvState>(CHANNELS.av);
    this.offs.push(
      this.channel.subscribe((data, from) => {
        const parsed = avStateSchema.safeParse(data);
        if (!parsed.success) return;
        this.states.set(from, parsed.data);
        this.tick();
      }),
      room.onPeerJoin((id) => this.channel.send(this.ownState(), [id])),
      room.onPeerLeave((id) => {
        this.states.delete(id);
        this.streams.delete(id);
        this.links.delete(id);
        this.near.delete(id);
        this.tick();
      }),
      room.onPeerStream((stream, peerId) => {
        this.streams.set(peerId, { stream, at: this.now() });
        this.tick();
      }),
    );
  }

  /** Joins A/V with a local stream (or listen-only), updates mic/cam, or leaves with null. */
  setLocal(local: LocalAv | null): void {
    const oldStream = this.local?.stream ?? null;
    if (oldStream && oldStream !== local?.stream) {
      this.room.stopStream(oldStream, [...this.links]);
      this.links.clear();
    }
    this.local = local;
    this.channel.send(this.ownState());
    const tickMs = this.opts.tickMs ?? MEDIA_TICK_MS;
    if (local && !this.timer && tickMs > 0) this.timer = setInterval(() => this.tick(), tickMs);
    if (!local && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.tick();
  }

  /** Re-evaluates links; runs on a timer while A/V is on, since positions change constantly. */
  tick(): void {
    // Sending can synchronously trigger events that tick again; finish this pass, then repeat once.
    if (this.ticking) {
      this.tickAgain = true;
      return;
    }
    this.ticking = true;
    try {
      do {
        this.tickAgain = false;
        this.evaluate();
      } while (this.tickAgain);
    } finally {
      this.ticking = false;
    }
  }

  private evaluate(): void {
    const local = this.local;
    if (!local) {
      this.near.clear();
      this.linkedSince.clear();
      this.publish([]);
      return;
    }
    const ids = this.mode === 'team' ? this.presence.list().map((p) => p.id) : this.presence.nearby(this.proximity, this.near);
    this.near = new Set(ids);

    const wanted = local.stream ? ids.filter((id) => this.states.get(id)?.on) : [];
    const add = wanted.filter((id) => !this.links.has(id));
    const remove = [...this.links].filter((id) => !wanted.includes(id));
    add.forEach((id) => this.links.add(id));
    remove.forEach((id) => this.links.delete(id));
    if (local.stream && add.length) this.room.sendStream(local.stream, add);
    if (local.stream && remove.length) this.room.stopStream(local.stream, remove);

    const now = this.now();
    const shown: RemoteMedia[] = [];
    for (const id of ids) {
      const state = this.states.get(id) ?? OFF;
      if (!state.on) {
        this.linkedSince.delete(id);
        continue;
      }
      const received = this.streams.get(id);
      let failed = false;
      if (state.sending) {
        const since = this.linkedSince.get(id) ?? now;
        this.linkedSince.set(id, since);
        const arrived = received !== undefined && received.at >= since - LINK_GRACE_MS;
        failed = !arrived && now - since > CONNECT_TIMEOUT_MS;
      } else this.linkedSince.delete(id);
      shown.push({ peerId: id, stream: state.sending ? (received?.stream ?? null) : null, mic: state.mic, cam: state.cam, failed });
    }
    for (const id of this.linkedSince.keys()) if (!this.near.has(id)) this.linkedSince.delete(id);
    this.publish(shown);
  }

  /** Peers we see and hear right now (near us, with A/V on). */
  list(): readonly RemoteMedia[] {
    return this.remotes;
  }

  /** Peers our stream is being sent to (for tests and diagnostics). */
  sendingTo(): string[] {
    return [...this.links];
  }

  destroy(): void {
    if (this.local?.stream) this.room.stopStream(this.local.stream, [...this.links]);
    if (this.timer) clearInterval(this.timer);
    this.offs.forEach((off) => off());
    this.events.clear();
  }

  private ownState(): AvState {
    const l = this.local;
    return l ? { on: true, sending: l.stream !== null, mic: l.mic, cam: l.cam } : OFF;
  }

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  private publish(next: RemoteMedia[]): void {
    const same =
      next.length === this.remotes.length &&
      next.every((r, i) => {
        const o = this.remotes[i]!;
        return o.peerId === r.peerId && o.stream === r.stream && o.mic === r.mic && o.cam === r.cam && o.failed === r.failed;
      });
    if (same) return;
    this.remotes = next;
    this.events.emit('remotes', next);
  }
}
