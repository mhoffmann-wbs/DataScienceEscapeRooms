import type { Language } from '../i18n';
import { manifestSchema, type Clue, type Localized, type Manifest, type Puzzle } from './manifest';

// Rooms are discovered from content/rooms/<roomId>/manifest.json; the folder name is the roomId.
const manifests = import.meta.glob<unknown>('../../content/rooms/*/manifest.json', { eager: true, import: 'default' });
// Data files load lazily, so a room's datasets are only downloaded when needed.
const dataFiles = import.meta.glob<string>('../../content/rooms/*/data/*', { query: '?raw', import: 'default' });

const roomIdOf = (path: string) => path.split('/').at(-2)!;

export const ROOMS: Record<string, Manifest> = Object.fromEntries(
  Object.entries(manifests).map(([path, json]) => {
    const parsed = manifestSchema.safeParse(json);
    if (!parsed.success) throw new Error(`Invalid manifest ${path}: ${parsed.error.message}`);
    return [roomIdOf(path), parsed.data];
  }),
);

export function loc(text: Localized, lang: string): string {
  return text[(lang.startsWith('de') ? 'de' : 'en') as Language];
}

export function roomTitle(roomId: string, lang: string): string {
  const room = ROOMS[roomId];
  return room ? loc(room.title, lang) : roomId;
}

export function getPuzzle(roomId: string, puzzleId: string): Puzzle | undefined {
  return ROOMS[roomId]?.puzzles.find((p) => p.id === puzzleId);
}

export function getClue(roomId: string, clueId: string): Clue | undefined {
  return ROOMS[roomId]?.clues.find((c) => c.id === clueId);
}

export async function loadDataFile(roomId: string, file: string): Promise<string> {
  const load = dataFiles[`../../content/rooms/${roomId}/data/${file}`];
  if (!load) throw new Error(`Missing data file ${roomId}/data/${file}`);
  return load();
}

export function finalPuzzleId(roomId: string): string | undefined {
  return ROOMS[roomId]?.puzzles.find((p) => p.final)?.id;
}

/** A puzzle is open once everything it requires is solved. */
export function isUnlocked(puzzle: Puzzle, solved: Record<string, number>): boolean {
  return puzzle.requires.every((r) => r in solved);
}
