import { z } from 'zod';
import { notesSchema } from '../net/notebook';
import { runStateSchema } from '../net/run';
import type { RunInfo } from '../net/session';

// The run this device is part of, so a page refresh drops the player back into their room.
const STORAGE_KEY = 'dser.run';

const savedRunSchema = z.object({ roomId: z.string(), teamId: z.string(), password: z.string().optional(), state: runStateSchema, notes: notesSchema.optional() });
export type SavedRun = RunInfo;

export function loadRun(): SavedRun | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = savedRunSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveRun(run: SavedRun): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(run));
  } catch {
    // storage unavailable; a refresh will return to the lobby
  }
}

export function clearRun(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
