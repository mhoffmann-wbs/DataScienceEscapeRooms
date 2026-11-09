import { z } from 'zod';
import tilesetInfo from '../../content/tilesets/tiles.json';

// The subset of the Tiled JSON format the engine reads. Maps are authored in Tiled;
// conventions: tile layers "floor" and "walls" (plus optional "decor" between them and "above"
// over the avatars), an object layer "objects"; tiles listed as solid in tiles.json block movement on "walls".

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

/** Which way a door opens into the map: `down` for doors in the top wall, `right` for the left wall, `left` for the right wall. */
export type Facing = 'down' | 'left' | 'right';
const FACINGS: readonly Facing[] = ['down', 'left', 'right'];

export interface Door extends Rect {
  /** A roomId, or 'lobby' for exits. */
  doorTo: string;
  /** From the door's optional `facing` property; `down` when it has none. */
  facing: Facing;
}

export interface PuzzleSpot extends Rect {
  puzzleId: string;
}

export interface ClueSpot extends Rect {
  clueId: string;
}

export interface AreaSpot extends Rect {
  /** The object's name; unique per map. */
  id: string;
}

export interface MapObjects {
  /** A point (width/height 0) or an area players arrive somewhere inside. */
  spawn: Rect;
  doors: Door[];
  /** Where the player stands to open a puzzle (class `puzzle`, property `puzzleId`). */
  puzzles: PuzzleSpot[];
  /** Things to look at (class `clue`, property `clueId`), shaped like puzzle spots. */
  clues: ClueSpot[];
  /** Where the room's handbook stands (class `reference`, no properties); one per room map, none in the lobby. */
  references: Rect[];
  /** Private areas (class `area`): inside one, "nearby" means everyone in the same area. */
  areas: AreaSpot[];
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
      const facing = stringProp(o, 'facing') ?? 'down';
      if (!FACINGS.includes(facing as Facing)) throw new Error(`Door "${o.name}" (id ${o.id}) has an unknown facing "${facing}"`);
      return { doorTo, facing: facing as Facing, x: o.x, y: o.y, width: o.width, height: o.height };
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

  const references = objects.filter((o) => objectClass(o) === 'reference').map((o) => ({ x: o.x, y: o.y, width: o.width, height: o.height }));

  const areas = objects.filter((o) => objectClass(o) === 'area').map((o) => ({ id: o.name || `area-${o.id}`, x: o.x, y: o.y, width: o.width, height: o.height }));

  return { spawn: { x: spawnObj.x, y: spawnObj.y, width: spawnObj.width, height: spawnObj.height }, doors, puzzles, clues, references, areas };
}

/** Max offset (px) around a point spawn, so arriving players don't stack exactly on top of each other. */
const POINT_SPAWN_JITTER = 12;

/**
 * Where a player arrives when coming back out through a door: one tile in front of it,
 * below a door in the top wall, beside a door in a side wall.
 */
export function inFrontOf(door: Door, tileSize: number): Rect {
  const at = (x: number, y: number) => ({ x, y, width: 0, height: 0 });
  switch (door.facing) {
    case 'down':
      return at(door.x + door.width / 2, door.y + door.height + tileSize);
    case 'right':
      return at(door.x + door.width + tileSize, door.y + door.height / 2);
    case 'left':
      return at(door.x - tileSize, door.y + door.height / 2);
  }
}

export function pickSpawnPoint(spawn: Rect, random: () => number = Math.random): { x: number; y: number } {
  const jitter = spawn.width === 0 && spawn.height === 0 ? POINT_SPAWN_JITTER : 0;
  return {
    x: spawn.x - jitter + random() * (spawn.width + 2 * jitter),
    y: spawn.y - jitter + random() * (spawn.height + 2 * jitter),
  };
}

/** Global tile ids that block movement on the walls layer: the tiles scripts/generate-art.mjs marks solid. */
export function collidingGids(map: TiledMap): Set<number> {
  const firstgid = map.tilesets[0]?.firstgid ?? 1;
  return new Set(tilesetInfo.solid.map((id) => firstgid + id));
}

export function containsPoint(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}
