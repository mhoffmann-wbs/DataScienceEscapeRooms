// Builds room maps from ASCII layouts. Each room has a build script next to this file
// (scripts/maps/<roomId>.mjs) that writes content/rooms/<roomId>/map.json: run it with
// `node scripts/maps/<roomId>.mjs` after changing the layout, then `node scripts/maps/render.mjs` to look.
// Tile numbers here are tileset INDICES (as in generate-art.mjs), not gids; null is an empty cell.
// Objects keep their names and properties from the current map; the scripts only place them.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The repository root. */
export const REPO = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');

/**
 * Turns ASCII rows into a flat array of tile indices (null = empty). `legend` maps a char to a
 * tile index, or to a function (x, y) => index for tiles that depend on position/neighbours.
 * Chars not in the legend: ' ' and '.' are empty, anything else throws.
 */
export function grid(rows, legend) {
  const h = rows.length, w = rows[0].length;
  rows.forEach((r, y) => { if (r.length !== w) throw new Error(`row ${y} has length ${r.length}, expected ${w}: "${r}"`); });
  const out = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x];
    if (ch in legend) { const v = legend[ch]; out.push(typeof v === 'function' ? v(x, y, rows) : v); }
    else if (ch === ' ' || ch === '.') out.push(null);
    else throw new Error(`no legend entry for "${ch}" at ${x},${y}`);
  }
  return out;
}

/** An empty layer of w*h cells (null everywhere), handy for programmatic drawing via set(). */
export const empty = (w, h) => new Array(w * h).fill(null);

/**
 * Writes content/rooms/<roomId>/map.json (or `file`), keeping the tileset block of the existing map.
 * layers: { floor, walls, decor?, above? } as flat index arrays (null = empty) of width*height.
 * objects: [{ type: 'spawn'|'door'|'puzzle'|'clue'|'reference'|'area', name, x, y, w = 1, h = 2, props: {...} }]
 *   in TILE units (fractions allowed, e.g. a point spawn at x: 11, y: 4.7 with w: 0, h: 0).
 */
export function writeMap({ root = REPO, roomId, file, width, height, layers, objects }) {
  const path = file ?? `${root}/content/rooms/${roomId}/map.json`;
  const old = JSON.parse(readFileSync(path, 'utf8'));
  const order = ['floor', 'decor', 'walls', 'above'];
  for (const name of Object.keys(layers)) if (!order.includes(name)) throw new Error(`unknown layer ${name}`);
  let id = 0;
  const tileLayers = order.filter((n) => layers[n]).map((name) => {
    const data = layers[name];
    if (data.length !== width * height) throw new Error(`layer ${name} has ${data.length} cells, expected ${width * height}`);
    return { id: ++id, name, type: 'tilelayer', width, height, x: 0, y: 0, opacity: 1, visible: true, data: data.map((t) => (t == null ? 0 : t + 1)) };
  });
  const T = 32;
  let oid = 0;
  const objs = objects.map((o) => {
    const w = o.w ?? 1, h = o.h ?? 2;
    const props = Object.entries(o.props ?? {}).map(([name, value]) => ({ name, type: 'string', value }));
    return { id: ++oid, name: o.name, type: o.type, x: o.x * T, y: o.y * T, width: w * T, height: h * T, rotation: 0, visible: true, ...(props.length ? { properties: props } : {}) };
  });
  const map = {
    compressionlevel: -1, width, height, infinite: false, orientation: 'orthogonal', renderorder: 'right-down',
    tilewidth: T, tileheight: T, tiledversion: '1.11.0', type: 'map', version: '1.10',
    nextlayerid: id + 2, nextobjectid: oid + 1,
    layers: [...tileLayers, { id: id + 1, name: 'objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: objs }],
    tilesets: old.tilesets,
  };
  writeFileSync(path, JSON.stringify(map, null, 1) + '\n');
  return path;
}

/** Reads the current map's objects in tile units, to carry names/props over into a new layout. */
export function readObjects(roomId, root = REPO) {
  const m = JSON.parse(readFileSync(`${root}/content/rooms/${roomId}/map.json`, 'utf8'));
  return m.layers.find((l) => l.name === 'objects').objects.map((o) => ({
    type: o.type ?? o.class, name: o.name, x: o.x / 32, y: o.y / 32, w: o.width / 32, h: o.height / 32,
    props: Object.fromEntries((o.properties ?? []).map((p) => [p.name, p.value])),
  }));
}
