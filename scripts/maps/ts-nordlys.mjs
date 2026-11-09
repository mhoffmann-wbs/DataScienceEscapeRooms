import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const ROOT = REPO;
const B = 368;
const W = 30, H = 20;
const row = (inner, left = '<') => 'L' + left + inner + '>R';
const check = (s, n) => { if (s.length !== n) throw new Error(`segment "${s}" has ${s.length}, expected ${n}`); return s; };
// north band: generator room x2-10 | mess x12-19 | chief's office x21-27
const north = (gen, mess, chief) => row(check(gen, 9) + '|' + check(mess, 8) + '|' + check(chief, 7));
// south band: lab x2-9 | instrument room x11-18 | supply depot x20-27
const south = (lab, echo, depot) => row(check(lab, 8) + '|' + check(echo, 8) + '|' + check(depot, 8));
const walls = [
  '#'.repeat(W),
  'L#' + '==k=GP===' + '=' + '==A==N==' + '=' + '===N==k' + '#R',
  north('TU....FH.', 'KK.....t', 'S..cn.Q'),
  north('VW......d', '....ab..', '.......'),
  north('......lb.', '...hijf.', '.......'),
  north('d........', '....gm..', 't.....t'),
  row('#'.repeat(7) + '..' + '##' + '..' + '#'.repeat(7) + '..' + '####'),
  row('=z=====' + '..' + 'X=' + '..' + '=====O=' + '..' + '==k='),
  row(check('ZZZ..l', 6) + 'E' + check('..Mr..qq...........', 19)),
  row(check('......', 6) + '.' + d(19), '.'),
  row(check('......', 6) + '.' + check('.......x.........xx', 19), '.'),
  row(check('.uu..t', 6) + '|' + check('...................', 19)),
  row('###' + '..' + '#'.repeat(7) + '..' + '#'.repeat(7) + '..' + '###'),
  row('=k=' + '..' + '=C=====' + '..' + '=C===z=' + '..' + '=N='),
  south('cFc....w', '.Er..q.q', 'x....Ydd'),
  south('........', '........', '........'),
  south('.ee...e.', '....G...', 'x.....dd'),
  south('.ss...s.', '........', '........'),
  south('w......t', 't.....st', 'xx....dt'),
  '#'.repeat(W),
];
function d(n) { return '.'.repeat(n); }
const legend = {
  '#': 2, L: 112, R: 113, '<': B + 1, '>': B + 2, '=': B, A: B + 3, N: B + 4, '|': 142, E: 143,
  k: B + 21, G: B + 17, P: B + 18, z: B + 27, X: B + 31, O: B + 29, C: B + 28,
  T: B + 11, U: B + 12, V: B + 13, W: B + 14, F: B + 15, H: B + 16, d: 39, l: B + 30, b: 35,
  K: 69, t: 7, a: 116, i: 122, j: 123, h: 120, f: 121, g: 118, m: 119,
  S: 12, Q: 81, c: 19, n: 35,
  Z: B + 19, u: B + 20, M: 32, r: 93, q: 92, x: 80, Y: B + 24,
};
// per-band letters that clash get their own legends
const north2 = { ...legend, b: 35, c: 19, n: 35 };
const southLegend = { ...legend, c: 227, F: B + 23, w: 228, e: 20, s: 223, E: B + 22, G: 107, r: 93, q: 92 };
const hubLegend = { ...legend, l: 77 };
const wallRows = walls.map((r, y) => {
  if (y >= 14 && y <= 18) return grid([r], southLegend);
  if (y >= 8 && y <= 11) return grid([r], hubLegend);
  if (y >= 2 && y <= 5) return grid([r], { ...north2, b: y === 3 ? 117 : 35 });
  return grid([r], legend);
});
const wallData = wallRows.flat();
if (wallData.length !== W * H) throw new Error('bad size ' + wallData.length);
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = B + 5;
  if (inRect(x, y, 2, 2, 10, 5)) t = 42;
  if (inRect(x, y, 12, 2, 19, 5)) t = 0;
  if (inRect(x, y, 21, 2, 27, 5)) t = 4;
  if (inRect(x, y, 2, 8, 7, 11) || inRect(x, y, 1, 9, 1, 10)) t = B + 6;
  if (inRect(x, y, 2, 14, 9, 18)) t = 1;
  if (inRect(x, y, 11, 14, 18, 18)) t = B + 10;
  if (inRect(x, y, 20, 14, 27, 18)) t = 42;
  floor.push(t);
}
floor[9 * W + 1] = 191;
floor[10 * W + 1] = 191;
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 7, [2, 9], [3, 10], [4, 9], [5, 10], [3, 9]);
put(decor, B + 8, [2, 5], [10, 2], [19, 5], [27, 4], [9, 11], [21, 9], [27, 10], [2, 18], [11, 18], [27, 15], [7, 15], [16, 9]);
put(decor, B + 9, ...[13, 14, 15, 16, 17].map((x) => [x, 15]), ...[11, 12, 13, 14].map((x) => [x, 9]));
put(above, B + 26, ...Array.from({ length: 19 }, (_, i) => [i + 9, 11]));
put(above, B + 25, [5, 3], [15, 3], [23, 4], [12, 9], [19, 9], [25, 9], [6, 16], [15, 17], [23, 16]);

const at = {
  spawn: [4.5, 9.6], exit: [1, 9], logbook: [8, 4], 'logbook-page': [9, 4], gauge: [6, 1], 'gauge-panel': [7, 1],
  aurora: [14, 1], chief: [24, 2], 'chief-notebook': [25, 2], 'order-form': [20, 7], handbook: [7, 8],
  freezer: [3, 14], 'tech-note': [8, 13], echo: [12, 14], 'echo-manual': [17, 13], supply: [25, 14],
};
const objects = readObjects('ts-nordlys', ROOT).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root: ROOT, roomId: 'ts-nordlys', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
