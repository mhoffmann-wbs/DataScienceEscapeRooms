import { describe, expect, it } from 'vitest';
import { ROOMS } from './index';
import { DOORS, scenariosAt } from './doors';

describe('scenariosAt', () => {
  it('lists the rooms at the Python door easiest first, Quarantine before Market Day', () => {
    expect(scenariosAt('python').flatMap((s) => (s.roomId ? [s.roomId] : []))).toEqual(['python-lab', 'pandas-market', 'python-debug', 'python-docs']);
  });

  it('only orders rooms that exist at that door', () => {
    for (const door of DOORS) for (const id of door.order) expect(ROOMS[id]?.category).toBe(door.id);
  });
});
