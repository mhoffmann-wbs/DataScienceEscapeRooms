import { describe, expect, it } from 'vitest';
import { ROOMS } from './index';
import { DOORS, scenariosAt } from './doors';

describe('scenariosAt', () => {
  it('lists the rooms at the Python door easiest first, Quarantine before Market Day', () => {
    expect(scenariosAt('python').flatMap((s) => (s.roomId ? [s.roomId] : []))).toEqual(['python-lab', 'pandas-market', 'python-debug', 'python-docs']);
  });

  it('lists the rooms at the SQL door easiest first: The Blue Index, The Last Show, Night Train', () => {
    expect(scenariosAt('sql').map((s) => s.roomId)).toEqual(['sql-hotel', 'sql-cinema', 'sql-train']);
  });

  it('lists the rooms at the neural networks door easiest first: The Night Post, The Varda Tablets', () => {
    expect(scenariosAt('neural').map((s) => s.roomId)).toEqual(['nn-post', 'nn-tablets']);
  });

  it('lists the machine learning rooms at their door, before the one still to come, easiest first', () => {
    expect(scenariosAt('ml').map((s) => s.roomId ?? s.title.en)).toEqual(['ml-seeds', 'ml-customs', 'ml-auction', 'ml-courier', 'The Pass Road']);
  });

  it('only orders rooms that exist at that door', () => {
    for (const door of DOORS) for (const id of door.order) expect(ROOMS[id]?.category).toBe(door.id);
  });
});
