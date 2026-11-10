import { grid, writeMap, REPO } from './mapkit.mjs';
const root = REPO;
const B = 720;
const W = 30, H = 20;
const d = (n) => '.'.repeat(n);
// x: 0 L, 1 l, 2-9 map room, 10 wall, 11-18 entrance hall, 19 wall, 20-27 break room, 28 r, 29 R
// y: 2-7 map room / hall / break room, 8-9 wall (the hall opens at x 11-14), 10-18 dispatch office (x 2-14) and garage (x 16-27), x 15 wall
const walls = [
  '#'.repeat(W),
  'L#' + '=wm=w=w=' + '=' + 'q==DD=n=' + '=' + 'wb=w=t=w' + '#R',
  'Ll' + 'u......P' + '|' + '.......H' + '|' + '......OO' + 'rR',
  'Ll' + '..c.....' + '|' + '.h......' + '|' + '.j...d..' + 'rR',
  'Ll' + '..Y.....' + 'E' + d(8) + 'E' + '.Y...Y..' + 'rR',
  'Ll' + d(8) + '.' + d(8) + '.' + d(8) + 'rR',
  'Ll' + '.....yx.' + '.' + '......yx' + '.' + '.....yx.' + 'rR',
  'Ll' + 'P......u' + '|' + 'P......P' + '|' + 'P.......' + 'rR',
  'Ll' + '#'.repeat(8) + '#' + '....' + '####' + '#' + '#'.repeat(8) + 'rR',
  'Ll' + 'wp=sSsSs=' + '....' + '======k=w=w=w' + 'rR',
  'Ll' + '..a..........' + '|' + 'zzz...K..zzz' + 'rR',
  'Ll' + '..Y..........' + '|' + d(12) + 'rR',
  'Ll' + d(13) + 'E' + d(12) + 'rR',
  'Ll' + d(13) + '.' + d(12) + 'rR',
  'Ll' + '......MNF....' + '.' + '.Vv..Vv..Vv.' + 'rR',
  'Ll' + '......Y......' + '|' + d(12) + 'rR',
  'Ll' + '.1.1.....1.1.' + '|' + d(12) + 'rR',
  'Ll' + '.Y.Y.....Y.Y.' + '|' + '..Vv...Vv...' + 'rR',
  'Ll' + 'P' + d(12) + '|' + d(12) + 'rR',
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, l: B + 1, r: B + 2, '=': B, '|': 142, E: 143, D: 193,
  w: B + 8, s: B + 9, S: B + 10, m: B + 11, p: B + 12, q: B + 13, t: B + 14, b: B + 15, n: B + 16, k: B + 25,
  a: B + 17, c: B + 18, d: B + 19, j: B + 20, K: B + 21, M: B + 22, N: B + 23, F: B + 24,
  V: B + 26, v: B + 27, z: B + 28, Y: B + 29, O: B + 30, H: B + 31,
  P: 7, 1: 17, 2: 8, u: 76, h: 77, y: 118, x: 119,
};
const wallData = grid(walls, legend);
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = B + 3;
  if (inRect(x, y, 2, 2, 9, 7)) t = 4;
  if (inRect(x, y, 10, 5, 10, 6) || inRect(x, y, 11, 2, 18, 9) || inRect(x, y, 19, 5, 19, 6)) t = B + 5;
  if (inRect(x, y, 20, 2, 27, 7)) t = B + 7;
  if (inRect(x, y, 2, 10, 14, 18)) t = B + 4;
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
// hazard stripes under the chargers
put(decor, B + 6, ...[16, 17, 18, 19, 25, 26, 27].map((x) => [x, 11]));

const P = (name, type, x, y, w = 1, h = 2, props) => ({ name, type, x, y, w, h, props });
const objects = [
  P('spawn', 'spawn', 14.5, 4.5, 0, 0),
  P('exit', 'door', 14, 1, 2, 2, { doorTo: 'lobby' }),
  P('handbook', 'reference', 12, 3),
  ...[['raw-log', 4, 10], ['street', 4, 3], ['weather', 25, 3], ['leaks', 21, 3], ['channels', 22, 10], ['promises', 8, 14]]
    .map(([n, x, y]) => P(n, 'puzzle', x, y, 1, 2, { puzzleId: n })),
  ...[['shift-plan', 3, 9], ['test-rule', 17, 1], ['city-map', 4, 1], ['weather-scale', 25, 1], ['data-dictionary', 21, 1],
      ['promise-poster', 11, 1], ['network-fax', 10, 14], ['telemetry-manual', 21, 9]]
    .map(([n, x, y]) => P(n, 'clue', x, y, 1, 2, { clueId: n })),
];
console.log(writeMap({ root, roomId: 'ml-courier', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
