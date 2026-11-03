// Computes answer hashes for a room from its reference solutions.
//
//   npm run hash-answer -- <roomId>           print hashes and whether the manifest matches
//   npm run hash-answer -- <roomId> --write   also write them into manifest.json
//
// Reference solutions live in content/rooms/<roomId>/solutions.local.json (gitignored):
// { "<puzzleId>": "<answer text | Python code | SQL query>" }, depending on the check type.
import { readFile, writeFile } from 'node:fs/promises';
import { loadPyodide } from 'pyodide';
import initSqlJs from 'sql.js';
import { manifestSchema } from '../src/rooms/manifest.ts';
import { solutionHash } from '../src/rooms/solutions.ts';

const [roomId, flag] = process.argv.slice(2);
if (!roomId) {
  console.error('usage: npm run hash-answer -- <roomId> [--write]');
  process.exit(1);
}
const dir = `content/rooms/${roomId}`;
const raw = JSON.parse(await readFile(`${dir}/manifest.json`, 'utf8'));
const manifest = manifestSchema.parse(raw);
const solutions: Record<string, string> = JSON.parse(await readFile(`${dir}/solutions.local.json`, 'utf8'));

const engines = { SQL: await initSqlJs(), py: await loadPyodide(), readData: (f: string) => readFile(`${dir}/data/${f}`, 'utf8') };

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
}

if (flag === '--write') {
  await writeFile(`${dir}/manifest.json`, JSON.stringify(raw, null, 2) + '\n');
  console.log(`wrote ${dir}/manifest.json`);
} else if (mismatches) {
  console.log(`${mismatches} hash(es) differ from the manifest; rerun with --write to update.`);
  process.exitCode = 1;
}
