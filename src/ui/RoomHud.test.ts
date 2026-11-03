import { describe, expect, it } from 'vitest';
import { formatDuration } from './RoomHud';

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
    expect(formatDuration(-5000)).toBe('0:00');
  });
});
