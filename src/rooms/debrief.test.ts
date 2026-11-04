import { describe, expect, it } from 'vitest';
import { hintKey } from '../net/run';
import { debriefRows } from './debrief';
import { ROOMS } from './index';

describe('debriefRows', () => {
  const manifest = ROOMS['python-lab']!;
  const [first, second] = manifest.puzzles;

  it('reports solve times relative to the start and hints per puzzle', () => {
    const rows = debriefRows(manifest, {
      startedAt: 1000,
      solved: { [first!.id]: 61_000 },
      hints: { [hintKey(first!.id, 0)]: 5000, [hintKey(first!.id, 1)]: 6000, [hintKey(second!.id, 0)]: 7000 },
    });
    expect(rows.map((r) => r.puzzle.id)).toEqual(manifest.puzzles.map((p) => p.id));
    expect(rows[0]).toMatchObject({ solvedAfter: 60_000, hintsUsed: 2 });
    expect(rows[1]).toMatchObject({ solvedAfter: null, hintsUsed: 1 });
  });

  it('has no solve times without a known start', () => {
    const rows = debriefRows(manifest, { startedAt: null, solved: { [first!.id]: 61_000 }, hints: {} });
    expect(rows[0]!.solvedAfter).toBeNull();
  });
});
