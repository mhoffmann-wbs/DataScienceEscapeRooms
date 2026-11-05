// Writes instructor walkthroughs to docs/walkthroughs/<roomId>.<lang>.md from each room's
// manifest and reference solutions (content/rooms/<roomId>/solutions.json).
//
//   npm run walkthrough              all rooms
//   npm run walkthrough -- <roomId>  one room
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import initSqlJs from 'sql.js';
import { manifestSchema } from '../src/rooms/manifest.ts';
import { nodePyodide } from '../src/runners/nodePython.ts';
import { canonicalSolution, type ReferenceSolution } from '../src/rooms/solutions.ts';
import { LANGUAGES, renderWalkthrough, walkthroughPath, type SolvedPuzzle } from '../src/rooms/walkthrough.ts';

const only = process.argv[2];
const roomIds = only ? [only] : await readdir('content/rooms');
const SQL = await initSqlJs();

for (const roomId of roomIds) {
  const dir = `content/rooms/${roomId}`;
  const manifest = manifestSchema.parse(JSON.parse(await readFile(`${dir}/manifest.json`, 'utf8')));
  const solutions: Record<string, ReferenceSolution> = JSON.parse(await readFile(`${dir}/solutions.json`, 'utf8'));
  const py = await nodePyodide(manifest.packages);
  const engines = { SQL, py, readData: (f: string) => readFile(`${dir}/data/${f}`, 'utf8') };

  const solved: Record<string, SolvedPuzzle> = {};
  for (const puzzle of manifest.puzzles) {
    const solution = solutions[puzzle.id];
    if (solution === undefined) throw new Error(`${roomId}: no reference solution for ${puzzle.id}`);
    solved[puzzle.id] = { solution, result: await canonicalSolution(puzzle, solution, engines) };
  }
  for (const lang of LANGUAGES) {
    const path = walkthroughPath(roomId, lang);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, renderWalkthrough(roomId, manifest, lang, solved));
    console.log(`wrote ${path}`);
  }
}
