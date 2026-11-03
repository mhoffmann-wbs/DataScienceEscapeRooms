import { joinRoom, selfId, type DataPayload } from 'trystero';
import { Emitter } from '../lib/emitter';
import type { Channel, Json, NetRoom, Transport } from './transport';

// Changing this splits players on old and new builds into separate worlds.
const APP_ID = 'wbs-data-science-escape-rooms-v1';

export function createTrysteroTransport(classCode: string): Transport {
  return {
    join(scope) {
      const room = joinRoom({ appId: APP_ID }, `${classCode}/${scope}`);
      // Trystero has one handler slot per event; multiplex it.
      const peerEvents = new Emitter<{ join: string; leave: string }>();
      room.onPeerJoin = (id) => peerEvents.emit('join', id);
      room.onPeerLeave = (id) => peerEvents.emit('leave', id);
      const channels = new Map<string, Channel<Json>>();

      const net: NetRoom = {
        selfId,
        channel<T extends Json>(name: string): Channel<T> {
          let channel = channels.get(name);
          if (!channel) {
            const action = room.makeAction<DataPayload>(name);
            const messages = new Emitter<{ message: { data: unknown; from: string } }>();
            action.onMessage = (data, { peerId }) => messages.emit('message', { data, from: peerId });
            channel = {
              send(data, to) {
                if (to && to.length === 0) return;
                action.send(data as DataPayload, to ? { target: [...to] } : undefined).catch(() => {
                  // peer left mid-send; nothing to do
                });
              },
              subscribe: (handler) => messages.on('message', ({ data, from }) => handler(data, from)),
            };
            channels.set(name, channel);
          }
          return channel as Channel<T>;
        },
        peers: () => Object.keys(room.getPeers()),
        onPeerJoin(handler) {
          Object.keys(room.getPeers()).forEach((id) => handler(id));
          return peerEvents.on('join', handler);
        },
        onPeerLeave: (handler) => peerEvents.on('leave', handler),
        leave() {
          peerEvents.clear();
          void room.leave();
        },
      };
      return net;
    },
  };
}
