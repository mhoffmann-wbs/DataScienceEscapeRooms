// Computes answer hashes for a room from its reference solutions.
//
//   npm run hash-answer -- <roomId>           print hashes and whether the manifest matches
//   npm run hash-answer -- <roomId> --write   also write them into manifest.json
//
// Reference solutions live in content/rooms/<roomId>/solutions.json:
// { "<puzzleId>": "<answer text | Python code | SQL query>" }, depending on the check type,
// or { "answer": "…", "code": "…" } for an answer worked out in a code workspace.
// A puzzle's code lock takes its code under "<puzzleId>#lock".
import { readFile, writeFile } from 'node:fs/promises';
import initSqlJs from 'sql.js';
import { manifestSchema } from '../src/rooms/manifest.ts';
import { nodePyodide } from '../src/runners/nodePython.ts';
import { moduleSetup } from '../src/runners/pythonCore.ts';
import { lockCode, lockHash, solutionHash, type ReferenceSolution } from '../src/rooms/solutions.ts';

const [roomId, flag] = process.argv.slice(2);
if (!roomId) {
  console.error('usage: npm run hash-answer -- <roomId> [--write]');
  process.exit(1);
}
const dir = `content/rooms/${roomId}`;
const raw = JSON.parse(await readFile(`${dir}/manifest.json`, 'utf8'));
const manifest = manifestSchema.parse(raw);
const solutions: Record<string, ReferenceSolution> = JSON.parse(await readFile(`${dir}/solutions.json`, 'utf8'));

const engines = { SQL: await initSqlJs(), py: await nodePyodide(manifest.packages), readData: (f: string) => readFile(`${dir}/data/${f}`, 'utf8'), modules: await readModules(manifest.modules) };

let mismatches = 0;
for (const [i, puzzle] of manifest.puzzles.entries()) {
  const solution = solutions[puzzle.id];
  if (solution === undefined) {
    console.warn(`${puzzle.id}: no reference solution, skipped`);
    mismatches++;
    continue;
  }
  const hash = await solutionHash(manifest, puzzle, solution, engines);
  const ok = hash === puzzle.check.hash;
  if (!ok) mismatches++;
  console.log(`${ok ? '✓' : '✗'} ${puzzle.id} ${hash}`);
  raw.puzzles[i].check.hash = hash;
  if (puzzle.lock) {
    const code = lockCode(puzzle, solutions);
    if (code === undefined) {
      console.warn(`${puzzle.id}: no code for its lock (${puzzle.id}#lock), skipped`);
      mismatches++;
      continue;
    }
    const lock = await lockHash(manifest, puzzle, code);
    if (lock !== puzzle.lock.hash) mismatches++;
    console.log(`${lock === puzzle.lock.hash ? '✓' : '✗'} ${puzzle.id}#lock ${lock}`);
    raw.puzzles[i].lock.hash = lock;
  }
}

if (flag === '--write') {
  await writeFile(`${dir}/manifest.json`, JSON.stringify(raw, null, 2) + '\n');
  console.log(`wrote ${dir}/manifest.json`);
} else if (mismatches) {
  console.log(`${mismatches} hash(es) differ from the manifest; rerun with --write to update.`);
  process.exitCode = 1;
}

/** Setup code for a room's Python modules, read from content/python/. */
async function readModules(names: readonly string[]): Promise<string> {
  return moduleSetup(Object.fromEntries(await Promise.all(names.map(async (n) => [n, await readFile(`content/python/${n}.py`, 'utf8')] as const))));
}
