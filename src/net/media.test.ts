import { describe, expect, it } from 'vitest';
import type { Profile } from '../player/profile';
import { CONNECT_TIMEOUT_MS, Media } from './media';
import { createMemoryTransport, MemoryHub } from './memoryTransport';
import { Presence } from './presence';
import { CHANNELS } from './protocol';
import { Proximity } from './proximity';
import type { NetRoom } from './transport';

// Streams are opaque to Media; stand-ins are enough.
const fakeStream = (name: string) => ({ name }) as unknown as MediaStream;
const RADIUS = 100;

function peer(hub: MemoryHub, id: string, x: number, mode: 'proximity' | 'team' = 'proximity', clock = { t: 0 }) {
  const room: NetRoom = createMemoryTransport(hub, id).join(mode === 'team' ? 'room:x:t' : 'lobby');
  const profile: Profile = { nickname: id, avatar: 0, classCode: 'T' };
  const presence = new Presence(room, profile);
  const media = new Media(room, presence, new Proximity(RADIUS), mode, { now: () => clock.t, tickMs: 0 });
  presence.updateSelf({ x, y: 0, dir: 'down', moving: false }, 0);
  const stream = fakeStream(id);
  return {
    room,
    presence,
    media,
    stream,
    join: () => media.setLocal({ stream, mic: true, cam: false }),
    moveTo: (nx: number, t: number) => presence.updateSelf({ x: nx, y: 0, dir: 'down', moving: false }, t),
    shown: () => media.list().map((r) => [r.peerId, (r.stream as unknown as { name: string } | null)?.name ?? null]),
  };
}

const tickAll = (...ps: { media: Media }[]) => ps.forEach((p) => p.media.tick());

describe('Media', () => {
  it('connects peers near each other once both have joined', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada', 0);
    const bob = peer(hub, 'bob', 50);
    ada.join();
    expect(ada.media.sendingTo()).toEqual([]); // bob hasn't joined A/V
    bob.join();
    tickAll(ada, bob);
    expect(ada.media.sendingTo()).toEqual(['bob']);
    expect(ada.shown()).toEqual([['bob', 'bob']]);
    expect(bob.shown()).toEqual([['ada', 'ada']]);
  });

  it('does not connect peers that are far apart, and disconnects past the leave radius', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada', 0);
    const bob = peer(hub, 'bob', 50);
    const far = peer(hub, 'far', 1000);
    [ada, bob, far].forEach((p) => p.join());
    tickAll(ada, bob, far);
    expect(far.media.sendingTo()).toEqual([]);
    expect(far.shown()).toEqual([]);

    // Just past the radius: still connected (hysteresis)...
    bob.moveTo(RADIUS + 10, 200);
    tickAll(ada, bob);
    expect(ada.media.sendingTo()).toEqual(['bob']);
    // ...until clearly out of range.
    bob.moveTo(3 * RADIUS, 400);
    tickAll(ada, bob);
    expect(ada.media.sendingTo()).toEqual([]);
    expect(ada.shown()).toEqual([]);
  });

  it('connects the whole team in a room, whatever the distance', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada', 0, 'team');
    const bob = peer(hub, 'bob', 5000, 'team');
    ada.join();
    bob.join();
    tickAll(ada, bob);
    expect(ada.shown()).toEqual([['bob', 'bob']]);
  });

  it('lets listen-only peers hear others without sending', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada', 0);
    const bob = peer(hub, 'bob', 50);
    ada.media.setLocal({ stream: null, mic: false, cam: false });
    bob.join();
    tickAll(ada, bob);
    expect(ada.media.sendingTo()).toEqual([]);
    expect(ada.shown()).toEqual([['bob', 'bob']]);
    expect(bob.shown()).toEqual([['ada', null]]);
  });

  it('stops sending and showing when leaving A/V', () => {
    const hub = new MemoryHub();
    const ada = peer(hub, 'ada', 0);
    const bob = peer(hub, 'bob', 50);
    ada.join();
    bob.join();
    tickAll(ada, bob);
    ada.media.setLocal(null);
    tickAll(bob);
    expect(ada.media.sendingTo()).toEqual([]);
    expect(ada.shown()).toEqual([]);
    expect(bob.shown()).toEqual([]);
  });

  it('reports a peer as failed when its stream never arrives', () => {
    const hub = new MemoryHub();
    const clock = { t: 0 };
    const ada = peer(hub, 'ada', 0, 'proximity', clock);
    const bob = peer(hub, 'bob', 50, 'proximity', clock);
    ada.join();
    // Bob claims to send, but nothing gets through (as on a network that blocks WebRTC media).
    bob.room.channel(CHANNELS.av).send({ on: true, sending: true, mic: true, cam: false });
    expect(ada.media.list()[0]).toMatchObject({ peerId: 'bob', stream: null, failed: false });
    clock.t = CONNECT_TIMEOUT_MS + 1;
    ada.media.tick();
    expect(ada.media.list()[0]).toMatchObject({ peerId: 'bob', failed: true });
  });
});
