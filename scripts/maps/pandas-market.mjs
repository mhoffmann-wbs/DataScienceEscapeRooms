import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const ROOT = REPO;
const B = 336;
const W = 26, H0 = 20, H = 21;
const d = (n) => '.'.repeat(n);
const row = (inner) => 'L<' + inner + '>R';
const walls = [
  '#'.repeat(W),
  'L#' + '=w==w===wP==DD===U=w=w' + '#R',
  row('t....m.r.......l...nnt'),
  row(d(22)),
  row('.' + '..' + '.' + '..' + '.' + '..' + '.' + '..' + 'gG' + '..' + '.' + '..' + '..q'),
  row('.' + 'vV' + '.' + 'kp' + 'e' + 'kK' + '.' + 'hH' + 'fF' + 'vV' + '.' + 'cV' + '.qz'),
  row(d(22)),
  row(d(22)),
  row(d(22)),
  row('.' + 'kK' + '.' + 'vV' + '.' + 'kV' + '.' + 'kK' + '..' + 'vV' + '.' + 'kV' + '.zq'),
  row(d(22)),
  row(d(22)),
  row('zz..q..' + '........' + '|' + '######'),
  row('zz.....' + '...kK...' + '|' + '=O===='),
  row('.......' + '.n..n...' + 'E' + 'S..a.T'),
  row('s......' + '.o..o...' + '.' + d(6)),
  row('ss.....' + '.n..n...' + '.' + d(6)),
  row('.......' + '.......t' + '|' + 'Q.y..t'),
  row('ts.x.s.' + 'q.....t.' + '|' + '......'),
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, '<': B + 1, '>': B + 2, '=': B, w: B + 3, D: 5, P: B + 26, U: B + 27, O: B + 28,
  '|': 142, E: 143,
  v: B + 16, V: B + 17, h: B + 18, H: B + 19, k: B + 20, K: B + 21, c: B + 22, p: B + 23,
  g: B + 6, G: B + 7, f: B + 8, F: B + 9,
  n: B + 31, x: B + 29, z: 52, s: 71, q: 53, e: 48, r: 35, m: 29, l: 77, t: 7,
  a: 50, y: 51, T: 10, S: 11, Q: 12, o: 133,
};
const wallData = grid(walls, legend);
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const RUG = [[164, 165, 166], [167, 168, 169], [170, 171, 172]];
const floor = [];
for (let y = 0; y < H0; y++) for (let x = 0; x < W; x++) {
  let t = 44;
  if (inRect(x, y, 2, 2, 23, 3) || inRect(x, y, 13, 4, 16, 6)) t = B + 4;
  if (inRect(x, y, 9, 12, 16, 18)) t = 66;
  if (inRect(x, y, 18, 14, 23, 18)) t = 0;
  if (inRect(x, y, 19, 15, 21, 17)) t = RUG[y - 15][x - 19];
  floor.push(t);
}
const decor = new Array(W * H0).fill(null);
const above = new Array(W * H0).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 30, [13, 6], [16, 6]);
put(decor, B + 5, [5, 7], [11, 6], [20, 10], [8, 11], [4, 12], [3, 14], [5, 15], [7, 17], [4, 17], [6, 13], [17, 7], [22, 11]);
// awnings over every stall's back row
const awn = { r: [B + 10, B + 11], g: [B + 12, B + 13], b: [B + 14, B + 15] };
for (const [x, y, c] of [[3, 4, 'g'], [6, 4, 'r'], [9, 4, 'b'], [12, 4, 'r'], [16, 4, 'g'], [19, 4, 'b'],
  [3, 8, 'g'], [6, 8, 'r'], [9, 8, 'b'], [12, 8, 'g'], [16, 8, 'r'], [19, 8, 'b']]) put(above, awn[c][0], [x, y]), put(above, awn[c][1], [x + 1, y]);
put(above, B + 24, ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((x) => [x, 7]));
put(above, B + 24, ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((x) => [x, 11]));
put(above, B + 25, [18, 3]);
put(above, 229, [20, 15]);
put(above, B + 10, [12, 12]); put(above, B + 11, [13, 12]);

const at = {
  spawn: [15, 3.4], exit: [14, 1], register: [9, 2], 'price-tags': [7, 5], 'card-terminal': [19, 5], ledger: [21, 14],
  envelopes: [20, 17], report: [23, 14], 'market-plan': [11, 1], 'market-rules': [19, 1], rota: [19, 13], complaint: [7, 2],
  'price-board': [8, 5], handbook: [17, 2],
};
// The layout was drawn 20 rows tall; a third entrance-hall row goes in at y = 3, so returning
// players arrive in front of the door, not on the fountain.
const grow = (layer, keep) => [...layer.slice(0, 4 * W), ...(keep ? layer.slice(3 * W, 4 * W) : new Array(W).fill(null)), ...layer.slice(4 * W)];
const shiftY = (y) => (y >= 4 ? y + 1 : y);
const objects = readObjects('pandas-market', ROOT).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y: o.name === 'spawn' ? 3.5 : shiftY(y) };
});
console.log(writeMap({ root: ROOT, roomId: 'pandas-market', width: W, height: H, layers: { floor: grow(floor, true), decor: grow(decor), walls: grow(wallData, true), above: grow(above) }, objects }));
