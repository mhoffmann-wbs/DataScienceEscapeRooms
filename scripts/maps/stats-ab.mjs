import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const root = REPO;
const B = 528;
const W = 30, H = 18;
const d = (n) => '.'.repeat(n);
// x: 0-1 left wall, 2-11 office, 12 divider, 13-19 tasting room, 20 divider, 21-27 foyer, 28-29 right wall
// y: 0-1 top wall, 2-7 office / tasting / foyer, 8-9 wall, 10-16 packing hall, 17 bottom wall
const walls = [
  '#'.repeat(W),
  'L#' + '-P--Aw-N--' + '-' + '==c====' + '=' + '==SS===' + '#R',
  'Ll' + 'k' + d(8) + 'g' + '|' + 'F' + d(6) + '|' + 'H' + d(4) + 'C.' + 'rR',
  'Ll' + d(7) + 'nD.' + '|' + '..bb..e' + 'E' + d(6) + 'K' + 'rR',
  'Ll' + '..VJ' + d(6) + '|' + '..ss...' + '.' + d(7) + 'rR',
  'Ll' + 'U.h' + d(6) + 'f' + '|' + d(7) + '.' + d(7) + '.R',
  'Ll' + d(4) + '[o]' + d(3) + '|' + '.bb.bb.' + '|' + 'GG' + d(5) + '.R',
  'Ll' + 'g' + d(9) + '|' + '.ss.ss.' + '|' + d(6) + 'g' + 'rR',
  'Lm' + '#'.repeat(7) + '..' + '#'.repeat(9) + '#' + '##..###' + 'rR',
  'Lm' + '=====Q=' + '..' + '=====TT==' + '=' + '==..=O=' + 'rR',
  'Lm' + d(26) + 'rR',
  'Lm' + d(11) + 'XY' + '..' + 'uu' + d(6) + 'ppp' + 'rR',
  'Lm' + 'u' + 'abcd' + 'z' + d(5) + 'IJ' + d(12) + 'p' + 'rR',
  'Lm' + d(26) + 'rR',
  'Lm' + d(26) + 'rR',
  'Lm' + 'y' + d(6) + 'abcd' + '7' + d(4) + 'abcd' + '7' + d(3) + 'pp' + 'rR',
  'Lm' + 'yy' + d(4) + 'uu' + d(12) + 'yy' + '.' + 'y' + 'pp' + 'rR',
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, l: 114, m: B + 4, r: B + 5, '-': 3, '=': B, '|': 142, E: 143,
  P: 73, A: 9, w: 88, N: 75, c: B + 30, O: B + 30, S: B + 25, T: B + 25, Q: B + 31,
  k: 12, g: 7, n: 18, D: 19, V: 72, J: 35, h: 224, U: 33, f: 81, '[': 120, o: 133, ']': 121,
  F: 70, b: B + 19, s: 223, e: B + 21, H: B + 27, C: B + 24, K: 74, G: B + 22,
  a: B + 6, d: B + 9, z: B + 10, X: B + 11, Y: B + 12, I: B + 13, u: B + 20, p: B + 28, y: 71, 7: 80,
};
const wallData = grid(walls, legend);
const set = (layer, t, x, y) => (layer[y * W + x] = t);
// context-dependent tiles: the second halves of two-tile pieces, the conveyor and the conche
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const ch = walls[y][x];
  if (y >= 10 && 'abcd'.includes(ch)) set(wallData, B + 6 + 'abcd'.indexOf(ch), x, y);
  if ((ch === 'S' || ch === 'T') && walls[y][x - 1] === ch) set(wallData, B + 26, x, y);
  if (ch === 'G' && walls[y][x - 1] === 'G') set(wallData, B + 23, x, y);
}
set(wallData, B + 14, 14, 12);

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const RUG = [[164, 165, 166], [167, 168, 169], [170, 171, 172]];
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = B + 1;
  if (inRect(x, y, 2, 2, 11, 7)) t = 0;
  if (inRect(x, y, 6, 5, 8, 7)) t = RUG[y - 5][x - 6];
  if (inRect(x, y, 13, 2, 19, 7)) t = B + 2;
  if (inRect(x, y, 20, 2, 27, 7) || inRect(x, y, 23, 8, 24, 9)) t = B + 3;
  if (x === 28 && (y === 5 || y === 6)) t = 55;
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
// a red runner from the exit to the opening into the hall
const runner = new Set();
for (let x = 23; x <= 27; x++) for (const y of [5, 6]) runner.add(`${x},${y}`);
for (let y = 7; y <= 9; y++) for (const x of [23, 24]) runner.add(`${x},${y}`);
const has = (x, y) => runner.has(`${x},${y}`);
for (const key of runner) {
  const [x, y] = key.split(',').map(Number);
  let mask = 0;
  if (!has(x, y - 1)) mask |= 1;
  if (!has(x + 1, y) && x !== 27) mask |= 2;
  if (!has(x, y + 1)) mask |= 4;
  if (!has(x - 1, y)) mask |= 8;
  let t = 144 + mask;
  if (mask === 0) {
    if (!has(x - 1, y - 1)) t = 160;
    else if (!has(x + 1, y - 1)) t = 161;
    else if (!has(x - 1, y + 1)) t = 162;
    else if (!has(x + 1, y + 1)) t = 163;
  }
  put(decor, t, [x, y]);
}
put(decor, 211, [12, 13], [13, 13], [14, 13], [15, 13]);
put(decor, B + 15, [15, 12], [12, 11]);
put(decor, B + 16, [19, 14], [8, 14]);
put(decor, B + 29, [4, 16], [3, 15], [22, 15]);
put(above, B + 18, ...[13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27].map((x) => [x, 10]));
put(above, B + 17, [5, 14], [11, 14], [17, 13], [23, 13], [15, 3], [14, 6], [18, 6]);

const at = {
  spawn: [24.5, 4.5], exit: [27, 5], release: [27, 3], handbook: [21, 2],
  plan: [3, 1], agenda: [6, 1], 'ana-note': [9, 1], orders: [9, 3], checkout: [4, 4],
  tasting: [13, 2], 'tasting-sheet': [19, 3],
  scale: [7, 12], 'qc-manual': [7, 9],
};
const objects = readObjects('stats-ab', root).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root, roomId: 'stats-ab', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
