import type { PyodideAPI } from 'pyodide';
import type { SqlJsStatic } from 'sql.js';
// Explicit .ts extensions: this module also runs directly under Node (scripts/hash-answer.ts).
import { canonicalRows, hashAnswer, normalizeAnswer } from './answers.ts';
import type { Manifest, Puzzle } from './manifest.ts';
import { runPython } from '../runners/pythonCore.ts';
import { runSql } from '../runners/sqlCore.ts';

export interface Engines {
  SQL: SqlJsStatic;
  py: PyodideAPI;
  readData: (file: string) => Promise<string>;
}

/**
 * Turns an author's reference solution into the canonical string that gets hashed:
 * the answer text for `answer` checks, Python code for `python`, a query for `sql`.
 */
export async function canonicalSolution(puzzle: Puzzle, solution: string, engines: Engines): Promise<string> {
  const data = puzzle.data ? await engines.readData(puzzle.data) : '';
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

export async function solutionHash(manifest: Manifest, puzzle: Puzzle, solution: string, engines: Engines): Promise<string> {
  return hashAnswer(manifest.salt, puzzle.id, await canonicalSolution(puzzle, solution, engines));
}
