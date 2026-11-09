import { describe, expect, it } from 'vitest';
import { DOORS } from '../rooms/doors';
import { ROOMS } from '../rooms';
import { LOBBY, MAPS, ROOM_IDS } from './maps';
import { collidingGids, containsPoint, inFrontOf, parseMapObjects, pickSpawnPoint, tiledMapSchema } from './tiled';

describe('maps', () => {
  it('the lobby has one door per room type, every room has a type, and every room has an exit to the lobby', () => {
    const doorsOf = (key: string) => parseMapObjects(tiledMapSchema.parse(MAPS[key])).doors.map((d) => d.doorTo);
    expect(doorsOf(LOBBY).sort()).toEqual(DOORS.map((d) => d.id).sort());
    for (const room of Object.values(ROOMS)) expect(doorsOf(LOBBY)).toContain(room.category);
    for (const roomId of ROOM_IDS) expect(doorsOf(roomId)).toContain(LOBBY);
  });
});

describe.each(Object.keys(MAPS))('map %s', (key) => {
  const lobby = tiledMapSchema.parse(MAPS[key]);
  const { spawn, doors } = parseMapObjects(lobby);

  it('spawns the player on a walkable tile, away from doors', () => {
    expect(doors.some((d) => containsPoint(d, spawn.x, spawn.y))).toBe(false);
    const blocked = collidingGids(lobby);
    const tx = Math.floor(spawn.x / lobby.tilewidth);
    const ty = Math.floor(spawn.y / lobby.tileheight);
    for (const layer of lobby.layers) {
      if (layer.type !== 'tilelayer') continue;
      expect(blocked.has(layer.data[ty * layer.width + tx]!)).toBe(false);
    }
  });

  it('lets players arrive in front of every door, on a walkable tile outside it', () => {
    const blocked = collidingGids(lobby);
    for (const d of doors) {
      const p = inFrontOf(d, lobby.tileheight);
      expect(doors.some((o) => containsPoint(o, p.x, p.y))).toBe(false);
      const tx = Math.floor(p.x / lobby.tilewidth);
      const ty = Math.floor(p.y / lobby.tileheight);
      for (const layer of lobby.layers) {
        if (layer.type !== 'tilelayer') continue;
        expect(blocked.has(layer.data[ty * layer.width + tx]!)).toBe(false);
      }
    }
  });

  it('keeps every door reachable (the side it opens to is walkable)', () => {
    const walls = lobby.layers.find((l) => l.type === 'tilelayer' && l.name === 'walls');
    if (walls?.type !== 'tilelayer') throw new Error('no walls layer');
    const blocked = collidingGids(lobby);
    for (const d of doors) {
      // The door's tile row (or column) nearest the room.
      const x = d.facing === 'right' ? d.x + d.width - 1 : d.x;
      const y = d.facing === 'down' ? d.y + d.height - 1 : d.y;
      const tx = Math.floor(x / lobby.tilewidth);
      const ty = Math.floor(y / lobby.tileheight);
      expect(blocked.has(walls.data[ty * walls.width + tx]!)).toBe(false);
    }
  });

  it('lets players walk from the spawn to every door, puzzle, clue and handbook', () => {
    const walls = lobby.layers.find((l) => l.type === 'tilelayer' && l.name === 'walls');
    if (walls?.type !== 'tilelayer') throw new Error('no walls layer');
    const blocked = collidingGids(lobby);
    const { width, height, tilewidth: tw, tileheight: th } = lobby;
    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && !blocked.has(walls.data[y * width + x]!);
    const reached = new Set<number>();
    const queue = [[Math.floor(spawn.x / tw), Math.floor(spawn.y / th)] as const];
    while (queue.length) {
      const [x, y] = queue.pop()!;
      if (!free(x, y) || reached.has(y * width + x)) continue;
      reached.add(y * width + x);
      queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    const { puzzles, clues, references } = parseMapObjects(lobby);
    const spots = [...puzzles.map((p) => [p.puzzleId, p] as const), ...clues.map((c) => [c.clueId, c] as const), ...references.map((r) => ['handbook', r] as const)];
    const unreachable = spots.filter(([, r]) => {
      for (let y = Math.floor(r.y / th); y < Math.ceil((r.y + r.height) / th); y++)
        for (let x = Math.floor(r.x / tw); x < Math.ceil((r.x + r.width) / tw); x++) if (reached.has(y * width + x)) return false;
      return true;
    });
    const unreachableDoors = doors.filter((d) => {
      const p = inFrontOf(d, th);
      return !reached.has(Math.floor(p.y / th) * width + Math.floor(p.x / tw));
    });
    expect(unreachable.map(([id]) => id)).toEqual([]);
    expect(unreachableDoors.map((d) => d.doorTo)).toEqual([]);
  });

  it('keeps solid tiles off the decor and above layers, which never block', () => {
    const blocked = collidingGids(lobby);
    for (const layer of lobby.layers) {
      if (layer.type !== 'tilelayer' || (layer.name !== 'decor' && layer.name !== 'above')) continue;
      expect(layer.data.filter((g) => blocked.has(g))).toEqual([]);
    }
  });
});

describe('inFrontOf', () => {
  const door = { doorTo: 'x', x: 64, y: 96, width: 64, height: 64 };
  it('puts players one tile below a door in the top wall', () => {
    expect(inFrontOf({ ...door, facing: 'down' }, 32)).toMatchObject({ x: 96, y: 192 });
  });
  it('puts players one tile beside a door in a side wall', () => {
    expect(inFrontOf({ ...door, facing: 'right' }, 32)).toMatchObject({ x: 160, y: 128 });
    expect(inFrontOf({ ...door, facing: 'left' }, 32)).toMatchObject({ x: 32, y: 128 });
  });
});

describe('parseMapObjects', () => {
  it('rejects a door without doorTo', () => {
    const map = tiledMapSchema.parse({
      width: 1, height: 1, tilewidth: 32, tileheight: 32, tilesets: [],
      layers: [{ type: 'objectgroup', name: 'objects', objects: [
        { id: 1, name: 'spawn', type: 'spawn', x: 0, y: 0, width: 0, height: 0 },
        { id: 2, name: 'broken', class: 'door', x: 0, y: 0, width: 32, height: 32 },
      ] }],
    });
    expect(() => parseMapObjects(map)).toThrow(/doorTo/);
  });

  it('reads a door facing, defaulting to down, and rejects unknown ones', () => {
    const mapWith = (facing?: string) =>
      tiledMapSchema.parse({
        width: 1, height: 1, tilewidth: 32, tileheight: 32, tilesets: [],
        layers: [{ type: 'objectgroup', name: 'objects', objects: [
          { id: 1, name: 'spawn', type: 'spawn', x: 0, y: 0, width: 0, height: 0 },
          { id: 2, name: 'side', class: 'door', x: 0, y: 0, width: 64, height: 64, properties: [
            { name: 'doorTo', type: 'string', value: 'lobby' },
            ...(facing ? [{ name: 'facing', type: 'string', value: facing }] : []),
          ] },
        ] }],
      });
    expect(parseMapObjects(mapWith()).doors[0]!.facing).toBe('down');
    expect(parseMapObjects(mapWith('right')).doors[0]!.facing).toBe('right');
    expect(() => parseMapObjects(mapWith('up'))).toThrow(/facing/);
  });

  it('reads clue objects and rejects one without clueId', () => {
    const mapWith = (clue: object) =>
      tiledMapSchema.parse({
        width: 1, height: 1, tilewidth: 32, tileheight: 32, tilesets: [],
        layers: [{ type: 'objectgroup', name: 'objects', objects: [
          { id: 1, name: 'spawn', type: 'spawn', x: 0, y: 0, width: 0, height: 0 },
          { id: 2, name: 'photo', class: 'clue', x: 0, y: 0, width: 32, height: 64, ...clue },
        ] }],
      });
    expect(parseMapObjects(mapWith({ properties: [{ name: 'clueId', type: 'string', value: 'photo' }] })).clues).toEqual([
      { clueId: 'photo', x: 0, y: 0, width: 32, height: 64 },
    ]);
    expect(() => parseMapObjects(mapWith({}))).toThrow(/clueId/);
  });

  it('reads the handbook object', () => {
    const map = tiledMapSchema.parse({
      width: 1, height: 1, tilewidth: 32, tileheight: 32, tilesets: [],
      layers: [{ type: 'objectgroup', name: 'objects', objects: [
        { id: 1, name: 'spawn', type: 'spawn', x: 0, y: 0, width: 0, height: 0 },
        { id: 2, name: 'handbook', class: 'reference', x: 32, y: 64, width: 32, height: 64 },
      ] }],
    });
    expect(parseMapObjects(map).references).toEqual([{ x: 32, y: 64, width: 32, height: 64 }]);
  });

  it('picks spawn points inside spawn areas, and near point spawns', () => {
    expect(pickSpawnPoint({ x: 100, y: 100, width: 64, height: 32 }, () => 0.5)).toEqual({ x: 132, y: 116 });
    expect(pickSpawnPoint({ x: 100, y: 100, width: 0, height: 0 }, () => 0)).toEqual({ x: 88, y: 88 });
  });

  it('containsPoint is half-open', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(containsPoint(r, 0, 0)).toBe(true);
    expect(containsPoint(r, 10, 5)).toBe(false);
  });
});
