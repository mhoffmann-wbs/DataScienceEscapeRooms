import { z } from 'zod';
import doorsJson from '../../content/lobby/doors.json';
import { ROOMS } from '.';
import { aboutSchema, difficulties, localized, type About, type Difficulty, type Localized } from './manifest';

// The lobby's doors are room types (Python, SQL, …). Each room's manifest names its door in
// `category`; doors.json adds the icon shown above the door and scenarios not built yet.

const doorSchema = z.object({
  /** Matches a lobby door's `doorTo` and room manifests' `category`. */
  id: z.string().regex(/^[a-z0-9-]+$/),
  /** Shown above the door on the map. */
  icon: z.string().min(1),
  title: localized,
  /** Planned scenarios, shown greyed out. */
  upcoming: z.array(z.object({ title: localized, difficulty: z.enum(difficulties), about: aboutSchema })).default([]),
});
export type DoorInfo = z.infer<typeof doorSchema>;

export const DOORS: DoorInfo[] = z.object({ doors: z.array(doorSchema) }).parse(doorsJson).doors;

export function getDoor(doorId: string): DoorInfo | undefined {
  return DOORS.find((d) => d.id === doorId);
}

export interface Scenario {
  /** Undefined for a scenario that isn't built yet. */
  roomId?: string;
  title: Localized;
  difficulty: Difficulty;
  about: About;
}

const rank = (d: Difficulty) => difficulties.indexOf(d);

/** The scenarios behind a door, playable ones first, each group from easiest to hardest. */
export function scenariosAt(doorId: string): Scenario[] {
  const playable = Object.entries(ROOMS)
    .filter(([, m]) => m.category === doorId)
    .map(([roomId, m]) => ({ roomId, title: m.title, difficulty: m.difficulty, about: m.about }));
  const byDifficulty = (a: Scenario, b: Scenario) => rank(a.difficulty) - rank(b.difficulty);
  return [...playable.sort(byDifficulty), ...(getDoor(doorId)?.upcoming ?? []).slice().sort(byDifficulty)];
}
