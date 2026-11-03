import { describe, expect, it } from 'vitest';
import lobbyJson from '../../content/lobby/map.json';
import { collidingGids, containsPoint, parseMapObjects, tiledMapSchema } from './tiled';

const lobby = tiledMapSchema.parse(lobbyJson);

describe('lobby map', () => {
  const { spawn, doors } = parseMapObjects(lobby);

  it('has a door to each starter room', () => {
    expect(doors.map((d) => d.roomId).sort()).toEqual(['python-lab', 'sql-hotel']);
  });

  it('spawns the player on a walkable tile', () => {
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

  it('containsPoint is half-open', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 };
    expect(containsPoint(r, 0, 0)).toBe(true);
    expect(containsPoint(r, 10, 5)).toBe(false);
  });
});
