import { z } from 'zod';

// The subset of the Tiled JSON format the engine reads. Maps are authored in Tiled;
// conventions: tile layers "floor" and "walls", an object layer "objects",
// tiles with a boolean `collides` property block movement.

const propertySchema = z.object({ name: z.string(), type: z.string(), value: z.unknown() });

const objectSchema = z.object({
  id: z.number(),
  name: z.string(),
  // Tiled >= 1.9 writes `class` in some exports, older versions `type`.
  type: z.string().optional(),
  class: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  properties: z.array(propertySchema).optional(),
});

const layerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tilelayer'), name: z.string(), width: z.number(), height: z.number(), data: z.array(z.number()) }),
  z.object({ type: z.literal('objectgroup'), name: z.string(), objects: z.array(objectSchema) }),
]);

export const tiledMapSchema = z.object({
  width: z.number(),
  height: z.number(),
  tilewidth: z.number(),
  tileheight: z.number(),
  layers: z.array(layerSchema),
  tilesets: z.array(
    z.object({
      firstgid: z.number(),
      name: z.string(),
      tiles: z.array(z.object({ id: z.number(), properties: z.array(propertySchema).optional() })).optional(),
    }),
  ),
});

export type TiledMap = z.infer<typeof tiledMapSchema>;
type TiledObject = z.infer<typeof objectSchema>;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Door extends Rect {
  /** A roomId, or 'lobby' for exits. */
  doorTo: string;
}

export interface PuzzleSpot extends Rect {
  puzzleId: string;
}

export interface ClueSpot extends Rect {
  clueId: string;
}

export interface MapObjects {
  /** A point (width/height 0) or an area players arrive somewhere inside. */
  spawn: Rect;
  doors: Door[];
  /** Where the player stands to open a puzzle (class `puzzle`, property `puzzleId`). */
  puzzles: PuzzleSpot[];
  /** Things to look at (class `clue`, property `clueId`), shaped like puzzle spots. */
  clues: ClueSpot[];
}

function objectClass(o: TiledObject): string | undefined {
  return o.class ?? o.type;
}

function stringProp(o: TiledObject, name: string): string | undefined {
  const value = o.properties?.find((p) => p.name === name)?.value;
  return typeof value === 'string' ? value : undefined;
}

export function parseMapObjects(map: TiledMap): MapObjects {
  const objects = map.layers.flatMap((l) => (l.type === 'objectgroup' ? l.objects : []));

  const spawnObj = objects.find((o) => objectClass(o) === 'spawn');
  if (!spawnObj) throw new Error('Map has no object of class "spawn"');

  const doors = objects
    .filter((o) => objectClass(o) === 'door')
    .map((o) => {
      const doorTo = stringProp(o, 'doorTo');
      if (!doorTo) throw new Error(`Door "${o.name}" (id ${o.id}) has no doorTo property`);
      return { doorTo, x: o.x, y: o.y, width: o.width, height: o.height };
    });

  const puzzles = objects
    .filter((o) => objectClass(o) === 'puzzle')
    .map((o) => {
      const puzzleId = stringProp(o, 'puzzleId');
      if (!puzzleId) throw new Error(`Puzzle object "${o.name}" (id ${o.id}) has no puzzleId property`);
      return { puzzleId, x: o.x, y: o.y, width: o.width, height: o.height };
    });

  const clues = objects
    .filter((o) => objectClass(o) === 'clue')
    .map((o) => {
      const clueId = stringProp(o, 'clueId');
      if (!clueId) throw new Error(`Clue object "${o.name}" (id ${o.id}) has no clueId property`);
      return { clueId, x: o.x, y: o.y, width: o.width, height: o.height };
    });

  return { spawn: { x: spawnObj.x, y: spawnObj.y, width: spawnObj.width, height: spawnObj.height }, doors, puzzles, clues };
}

/** Max offset (px) around a point spawn, so arriving players don't stack exactly on top of each other. */
const POINT_SPAWN_JITTER = 12;

export function pickSpawnPoint(spawn: Rect, random: () => number = Math.random): { x: number; y: number } {
  const jitter = spawn.width === 0 && spawn.height === 0 ? POINT_SPAWN_JITTER : 0;
  return {
    x: spawn.x - jitter + random() * (spawn.width + 2 * jitter),
    y: spawn.y - jitter + random() * (spawn.height + 2 * jitter),
  };
}

/** Global tile ids whose tileset tile has `collides: true`. */
export function collidingGids(map: TiledMap): Set<number> {
  const gids = new Set<number>();
  for (const ts of map.tilesets) {
    for (const tile of ts.tiles ?? []) {
      if (tile.properties?.some((p) => p.name === 'collides' && p.value === true)) gids.add(ts.firstgid + tile.id);
    }
  }
  return gids;
}

export function containsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}
