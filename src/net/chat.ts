import { Emitter } from '../lib/emitter';
import type { Presence } from './presence';
import { CHANNELS, chatSchema, type ChatPayload, type ChatScope } from './protocol';
import type { NetRoom } from './transport';

export type ChatEntry =
  | { kind: 'message'; id: number; from: string; nickname: string; text: string; scope: ChatScope; self: boolean; at: number }
  | { kind: 'joined' | 'left'; id: number; nickname: string; at: number }
  | { kind: 'nobodyNearby'; id: number; at: number };

const MAX_ENTRIES = 200;

/** Chat for one NetRoom: everyone in it, or only peers within `nearbyRadius` of us. */
export class Chat {
  readonly events = new Emitter<{ entries: readonly ChatEntry[] }>();
  private entries: readonly ChatEntry[] = [];
  private nextId = 1;
  private readonly offs: (() => void)[] = [];
  private readonly channel;

  constructor(
    room: NetRoom,
    private readonly presence: Presence,
    private readonly me: { nickname: string },
    private readonly nearbyRadius: number,
    private readonly now: () => number = Date.now,
  ) {
    this.channel = room.channel<ChatPayload>(CHANNELS.chat);
    this.offs.push(
      this.channel.subscribe((data, from) => {
        const parsed = chatSchema.safeParse(data);
        const sender = presence.get(from);
        // Messages from peers we haven't been introduced to are dropped.
        if (!parsed.success || !sender) return;
        this.push({ kind: 'message', from, nickname: sender.nickname, ...parsed.data, self: false });
      }),
      presence.events.on('peer:join', (p) => this.push({ kind: 'joined', nickname: p.nickname })),
      presence.events.on('peer:leave', (p) => this.push({ kind: 'left', nickname: p.nickname })),
    );
  }

  /** Returns false if the text was empty or too long. */
  send(text: string, scope: ChatScope): boolean {
    const parsed = chatSchema.safeParse({ text, scope });
    if (!parsed.success) return false;
    const to = scope === 'nearby' ? this.presence.within(this.nearbyRadius) : undefined;
    this.channel.send(parsed.data, to);
    this.push({ kind: 'message', from: this.presence.selfId, nickname: this.me.nickname, ...parsed.data, self: true });
    if (to?.length === 0) this.push({ kind: 'nobodyNearby' });
    return true;
  }

  list(): readonly ChatEntry[] {
    return this.entries;
  }

  destroy(): void {
    this.offs.forEach((off) => off());
    this.events.clear();
  }

  private push(entry: DistributiveOmit<ChatEntry, 'id' | 'at'>): void {
    const full = { ...entry, id: this.nextId++, at: this.now() } as ChatEntry;
    this.entries = [...this.entries, full].slice(-MAX_ENTRIES);
    this.events.emit('entries', this.entries);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
