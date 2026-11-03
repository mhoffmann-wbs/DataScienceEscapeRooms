import { Emitter } from '../lib/emitter';
import { CHANNELS, helloSchema, posSchema, type Hello, type Pos } from './protocol';
import type { NetRoom } from './transport';

export interface PeerInfo extends Pos {
  id: string;
  nickname: string;
  avatar: number;
}

interface PresenceEvents {
  'peer:join': PeerInfo;
  'peer:update': PeerInfo;
  'peer:leave': PeerInfo;
  /** The set of peers changed (join/leave); positions alone don't fire this. */
  roster: readonly PeerInfo[];
}

/** Minimum interval between position packets (ms). */
export const POS_INTERVAL_MS = 100;

/**
 * Who is in a NetRoom and where. A peer only appears after its hello arrives,
 * so every PeerInfo has a name, avatar and position.
 */
export class Presence {
  readonly events = new Emitter<PresenceEvents>();
  private readonly peers = new Map<string, PeerInfo>();
  private self: Pos | null = null;
  private lastSent: Pos | null = null;
  private lastSentAt = -Infinity;
  private roster: readonly PeerInfo[] = [];
  private readonly offs: (() => void)[] = [];
  private readonly hello;
  private readonly pos;

  constructor(
    private readonly room: NetRoom,
    private readonly me: { nickname: string; avatar: number },
  ) {
    this.hello = room.channel<Hello>(CHANNELS.hello);
    this.pos = room.channel<Pos>(CHANNELS.pos);

    this.offs.push(
      room.onPeerJoin((id) => {
        // Until our own position is known, the first updateSelf greets everyone.
        if (this.self) this.hello.send(this.helloPayload(this.self), [id]);
      }),
      room.onPeerLeave((id) => this.removePeer(id)),
      this.hello.subscribe((data, from) => {
        const parsed = helloSchema.safeParse(data);
        if (!parsed.success) return;
        const isNew = !this.peers.has(from);
        const info: PeerInfo = { id: from, ...parsed.data };
        this.peers.set(from, info);
        this.events.emit(isNew ? 'peer:join' : 'peer:update', info);
        if (!isNew) return;
        this.publishRoster();
        // Answer a peer's first hello in case ours got lost (e.g. it wasn't listening yet).
        // Bounded: each side treats a peer as new only once.
        if (this.self) this.hello.send(this.helloPayload(this.self), [from]);
      }),
      this.pos.subscribe((data, from) => {
        const parsed = posSchema.safeParse(data);
        const peer = this.peers.get(from);
        if (!parsed.success || !peer) return;
        Object.assign(peer, parsed.data);
        this.events.emit('peer:update', peer);
      }),
    );
  }

  get selfId(): string {
    return this.room.selfId;
  }

  get selfPos(): Pos | null {
    return this.self;
  }

  /** Called every frame by the scene; sends at most every POS_INTERVAL_MS and only on change. */
  updateSelf(state: Pos, now: number): void {
    const first = this.self === null;
    this.self = { ...state };
    if (first) {
      this.hello.send(this.helloPayload(state));
      this.markSent(state, now);
      return;
    }
    if (now - this.lastSentAt < POS_INTERVAL_MS || !changed(this.lastSent, state)) return;
    this.pos.send(state);
    this.markSent(state, now);
  }

  get(id: string): PeerInfo | undefined {
    return this.peers.get(id);
  }

  /** Stable snapshot that only changes on join/leave (for React's useSyncExternalStore). */
  list(): readonly PeerInfo[] {
    return this.roster;
  }

  /** Peers within `radius` pixels of our own position. */
  within(radius: number): string[] {
    const self = this.self;
    if (!self) return [];
    const r2 = radius * radius;
    return [...this.peers.values()].filter((p) => (p.x - self.x) ** 2 + (p.y - self.y) ** 2 <= r2).map((p) => p.id);
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.events.clear();
  }

  private helloPayload(pos: Pos): Hello {
    return { ...pos, nickname: this.me.nickname, avatar: this.me.avatar };
  }

  private markSent(state: Pos, now: number): void {
    this.lastSent = { ...state };
    this.lastSentAt = now;
  }

  private removePeer(id: string): void {
    const peer = this.peers.get(id);
    if (!peer) return;
    this.peers.delete(id);
    this.events.emit('peer:leave', peer);
    this.publishRoster();
  }

  private publishRoster(): void {
    this.roster = [...this.peers.values()].map((p) => ({ ...p }));
    this.events.emit('roster', this.roster);
  }
}

function changed(a: Pos | null, b: Pos): boolean {
  return !a || a.dir !== b.dir || a.moving !== b.moving || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5;
}
