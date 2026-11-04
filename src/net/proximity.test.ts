import { describe, expect, it } from 'vitest';
import { LEAVE_FACTOR, Proximity } from './proximity';

describe('Proximity', () => {
  const corner = { id: 'corner', x: 0, y: 0, width: 100, height: 100 };
  const prox = new Proximity(50, [corner]);

  it('uses the radius outside areas', () => {
    expect(prox.near({ x: 200, y: 200 }, { x: 240, y: 200 })).toBe(true);
    expect(prox.near({ x: 200, y: 200 }, { x: 251, y: 200 })).toBe(false);
  });

  it('keeps peers near until the wider leave radius (hysteresis)', () => {
    const edge = { x: 200 + 50 * LEAVE_FACTOR - 1, y: 200 };
    expect(prox.near({ x: 200, y: 200 }, edge)).toBe(false);
    expect(prox.near({ x: 200, y: 200 }, edge, true)).toBe(true);
  });

  it('inside an area, connects exactly the people in the same area', () => {
    expect(prox.near({ x: 5, y: 5 }, { x: 95, y: 95 })).toBe(true);
    // Just outside the area: close, but not near.
    expect(prox.near({ x: 95, y: 50 }, { x: 105, y: 50 }, true)).toBe(false);
    expect(prox.near({ x: 105, y: 50 }, { x: 95, y: 50 })).toBe(false);
  });

  it('distinguishes two areas', () => {
    const two = new Proximity(1000, [corner, { id: 'other', x: 100, y: 0, width: 100, height: 100 }]);
    expect(two.near({ x: 50, y: 50 }, { x: 150, y: 50 })).toBe(false);
  });
});
