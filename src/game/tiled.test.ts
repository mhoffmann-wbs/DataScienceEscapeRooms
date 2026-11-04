import { describe, expect, it } from 'vitest';
import { LOBBY, MAPS, ROOM_IDS } from './maps';
import { collidingGids, containsPoint, parseMapObjects, pickSpawnPoint, tiledMapSchema } from './tiled';

describe('maps', () => {
  it('the lobby has a door to every room, and every room has an exit to the lobby', () => {
    const doorsOf = (key: string) => parseMapObjects(tiledMapSchema.parse(MAPS[key])).doors.map((d) => d.doorTo);
    expect(doorsOf(LOBBY).sort()).toEqual([...ROOM_IDS].sort());
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

  it('keeps every door reachable (its bottom row is walkable)', () => {
    const walls = lobby.layers.find((l) => l.type === 'tilelayer' && l.name === 'walls');
    if (walls?.type !== 'tilelayer') throw new Error('no walls layer');
    const blocked = collidingGids(lobby);
    for (const d of doors) {
      const ty = Math.floor((d.y + d.height - 1) / lobby.tileheight);
      const tx = Math.floor(d.x / lobby.tilewidth);
      expect(blocked.has(walls.data[ty * walls.width + tx]!)).toBe(false);
    }
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
