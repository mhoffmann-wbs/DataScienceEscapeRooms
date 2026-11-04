import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeShare, CODE_THROTTLE_MS } from './codeShare';
import { createMemoryTransport, MemoryHub } from './memoryTransport';

const share = (hub: MemoryHub, id: string) => {
  const room = createMemoryTransport(hub, id).join('room:r:t');
  return { room, share: new CodeShare(room) };
};

afterEach(() => vi.useRealTimers());

describe('CodeShare', () => {
  it('shows teammates the code of whoever has the same puzzle open', () => {
    const hub = new MemoryHub();
    const ada = share(hub, 'ada');
    const bob = share(hub, 'bob');
    ada.share.open('incubator', 'alarms = 0');
    expect(bob.share.working('incubator')).toEqual([{ peerId: 'ada', code: 'alarms = 0' }]);
    expect(bob.share.working('notebook')).toEqual([]);
    ada.share.close();
    expect(bob.share.working('incubator')).toEqual([]);
  });

  it('throttles typing but always delivers the latest code', () => {
    vi.useFakeTimers();
    const hub = new MemoryHub();
    const ada = share(hub, 'ada');
    const bob = share(hub, 'bob');
    ada.share.open('p', 'a');
    ada.share.update('ab');
    ada.share.update('abc');
    expect(bob.share.working('p')[0]!.code).toBe('a');
    vi.advanceTimersByTime(CODE_THROTTLE_MS);
    expect(bob.share.working('p')[0]!.code).toBe('abc');
  });

  it('sends the open puzzle to late joiners and forgets peers who leave', () => {
    const hub = new MemoryHub();
    const ada = share(hub, 'ada');
    ada.share.open('p', 'x = 1');
    const cara = share(hub, 'cara');
    expect(cara.share.working('p')).toEqual([{ peerId: 'ada', code: 'x = 1' }]);
    ada.room.leave();
    expect(cara.share.working('p')).toEqual([]);
  });

  it('switching puzzles closes the previous one', () => {
    const hub = new MemoryHub();
    const ada = share(hub, 'ada');
    const bob = share(hub, 'bob');
    ada.share.open('p', '1');
    ada.share.open('q', '2');
    expect(bob.share.working('p')).toEqual([]);
    expect(bob.share.working('q')).toEqual([{ peerId: 'ada', code: '2' }]);
  });
});
