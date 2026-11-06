import type { PyodideAPI } from 'pyodide';
import type { SqlJsStatic } from 'sql.js';
// Explicit .ts extensions: this module also runs directly under Node (scripts/hash-answer.ts).
import { canonicalRows, hashAnswer, normalizeAnswer } from './answers.ts';
import { lockKey, type Manifest, type Puzzle } from './manifest.ts';
import { runPython } from '../runners/pythonCore.ts';
import { runSql } from '../runners/sqlCore.ts';

export interface Engines {
  SQL: SqlJsStatic;
  py: PyodideAPI;
  readData: (file: string) => Promise<string>;
  /** Setup code for the room's Python modules (`moduleSetup`), run before python puzzles' data files. */
  modules?: string;
}

/**
 * A puzzle's entry in solutions.json: the answer text for `answer` checks, Python code for
 * `python`, a query for `sql`. An `answer` check that is worked out in a code workspace
 * gives the answer plus the code that finds it, which is shown as the model solution.
 */
export type ReferenceSolution = string | { answer: string; code: string };

/** The part of a reference solution that gets checked: the answer, code or query. */
export const solutionText = (solution: ReferenceSolution) => (typeof solution === 'string' ? solution : solution.answer);

/**
 * Turns an author's reference solution into the canonical string that gets hashed.
 * For answers with code, the code must run and show the answer (in its output or result rows).
 */
export async function canonicalSolution(puzzle: Puzzle, solution: ReferenceSolution, engines: Engines): Promise<string> {
  const data = (puzzle.workspace === 'python' ? (engines.modules ?? '') : '') + (puzzle.data ? await engines.readData(puzzle.data) : '');
  if (typeof solution !== 'string') await checkWorkedAnswer(puzzle, solution, data, engines);
  solution = solutionText(solution);
  switch (puzzle.check.type) {
    case 'answer':
      return normalizeAnswer(solution, puzzle.check.mode);
    case 'python': {
      const out = await runPython(engines.py, solution, data, puzzle.check.expr);
      if (!out.ok || out.check === null) throw new Error(`${puzzle.id}: reference solution failed:\n${out.ok ? 'no check value' : out.error}`);
      return out.check;
    }
    case 'sql': {
      const out = runSql(engines.SQL, data, solution);
      if (!out.ok || !out.result) throw new Error(`${puzzle.id}: reference query failed: ${out.ok ? 'no result' : out.error}`);
      return canonicalRows(out.result.rows, puzzle.check.ordered);
    }
  }
}

async function checkWorkedAnswer(puzzle: Puzzle, { answer, code }: { answer: string; code: string }, data: string, engines: Engines) {
  if (puzzle.check.type !== 'answer') throw new Error(`${puzzle.id}: only answer checks take an answer with code`);
  let shown: string;
  if (puzzle.workspace === 'python') {
    const out = await runPython(engines.py, code, data);
    if (!out.ok) throw new Error(`${puzzle.id}: reference code failed:\n${out.error}`);
    shown = out.stdout;
  } else if (puzzle.workspace === 'sql') {
    const out = runSql(engines.SQL, data, code);
    if (!out.ok) throw new Error(`${puzzle.id}: reference query failed: ${out.error}`);
    shown = (out.result?.rows ?? []).flat().map(String).join('\n');
  } else {
    throw new Error(`${puzzle.id}: reference code needs a python or sql workspace`);
  }
  if (!shown.toLowerCase().includes(answer.toLowerCase())) throw new Error(`${puzzle.id}: reference code doesn't show the answer ${answer}; it shows:\n${shown}`);
}

/** The code that opens a puzzle's lock, stored in solutions.json under `<puzzleId>#lock`. */
export function lockCode(puzzle: Puzzle, solutions: Record<string, ReferenceSolution>): string | undefined {
  const code = solutions[lockKey(puzzle.id)];
  return typeof code === 'string' ? code : undefined;
}

export async function lockHash(manifest: Manifest, puzzle: Puzzle, code: string): Promise<string> {
  if (!puzzle.lock) throw new Error(`${puzzle.id} has no lock`);
  return hashAnswer(manifest.salt, lockKey(puzzle.id), normalizeAnswer(code, puzzle.lock.mode));
}

export async function solutionHash(manifest: Manifest, puzzle: Puzzle, solution: ReferenceSolution, engines: Engines): Promise<string> {
  return hashAnswer(manifest.salt, puzzle.id, await canonicalSolution(puzzle, solution, engines));
}
