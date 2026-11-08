import { describe, expect, it } from 'vitest';
import { ROOMS } from './index';
import { DOORS, scenariosAt } from './doors';

describe('scenariosAt', () => {
  it('lists Quarantine before Market Day at the Python door', () => {
    expect(scenariosAt('python').flatMap((s) => (s.roomId ? [s.roomId] : []))).toEqual(['python-lab', 'pandas-market']);
  });

  it('only orders rooms that exist at that door', () => {
    for (const door of DOORS) for (const id of door.order) expect(ROOMS[id]?.category).toBe(door.id);
  });
});
