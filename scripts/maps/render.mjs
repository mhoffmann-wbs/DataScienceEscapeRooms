// Renders a map to a PNG for a look at a layout: node scripts/maps/render.mjs content/rooms/<roomId>/map.json out.png [--objects]
// With --objects, interactables are outlined: red puzzle, yellow clue, green door, blue spawn, white handbook, cyan area.
import { readFileSync, writeFileSync } from 'node:fs';
import { decode, encode } from './pngio.mjs';
import { REPO } from './mapkit.mjs';
const ROOT = process.env.ROOT ?? REPO;
const [mapPath, out, flag] = process.argv.slice(2);
const SCALE = Number(process.env.SCALE ?? 1);
const map = JSON.parse(readFileSync(mapPath, 'utf8'));
const ts = decode(readFileSync(ROOT + '/content/tilesets/tiles.png'));
const T = 32, cols = ts.w / T, W = map.width * T, H = map.height * T, px = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) px.set([20, 20, 24, 255], i * 4);
const blend = (i, r, g, b, a) => { const s = a / 255; px[i] = px[i] * (1 - s) + r * s; px[i + 1] = px[i + 1] * (1 - s) + g * s; px[i + 2] = px[i + 2] * (1 - s) + b * s; };
for (const l of map.layers) if (l.type === 'tilelayer') l.data.forEach((gid, k) => {
  if (!gid) return; const id = gid - 1, sx = (id % cols) * T, sy = Math.floor(id / cols) * T, dx = (k % map.width) * T, dy = Math.floor(k / map.width) * T;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const si = ((sy + y) * ts.w + sx + x) * 4; const a = ts.px[si + 3]; if (a) blend(((dy + y) * W + dx + x) * 4, ts.px[si], ts.px[si + 1], ts.px[si + 2], a); }
});
if (flag === '--objects') {
  const colr = { puzzle: [255, 60, 60], clue: [255, 220, 40], door: [60, 255, 90], spawn: [60, 140, 255], reference: [255, 255, 255], area: [40, 240, 240] };
  for (const o of map.layers.find(l => l.name === 'objects').objects) {
    const c = colr[o.type || o.class] || [255, 0, 255]; const x0 = Math.round(o.x), y0 = Math.round(o.y), w = Math.max(4, Math.round(o.width)), h = Math.max(4, Math.round(o.height));
    for (let x = x0; x < x0 + w; x++) for (const y of [y0, y0 + 1, y0 + h - 2, y0 + h - 1]) if (x >= 0 && x < W && y >= 0 && y < H) blend((y * W + x) * 4, ...c, 255);
    for (let y = y0; y < y0 + h; y++) for (const x of [x0, x0 + 1, x0 + w - 2, x0 + w - 1]) if (x >= 0 && x < W && y >= 0 && y < H) blend((y * W + x) * 4, ...c, 255);
  }
}
writeFileSync(out, encode({ w: W, h: H, px }));
