import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const root = REPO;
const B = 560;
const W = 28, H = 20;
const d = (n) => '.'.repeat(n);
// x: 0-1 left wall, 2-12 counter hall, 13 divider, 14-25 Ferdinand's workshop, 26-27 right wall
// y: 0-1 top wall, 2-7 counter hall / workshop, 8-9 wall, 10-18 sorting hall, 19 bottom wall
const walls = [
  '#'.repeat(W),
  'L#' + '==O=DD==M==' + '=' + '--Z--w--v---' + '#R',
  'Ll' + 'P' + d(6) + 'S' + '..' + 'g' + '|' + 'T' + d(6) + 'k' + '..' + 'g' + 'K' + 'qR',
  'Ll' + '.H' + d(9) + 'E' + d(12) + 'qR',
  'Ll' + d(11) + '.' + '...U' + d(4) + 'F' + '...' + 'qR',
  'Ll' + 'bb' + d(9) + '.' + '...' + '.' + d(4) + 'h' + '...' + 'qR',
  'Ll' + '...' + 'CC' + '.' + 'CC' + '...' + '|' + 'WW' + d(8) + '.k' + 'qR',
  'Ll' + 'p..' + 'h' + '...' + 'h' + '...' + '|' + d(5) + 'YV' + d(4) + 'g' + 'qR',
  'Ll' + '#'.repeat(8) + '..' + '#'.repeat(8) + '..' + '#'.repeat(4) + 'rR',
  'Ll' + '=oo=B=o=' + '..' + '=ooo====' + '..' + '==N=' + 'rR',
  'Ll' + d(24) + 'rR',
  'Ll' + 's' + d(8) + 'III' + d(6) + 'x' + 'A' + 'X' + '.' + 'n' + 'g' + 'rR',
  'Ll' + 's' + '..' + 'tj' + d(4) + 'III' + 'c' + d(9) + 'h' + '.' + 'rR',
  'Ll' + 's' + '..' + 'ii' + d(19) + 'rR',
  'Ll' + d(24) + 'rR',
  'Ll' + d(4) + 'c' + d(4) + 'BB' + d(9) + 'c' + 'c' + d(1) + 's' + 'rR',
  'Ll' + d(15) + 'BB' + d(6) + 's' + 'rR',
  'Ll' + 'u' + d(2) + 'cc' + d(17) + 'uu' + 'rR',
  'Ll' + 'uu' + d(8) + 'c' + d(9) + 'xx' + 'uu' + 'rR',
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, l: B + 1, r: B + 2, q: 115, '-': 3, '=': B, '|': 142, E: 143, D: null,
  O: B + 28, M: B + 27, Z: 110, w: 88, v: 22, o: B + 24, B: B + 25, N: B + 26,
  P: B + 17, S: B + 29, g: 7, H: 77, b: B + 30, C: B + 18, p: B + 16, h: 224,
  T: 10, Y: 91, V: 92, k: 12, K: 81, U: 50, F: 35, W: B + 22,
  I: B + 6, A: B + 23, x: 80, X: 80, n: 18, s: B + 16, t: 51, j: 8, i: 223, c: B + 14, u: B + 15,
};
const wallData = grid(walls, legend);
const set = (layer, t, x, y) => (layer[y * W + x] = t);
// second halves of two-tile pieces
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const ch = walls[y][x];
  if (ch === 'C' && walls[y][x - 1] === 'C' && wallData[y * W + x - 1] === B + 18) set(wallData, B + 19, x, y);
  if (ch === 'B' && y > 9 && walls[y][x - 1] === 'B' && wallData[y * W + x - 1] === B + 12) set(wallData, B + 13, x, y);
  else if (ch === 'B' && y > 9) set(wallData, B + 12, x, y);
}
// Iris: three wide, two tall
for (let i = 0; i < 3; i++) { set(wallData, B + 6 + i, 11 + i, 11); set(wallData, B + 9 + i, 11 + i, 12); }
// left wall beside the counter hall is the post office wall too; the right wall beside the workshop is plain
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const RUG = [[164, 165, 166], [167, 168, 169], [170, 171, 172]];
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = B + 4;
  if (inRect(x, y, 2, 1, 13, 7)) t = B + 3;
  if (inRect(x, y, 14, 2, 25, 7)) t = 0;
  if (inRect(x, y, 16, 3, 18, 5)) t = RUG[y - 3][x - 16];
  if (y === 1 && (x === 6 || x === 7)) t = 194;
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 5, ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].map((x) => [x, 14]));
put(decor, B + 21, [10, 13], [14, 12], [9, 11], [16, 16], [5, 4]);
put(above, B + 31, ...[7, 8, 9, 10, 11].map((x) => [x, 10]));
put(above, B + 20, [6, 12], [17, 12], [8, 16], [21, 15], [14, 17], [7, 4], [4, 6], [20, 4]);

const at = {
  spawn: [7, 3.5], exit: [6, 1], handbook: [3, 3],
  scanner: [9, 2], 'scanner-manual': [10, 1],
  drafts: [16, 1], wiring: [14, 2], logbook: [25, 2], blueprint: [17, 4], 'ferdinand-note': [22, 4],
  timetable: [6, 9], 'iris-plate': [11, 12], sort: [12, 12],
  'jonas-note': [24, 9], apprentice: [24, 11], 'archive-label': [21, 11],
};
const objects = readObjects('nn-post', root).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root, roomId: 'nn-post', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
