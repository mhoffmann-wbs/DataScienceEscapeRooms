import { attemptsPerPuzzle, hintKey, type RunState } from '../net/run';
import type { Manifest, Puzzle } from './manifest';

export interface DebriefRow {
  puzzle: Puzzle;
  /** Milliseconds from the run's start until the team solved it; null if unsolved (or the start is unknown). */
  solvedAfter: number | null;
  hintsUsed: number;
  /** Failed checks, summed over the team. */
  wrongAttempts: number;
}

/** Per-puzzle results of a run, in manifest order, for the debrief screen. */
export function debriefRows(manifest: Manifest, state: RunState): DebriefRow[] {
  const attempts = attemptsPerPuzzle(state);
  return manifest.puzzles.map((puzzle) => {
    const solvedAt = state.solved[puzzle.id];
    return {
      puzzle,
      solvedAfter: solvedAt !== undefined && state.startedAt !== null ? solvedAt - state.startedAt : null,
      hintsUsed: puzzle.hints.filter((_, i) => hintKey(puzzle.id, i) in state.hints).length,
      wrongAttempts: attempts[puzzle.id] ?? 0,
    };
  });
}
