import { z } from 'zod';

// Format of content/rooms/<roomId>/manifest.json. Keep in sync with the
// "Rooms are data" section of CLAUDE.md. Only zod imports here (used by Node scripts).

export const localized = z.object({ en: z.string().min(1), de: z.string().min(1) });
export type Localized = z.infer<typeof localized>;

const hash = z.string().regex(/^[0-9a-f]{64}$/, 'run `npm run hash-answer` to fill in hashes');
const puzzleId = z.string().regex(/^[a-z0-9-]{1,40}$/);
const clueId = puzzleId;

export const checkSchema = z.discriminatedUnion('type', [
  /** A typed answer (code, name, number). */
  z.object({ type: z.literal('answer'), mode: z.enum(['caseless', 'exact', 'number']).default('caseless'), hash }),
  /** After the student's code runs, `expr` is evaluated in its namespace and its JSON compared. */
  z.object({ type: z.literal('python'), expr: z.string().min(1), hash }),
  /** The student's query result (last statement) is compared; column names are ignored. */
  z.object({ type: z.literal('sql'), ordered: z.boolean().default(false), hash }),
]);
export type Check = z.infer<typeof checkSchema>;

export const puzzleSchema = z
  .object({
    id: puzzleId,
    title: localized,
    /** Story and task. Separate paragraphs with a blank line; `backticks` mark code, **stars** bold text. */
    text: localized,
    /** Editor shown in the dialog. Answer puzzles may still offer one as scratch space. */
    workspace: z.enum(['none', 'python', 'sql']).default('none'),
    /** Code the editor starts with; localized when its comments need translating. */
    starter: z.union([z.string(), localized]).default(''),
    /** File in the room's data/ folder: Python run before the student's code, or the SQL database setup. */
    data: z.string().regex(/^[\w.-]+\.(py|sql)$/).optional(),
    check: checkSchema,
    /** What the puzzle teaches, for the debrief and the instructor walkthrough. */
    practises: localized,
    /** Clues the puzzle needs from the room, for the walkthrough. */
    clues: z.array(clueId).default([]),
    /** Tiered hints, gentlest first. */
    hints: z.array(localized).min(1).max(3),
    /** Shown to the whole team once solved: what the solved object gives back (a code digit, a message). */
    reveal: localized.optional(),
    /** Puzzles that must be solved before this one opens. */
    requires: z.array(puzzleId).default([]),
    /** Solving the final puzzle means the team escaped. */
    final: z.boolean().default(false),
  })
  .refine((p) => p.check.type !== 'python' || p.workspace === 'python', 'python checks need workspace "python"')
  .refine((p) => p.check.type !== 'sql' || p.workspace === 'sql', 'sql checks need workspace "sql"')
  .refine((p) => p.workspace !== 'sql' || p.data?.endsWith('.sql'), 'sql workspaces need a .sql data file');
export type Puzzle = z.infer<typeof puzzleSchema>;

/** Something to look at in the room (a photo, a poster), placed on the map as a `clue` object. */
export const clueSchema = z.object({ id: clueId, title: localized, text: localized });
export type Clue = z.infer<typeof clueSchema>;

export const difficulties = ['beginner', 'advanced', 'expert'] as const;
export type Difficulty = (typeof difficulties)[number];

/** How a scenario presents itself at the lobby door: the tools it uses, what it practises, its story in one sentence. */
export const aboutSchema = z.object({ tools: z.array(z.string().min(1)).min(1), practises: localized, story: localized });
export type About = z.infer<typeof aboutSchema>;

export const manifestSchema = z
  .object({
    version: z.literal(1),
    /** Random per room; mixed into every answer hash. */
    salt: z.string().min(8),
    title: localized,
    /** The lobby door this scenario is played from (an id in content/lobby/doors.json). */
    category: z.string().regex(/^[a-z0-9-]+$/),
    difficulty: z.enum(difficulties),
    about: aboutSchema,
    /** Shown when the run starts. */
    intro: localized,
    /** Pyodide packages this room's Python puzzles need (e.g. `statsmodels`), loaded when a puzzle opens. */
    packages: z.array(z.string().regex(/^[a-z0-9_-]+$/)).default([]),
    /** Python modules from content/python/ that this room's puzzles can import (e.g. `prophet`). */
    modules: z.array(z.string().regex(/^[a-z_][a-z0-9_]*$/)).default([]),
    puzzles: z.array(puzzleSchema).min(1),
    clues: z.array(clueSchema).default([]),
  })
  .superRefine((m, ctx) => {
    const ids = new Set(m.puzzles.map((p) => p.id));
    if (ids.size !== m.puzzles.length) ctx.addIssue({ code: 'custom', message: 'duplicate puzzle ids' });
    if (new Set(m.clues.map((c) => c.id)).size !== m.clues.length) ctx.addIssue({ code: 'custom', message: 'duplicate clue ids' });
    if (m.puzzles.filter((p) => p.final).length !== 1) ctx.addIssue({ code: 'custom', message: 'exactly one puzzle must be final' });
    const clueIds = new Set(m.clues.map((c) => c.id));
    for (const p of m.puzzles) {
      for (const r of p.requires) if (!ids.has(r)) ctx.addIssue({ code: 'custom', message: `${p.id} requires unknown puzzle ${r}` });
      for (const c of p.clues) if (!clueIds.has(c)) ctx.addIssue({ code: 'custom', message: `${p.id} uses unknown clue ${c}` });
    }
  });
export type Manifest = z.infer<typeof manifestSchema>;
