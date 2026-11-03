import { loadPyodide } from 'pyodide';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAPS, ROOM_IDS } from '../game/maps';
import { parseMapObjects, tiledMapSchema } from '../game/tiled';
import { loadDataFile, ROOMS } from './index';
import { solutionHash, type Engines } from './solutions';

// Gitignored reference solutions; when present, every stored hash is re-derived from them.
const solutionFiles = import.meta.glob<Record<string, string>>('../../content/rooms/*/solutions.local.json', { eager: true, import: 'default' });
const solutionsFor = (roomId: string) => solutionFiles[`../../content/rooms/${roomId}/solutions.local.json`];

describe('rooms', () => {
  it('every room folder has both a map and a manifest', () => {
    expect(Object.keys(ROOMS).sort()).toEqual([...ROOM_IDS].sort());
  });
});

describe.each(ROOM_IDS)('room %s', (roomId) => {
  const manifest = ROOMS[roomId]!;
  const placed = parseMapObjects(tiledMapSchema.parse(MAPS[roomId])).puzzles.map((p) => p.puzzleId);

  it('places every puzzle on the map exactly once, and nothing else', () => {
    expect([...placed].sort()).toEqual(manifest.puzzles.map((p) => p.id).sort());
  });

  it('has every referenced data file', async () => {
    for (const p of manifest.puzzles) if (p.data) await expect(loadDataFile(roomId, p.data)).resolves.toBeTypeOf('string');
  });

  it('can reach the final puzzle (no requirement cycles)', () => {
    const solved = new Set<string>();
    let progress = true;
    while (progress) {
      progress = false;
      for (const p of manifest.puzzles)
        if (!solved.has(p.id) && p.requires.every((r) => solved.has(r))) {
          solved.add(p.id);
          progress = true;
        }
    }
    expect(solved.size).toBe(manifest.puzzles.length);
  });

  describe.skipIf(!solutionsFor(roomId))('reference solutions', () => {
    let engines: Engines;
    beforeAll(async () => {
      engines = { SQL: await initSqlJs(), py: await loadPyodide(), readData: (f) => loadDataFile(roomId, f) };
    }, 60_000);

    it.each(manifest.puzzles.map((p) => [p.id, p] as const))('%s matches its stored hash', async (_, puzzle) => {
      const solution = solutionsFor(roomId)![puzzle.id];
      expect(solution, `no reference solution for ${puzzle.id}`).toBeDefined();
      expect(await solutionHash(manifest, puzzle, solution!, engines)).toBe(puzzle.check.hash);
    });
  });
});
