import type { Language } from '../i18n';
import { manifestSchema, type Clue, type Localized, type Manifest, type Puzzle } from './manifest';
import type { ReferenceSolution } from './solutions';
import { moduleSetup } from '../runners/pythonCore';

// Rooms are discovered from content/rooms/<roomId>/manifest.json; the folder name is the roomId.
const manifests = import.meta.glob<unknown>('../../content/rooms/*/manifest.json', { eager: true, import: 'default' });
// Data files load lazily, so a room's datasets are only downloaded when needed.
// Reference solutions too: they are public, but only the debrief screen needs them.
const solutionFiles = import.meta.glob<Record<string, ReferenceSolution>>('../../content/rooms/*/solutions.json', { import: 'default' });
const dataFiles = import.meta.glob<string>('../../content/rooms/*/data/*', { query: '?raw', import: 'default' });
// Python modules rooms can import (manifest `modules`), e.g. the Prophet-style model.
const pythonModules = import.meta.glob<string>('../../content/python/*.py', { query: '?raw', import: 'default' });

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

/** Sources of the given modules from content/python/, by name. */
export async function loadModules(names: readonly string[]): Promise<Record<string, string>> {
  const entries = names.map(async (name) => {
    const load = pythonModules[`../../content/python/${name}.py`];
    if (!load) throw new Error(`Missing Python module content/python/${name}.py`);
    return [name, await load()] as const;
  });
  return Object.fromEntries(await Promise.all(entries));
}

/** What runs before a puzzle's code: the room's Python modules, then the puzzle's data file. */
export async function loadSetup(roomId: string, puzzle: Puzzle): Promise<string> {
  const modules = puzzle.workspace === 'python' ? ROOMS[roomId]!.modules : [];
  const [code, data] = await Promise.all([modules.length ? loadModules(modules).then(moduleSetup) : '', puzzle.data ? loadDataFile(roomId, puzzle.data) : '']);
  return code + data;
}

/** Reference solutions by puzzle id (answer text, Python code or SQL query, or an answer with its code). */
export async function loadSolutions(roomId: string): Promise<Record<string, ReferenceSolution>> {
  const load = solutionFiles[`../../content/rooms/${roomId}/solutions.json`];
  return load ? load() : {};
}

export function finalPuzzleId(roomId: string): string | undefined {
  return ROOMS[roomId]?.puzzles.find((p) => p.final)?.id;
}

/** A puzzle is open once everything it requires is solved. */
export function isUnlocked(puzzle: Puzzle, solved: Record<string, number>): boolean {
  return puzzle.requires.every((r) => r in solved);
}
