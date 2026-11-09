import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const root = REPO;
const B = 592;
const W = 28, H = 20;
const d = (n) => '.'.repeat(n);
// x: 0-1 left wall, 2-9 gallery, 10 divider, 11-16 vestibule (exit), 17 divider, 18-25 Amara's office, 26-27 right wall
// y: 0-1 top wall, 2-7 upper rooms, 8-9 wall, 10-18 restoration lab (x 2-16) and crate store (x 18-25), 19 bottom wall
const walls = [
  '#'.repeat(W),
  'L#' + '=N=Q=S==' + '=' + '=hDD==' + '=' + '==P==h==' + '#R',
  'Ll' + 'p......p' + '|' + 'g....g' + '|' + 'k......k' + 'rR',
  'Ll' + 'o.......' + 'E' + 'H.....' + 'E' + '..T..AM.' + 'rR',
  'Ll' + 's.vGvc..' + '.' + d(6) + '.' + '..c..c..' + 'rR',
  'Ll' + d(8) + '.' + d(6) + '.' + d(8) + 'rR',
  'Ll' + 'p......p' + '|' + d(6) + '|' + 'g.......' + 'rR',
  'Ll' + 'o..bb..o' + '|' + 'x....x' + '|' + 'k......g' + 'rR',
  'Ll' + '#'.repeat(8) + '#' + '##..##' + '#' + '####..##' + 'rR',
  'Ll' + '=C=hh==Q===..=h' + '=' + '==Q=..==' + 'rR',
  'Ll' + d(15) + '|' + d(8) + 'rR',
  'Ll' + '.VZ' + d(6) + 'ww' + '..' + 'nm' + '|' + '.O.A..xx' + 'rR',
  'Ll' + 'R' + '...' + 'FFF' + d(8) + 'E' + d(7) + 'x' + 'rR',
  'Ll' + 'R' + '...' + 'FFF' + d(8) + '.' + d(8) + 'rR',
  'Ll' + 'R' + d(14) + '.' + d(8) + 'rR',
  'Ll' + d(9) + 'yy' + d(4) + '|' + 'x.K..J.x' + 'rR',
  'Ll' + 'R' + d(4) + 'FFF' + d(7) + '|' + d(8) + 'rR',
  'Ll' + d(5) + 'FFF' + d(7) + '|' + 'xx....Ox' + 'rR',
  'Ll' + 'RR' + d(13) + '|' + 'xxx..xxx' + 'rR',
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, l: B + 1, r: B + 2, '=': B, '|': 142, E: 143, D: null,
  N: B + 23, Q: B + 27, S: B + 24, h: B + 26, P: B + 25, C: B + 22,
  p: B + 14, s: B + 15, o: B + 31, v: 104, G: 174, c: 224, b: B + 29, g: 7, H: 77, x: 178, k: 12,
  V: 173, T: 10, A: 79, M: 51, Z: 177, w: B + 13, n: 18, m: 35, O: B + 16, F: B + 6, y: B + 19, K: B + 28, J: 175,
};
// R is the right outer wall (113) in the last column and a tablet rack (B+12) inside the room
const wallData = grid(walls.map((row) => row.slice(0, -1).replace(/R/g, 'Ⓡ') + row.slice(-1)), { ...legend, R: 113, 'Ⓡ': B + 12 });
const set = (layer, t, x, y) => (layer[y * W + x] = t);
// the museum label beside the seal case (c is a chair elsewhere)
set(wallData, 180, 7, 4);
// fragment tables: three wide, two deep
for (const [x0, y0] of [[6, 12], [7, 16]]) for (let i = 0; i < 3; i++) { set(wallData, B + 6 + i, x0 + i, y0); set(wallData, B + 9 + i, x0 + i, y0 + 1); }

const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const RUG = [[164, 165, 166], [167, 168, 169], [170, 171, 172]];
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = B + 4;
  if (inRect(x, y, 2, 2, 10, 7)) t = B + 3;
  if (inRect(x, y, 11, 1, 16, 9) || (x === 17 && (y === 4 || y === 5))) t = 1;
  if (inRect(x, y, 18, 2, 25, 9)) t = 0;
  if (inRect(x, y, 20, 5, 22, 7)) t = RUG[y - 5][x - 20];
  if (inRect(x, y, 18, 10, 25, 18) || (x === 17 && (y === 13 || y === 14))) t = B + 30;
  if (inRect(x, y, 22, 8, 23, 9)) t = B + 30;
  if (y === 1 && (x === 13 || x === 14)) t = 194;
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
// a red runner round the seal case
const runner = new Set();
for (let x = 3; x <= 8; x++) for (let y = 3; y <= 5; y++) runner.add(`${x},${y}`);
const has = (x, y) => runner.has(`${x},${y}`);
for (const key of runner) {
  const [x, y] = key.split(',').map(Number);
  let mask = 0;
  if (!has(x, y - 1)) mask |= 1;
  if (!has(x + 1, y)) mask |= 2;
  if (!has(x, y + 1)) mask |= 4;
  if (!has(x - 1, y)) mask |= 8;
  put(decor, 144 + mask, [x, y]);
}
// clay dust round the fragment tables, straw in the crate store
put(decor, B + 5, [5, 13], [10, 12], [6, 15], [11, 17], [4, 12], [13, 16]);
put(decor, B + 18, [19, 12], [20, 11], [22, 16], [24, 17], [21, 15]);
put(above, B + 20, [3, 6], [8, 6], [12, 6], [15, 6]);
put(above, B + 21, [4, 13], [8, 11], [9, 15], [13, 12], [21, 13], [24, 12], [21, 3], [4, 3]);

const at = {
  spawn: [14, 3.5], exit: [13, 1], handbook: [11, 3],
  numerals: [3, 1], 'sign-list': [7, 1], seal: [5, 4], 'seal-caption': [7, 4],
  'blueprint-sheet': [20, 1], blueprint: [20, 3], laptop: [23, 3], 'amara-mail': [24, 3],
  'theo-note': [3, 9], tally: [3, 11], notebook: [15, 11], 'mika-note': [16, 11],
  'archive-label': [21, 11], jar: [23, 15],
};
const objects = readObjects('nn-tablets', root).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root, roomId: 'nn-tablets', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
