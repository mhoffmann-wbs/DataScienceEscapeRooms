import { describe, expect, it } from 'vitest';
import { createMemoryTransport, MemoryHub } from './memoryTransport';
import { POS_INTERVAL_MS } from './presence';
import type { Area } from './proximity';
import { NEARBY_RADIUS, Session } from './session';

function player(hub: MemoryHub, id: string, x = 0, y = 0, classCode = 'DS-01', areas: readonly Area[] = []) {
  const s = new Session(createMemoryTransport(hub, id, classCode), 'lobby', { nickname: id, avatar: 0, classCode }, areas);
  s.presence.updateSelf({ x, y, dir: 'down', moving: false }, 0);
  return s;
}

describe('presence', () => {
  it('peers see each other regardless of join order', () => {
    const hub = new MemoryHub();
    const ada = player(hub, 'ada', 10, 20);
    const bob = player(hub, 'bob', 30, 40);
    expect(ada.presence.list().map((p) => [p.nickname, p.x, p.y])).toEqual([['bob', 30, 40]]);
    expect(bob.presence.list().map((p) => [p.nickname, p.x, p.y])).toEqual([['ada', 10, 20]]);
  });

  it('greets a peer that joined before our position was known', () => {
    const hub = new MemoryHub();
    const ada = new Session(createMemoryTransport(hub, 'ada', 'DS-01'), 'lobby', { nickname: 'ada', avatar: 1, classCode: 'DS-01' });
    const bob = player(hub, 'bob');
    expect(bob.presence.list()).toEqual([]);
    ada.presence.updateSelf({ x: 5, y: 5, dir: 'up', moving: false }, 0);
    expect(bob.presence.get('ada')).toMatchObject({ nickname: 'ada', avatar: 1, dir: 'up' });
  });

  it('separates class codes', () => {
    const hub = new MemoryHub();
    const ada = player(hub, 'ada', 0, 0, 'DS-01');
    player(hub, 'bob', 0, 0, 'DS-02');
    expect(ada.presence.list()).toEqual([]);
  });

  it('throttles position updates but always delivers the final state', () => {
    const hub = new MemoryHub();
    const ada = player(hub, 'ada');
    const bob = player(hub, 'bob');
    ada.presence.updateSelf({ x: 50, y: 0, dir: 'right', moving: true }, POS_INTERVAL_MS);
    ada.presence.updateSelf({ x: 60, y: 0, dir: 'right', moving: false }, POS_INTERVAL_MS + 10);
    expect(bob.presence.get('ada')).toMatchObject({ x: 50, moving: true });
    ada.presence.updateSelf({ x: 60, y: 0, dir: 'right', moving: false }, 2 * POS_INTERVAL_MS);
    expect(bob.presence.get('ada')).toMatchObject({ x: 60, moving: false });
  });

  it('removes peers that leave and ignores malformed packets', () => {
    const hub = new MemoryHub();
    const ada = player(hub, 'ada');
    const bob = player(hub, 'bob');
    const evil = createMemoryTransport(hub, 'evil', 'DS-01').join('lobby');
    evil.channel('hello').send({ nickname: '', avatar: 99, x: 'a' });
    evil.channel('pos').send({ x: Infinity });
    expect(ada.presence.list().map((p) => p.id)).toEqual(['bob']);
    bob.leave();
    bob.leave(); // unmount and pagehide may both call it
    expect(ada.presence.list()).toEqual([]);
  });
});

describe('chat', () => {
  it('broadcasts to everyone and records joins and leaves', () => {
    const hub = new MemoryHub();
    const ada = player(hub, 'ada');
    const bob = player(hub, 'bob');
    bob.chat.send('  hello  ', 'all');
    const kinds = ada.chat.list().map((e) => (e.kind === 'message' ? `${e.nickname}: ${e.text}` : e.kind));
    expect(kinds).toEqual(['joined', 'bob: hello']);
    bob.leave();
    expect(ada.chat.list().at(-1)?.kind).toBe('left');
  });

  it('nearby messages only reach peers in range', () => {
    const hub = new MemoryHub();
    const ada = player(hub, 'ada', 0, 0);
    const near = player(hub, 'near', NEARBY_RADIUS - 1, 0);
    const far = player(hub, 'far', NEARBY_RADIUS + 1, 0);
    ada.chat.send('psst', 'nearby');
    const texts = (s: Session) => s.chat.list().flatMap((e) => (e.kind === 'message' ? [e.text] : []));
    expect(texts(near)).toEqual(['psst']);
    expect(texts(far)).toEqual([]);
  });

  it('in a private area, nearby messages reach the whole area and nobody outside it', () => {
    const hub = new MemoryHub();
    const areas = [{ id: 'couch', x: 0, y: 0, width: 1000, height: 100 }];
    const ada = player(hub, 'ada', 10, 50, 'DS-01', areas);
    const across = player(hub, 'across', 990, 50, 'DS-01', areas);
    const outside = player(hub, 'outside', 10, 110, 'DS-01', areas);
    ada.chat.send('just us', 'nearby');
    const texts = (s: Session) => s.chat.list().flatMap((e) => (e.kind === 'message' ? [e.text] : []));
    expect(texts(across)).toEqual(['just us']);
    expect(texts(outside)).toEqual([]);
  });

  it('tells the sender when nobody is nearby, and rejects empty or oversized text', () => {
    const hub = new MemoryHub();
    const ada = player(hub, 'ada');
    player(hub, 'far', 10 * NEARBY_RADIUS, 0);
    expect(ada.chat.send('anyone?', 'nearby')).toBe(true);
    expect(ada.chat.list().at(-1)?.kind).toBe('nobodyNearby');
    expect(ada.chat.send('   ', 'all')).toBe(false);
    expect(ada.chat.send('x'.repeat(501), 'all')).toBe(false);
  });
});
