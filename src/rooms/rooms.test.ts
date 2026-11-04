import { loadPyodide } from 'pyodide';
import initSqlJs from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { MAPS, ROOM_IDS } from '../game/maps';
import { parseMapObjects, tiledMapSchema } from '../game/tiled';
import { loadDataFile, ROOMS } from './index';
import { canonicalSolution, solutionHash, type Engines } from './solutions';
import { LANGUAGES, renderWalkthrough, walkthroughPath, type SolvedPuzzle } from './walkthrough';

// Reference solutions; every stored hash is re-derived from them.
const solutionFiles = import.meta.glob<Record<string, string>>('../../content/rooms/*/solutions.json', { eager: true, import: 'default' });
const solutionsFor = (roomId: string) => solutionFiles[`../../content/rooms/${roomId}/solutions.json`];
const walkthroughs = import.meta.glob<string>('../../docs/walkthroughs/*.md', { eager: true, query: '?raw', import: 'default' });

describe('rooms', () => {
  it('every room folder has both a map and a manifest', () => {
    expect(Object.keys(ROOMS).sort()).toEqual([...ROOM_IDS].sort());
  });
});

describe.each(ROOM_IDS)('room %s', (roomId) => {
  const manifest = ROOMS[roomId]!;
  const objects = parseMapObjects(tiledMapSchema.parse(MAPS[roomId]));

  it('places every puzzle on the map exactly once, and nothing else', () => {
    expect(objects.puzzles.map((p) => p.puzzleId).sort()).toEqual(manifest.puzzles.map((p) => p.id).sort());
  });

  it('places every clue on the map exactly once, and nothing else', () => {
    expect(objects.clues.map((c) => c.clueId).sort()).toEqual(manifest.clues.map((c) => c.id).sort());
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

  describe('reference solutions', () => {
    let engines: Engines;
    beforeAll(async () => {
      engines = { SQL: await initSqlJs(), py: await loadPyodide(), readData: (f) => loadDataFile(roomId, f) };
    }, 60_000);

    it.each(manifest.puzzles.map((p) => [p.id, p] as const))('%s matches its stored hash', async (_, puzzle) => {
      const solution = solutionsFor(roomId)![puzzle.id];
      expect(solution, `no reference solution for ${puzzle.id}`).toBeDefined();
      expect(await solutionHash(manifest, puzzle, solution!, engines)).toBe(puzzle.check.hash);
    });

    it('has an up-to-date walkthrough (run `npm run walkthrough` to regenerate)', async () => {
      const solved: Record<string, SolvedPuzzle> = {};
      for (const p of manifest.puzzles) {
        const solution = solutionsFor(roomId)![p.id]!;
        solved[p.id] = { solution, result: await canonicalSolution(p, solution, engines) };
      }
      for (const lang of LANGUAGES) expect(walkthroughs[`../../${walkthroughPath(roomId, lang)}`]).toBe(renderWalkthrough(roomId, manifest, lang, solved));
    });
  });
});
