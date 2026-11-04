import { Emitter } from '../lib/emitter';
import type { Channel, Json, NetRoom, Transport } from './transport';

interface Member {
  id: string;
  deliver(channel: string, data: unknown, from: string): void;
  peerJoined(id: string): void;
  peerLeft(id: string): void;
  receiveStream(stream: MediaStream, from: string): void;
}

/** In-process "network" shared by memory transports; used by tests and solo play. */
export class MemoryHub {
  private scopes = new Map<string, Map<string, Member>>();

  /** @internal */
  add(scope: string, member: Member): void {
    let members = this.scopes.get(scope);
    if (!members) {
      members = new Map();
      this.scopes.set(scope, members);
    }
    const others = [...members.values()];
    // Register first so peers greeting the newcomer can already reach it.
    members.set(member.id, member);
    for (const other of others) {
      member.peerJoined(other.id);
      other.peerJoined(member.id);
    }
  }

  /** @internal */
  remove(scope: string, id: string): void {
    const members = this.scopes.get(scope);
    if (!members?.delete(id)) return;
    for (const other of members.values()) other.peerLeft(id);
  }

  /** @internal Streams are handed over as-is (tests use stand-in objects). */
  sendStream(scope: string, stream: MediaStream, from: string, to: readonly string[]): void {
    for (const id of to) if (id !== from) this.scopes.get(scope)?.get(id)?.receiveStream(stream, from);
  }

  /** @internal */
  send(scope: string, channel: string, data: unknown, from: string, to?: readonly string[]): void {
    const members = this.scopes.get(scope);
    if (!members) return;
    for (const m of members.values()) {
      if (m.id === from || (to && !to.includes(m.id))) continue;
      // structuredClone mimics serialization over the wire.
      m.deliver(channel, structuredClone(data), from);
    }
  }
}

export function createMemoryTransport(hub: MemoryHub, selfId: string, classCode = 'LOCAL'): Transport {
  return {
    join(scope) {
      const key = `${classCode}/${scope}`;
      const events = new Emitter<{
        join: string;
        leave: string;
        message: { channel: string; data: unknown; from: string };
        stream: { stream: MediaStream; from: string };
      }>();
      const peers = new Set<string>();
      // Messages for channels nobody listens to yet wait for the first subscriber
      // (delivery here is synchronous, so a newcomer is greeted before it subscribes).
      const listening = new Map<string, number>();
      const pending = new Map<string, { data: unknown; from: string }[]>();
      hub.add(key, {
        id: selfId,
        deliver: (channel, data, from) => {
          if (listening.get(channel)) events.emit('message', { channel, data, from });
          else pending.set(channel, [...(pending.get(channel) ?? []), { data, from }]);
        },
        peerJoined: (id) => {
          peers.add(id);
          events.emit('join', id);
        },
        peerLeft: (id) => {
          peers.delete(id);
          events.emit('leave', id);
        },
        receiveStream: (stream, from) => events.emit('stream', { stream, from }),
      });

      const room: NetRoom = {
        selfId,
        channel<T extends Json>(name: string): Channel<T> {
          return {
            send(data, to) {
              if (to && to.length === 0) return;
              hub.send(key, name, data, selfId, to);
            },
            subscribe(handler) {
              const off = events.on('message', ({ channel, data, from }) => {
                if (channel === name) handler(data, from);
              });
              listening.set(name, (listening.get(name) ?? 0) + 1);
              const queued = pending.get(name) ?? [];
              pending.delete(name);
              queued.forEach(({ data, from }) => handler(data, from));
              return () => {
                off();
                listening.set(name, (listening.get(name) ?? 1) - 1);
              };
            },
          };
        },
        peers: () => [...peers],
        onPeerJoin(handler) {
          peers.forEach((id) => handler(id));
          return events.on('join', handler);
        },
        onPeerLeave: (handler) => events.on('leave', handler),
        sendStream: (stream, to) => hub.sendStream(key, stream, selfId, to),
        // Like WebRTC, receivers aren't told when a stream stops.
        stopStream: () => {},
        onPeerStream: (handler) => events.on('stream', ({ stream, from }) => handler(stream, from)),
        leave() {
          hub.remove(key, selfId);
          events.clear();
        },
      };
      return room;
    },
  };
}
