import { describe, expect, it, vi } from 'vitest';
import { bus } from './events';

describe('event bus', () => {
  it('delivers payloads and unsubscribes', () => {
    const handler = vi.fn();
    const off = bus.on('scene:ready', handler);
    bus.emit('scene:ready', { scene: 'Lobby' });
    off();
    bus.emit('scene:ready', { scene: 'Lobby' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ scene: 'Lobby' });
  });
});
