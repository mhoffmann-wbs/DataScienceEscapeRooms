import { describe, expect, it } from 'vitest';
import { ROOMS } from './index';
import { DOORS, scenariosAt } from './doors';

describe('scenariosAt', () => {
  it('lists the rooms at the Python door easiest first, Quarantine before Market Day', () => {
    expect(scenariosAt('python').flatMap((s) => (s.roomId ? [s.roomId] : []))).toEqual(['python-lab', 'pandas-market', 'python-debug', 'python-docs']);
  });

  it('lists The Blue Index before Night Train at the SQL door, with nothing coming soon', () => {
    expect(scenariosAt('sql').map((s) => s.roomId)).toEqual(['sql-hotel', 'sql-train']);
  });

  it('only orders rooms that exist at that door', () => {
    for (const door of DOORS) for (const id of door.order) expect(ROOMS[id]?.category).toBe(door.id);
  });
});
