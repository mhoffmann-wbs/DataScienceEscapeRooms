import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const root = REPO;
const B = 272;
const W = 30, H = 19;
// x: 0-1 left wall, 2-17 Studio (rows 2-8) over the foyer's west half, 18 divider, 19-27 staff room
// (rows 2-8) over the foyer's east half, 28-29 right wall. Rows 9-10: the Studio's back wall facing the foyer.
const walls = [
  '#'.repeat(W),
  'L#' + '=s==s=1234=s==s=' + '=' + '-aNOI--a-' + '#R',
  'Lm' + '......5555......' + '|' + 'gQ....q.Z' + 'rR',
  'Lm' + '................' + '|' + '......c..' + 'rR',
  'Lm' + '.[]]]])..[]]]]).' + '|' + '.12.....k' + 'rR',
  'Lm' + '.[]]]])..[]]]]).' + '|' + '.34......' + 'rR',
  'Lm' + '.[]]]])..[]]]]).' + '|' + '.....####' + 'rR',
  'Lm' + '.[]]]])..[]]]]).' + '|' + '.....=P=P' + 'rR',
  'Lm' + '................' + '|' + 'ABCD.....' + 'rR',
  'Lm' + '#######..#######' + '|' + '.........' + 'rR',
  'Lm' + '=M=s=C=..=Fs~~Ps' + 'E' + '.........' + 'rR',
  'Lm' + 'S.....u..c......' + '.' + 't....h...' + 'rR',
  'Lm' + 'xyz........vvvv.' + '.' + '.vvv.....' + 'rR',
  'Lm' + '................' + '.' + '.........' + '%R',
  'Lm' + '................' + '.' + '.........' + '%R',
  'Lm' + 'io.io..vvvv..>n<' + '.' + '.........' + 'rR',
  'Lm' + '.....j..........' + '.' + '...j.67..' + 'rR',
  'Lmg' + '..............t' + '.' + '..g..89.g' + 'rR',
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, l: 114, m: B + 1, r: B + 2, '-': 3, '=': B, '|': 142, E: 143, '%': null,
  s: B + 13, 1: B + 5, 2: B + 6, 3: B + 7, 4: B + 8, 5: B + 9, '[': B + 10, ']': B + 11, ')': B + 12,
  a: 135, O: 101, N: 26, I: 9, g: 7, q: 10, c: 224, Z: 11, k: 80, P: B + 28,
  A: B + 17, B: B + 18, C: B + 19, D: B + 20,
  M: B + 24, F: B + 30, '~': B + 31, S: B + 25, x: B + 21, y: B + 22, z: B + 23, u: 99, v: 103,
  '>': 120, '<': 121, n: 29, j: B + 26, t: B + 27, h: 77, o: 133, i: 132, Q: 35, 6: 116, 7: 117, 8: 122, 9: 123,
};
// clipboard (tally-note) sits at x 7 row 10 (C in the row string), the clicker stand at x 11 row 11 (c)
const wallData = grid(walls, { ...legend,
  1: (x, y) => (y === 4 ? 122 : B + 5), 2: (x, y) => (y === 4 ? 123 : B + 6), 3: (x, y) => (y === 5 ? 118 : B + 7), 4: (x, y) => (y === 5 ? 119 : B + 8), C: (x, y) => (y === 10 ? B + 29 : B + 19), c: (x, y) => (y === 11 ? 100 : 224) });
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const runner = (cells) => {
  const has = (x, y) => cells.some(([a, b]) => a === x && b === y);
  const out = new Map();
  for (const [x, y] of cells) {
    const m = (has(x, y - 1) ? 0 : 1) | (has(x + 1, y) ? 0 : 2) | (has(x, y + 1) ? 0 : 4) | (has(x - 1, y) ? 0 : 8);
    let t = 144 + m;
    if (m === 0) {
      if (!has(x - 1, y - 1)) t = 160;
      else if (!has(x + 1, y - 1)) t = 161;
      else if (!has(x - 1, y + 1)) t = 162;
      else if (!has(x + 1, y + 1)) t = 163;
    }
    out.set(`${x},${y}`, t);
  }
  return out;
};
const cells = [];
for (let x = 9; x <= 27; x++) cells.push([x, 13], [x, 14]);
for (let y = 3; y <= 12; y++) cells.push([9, y], [10, y]);
const red = runner(cells);
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = B + 4;
  if (x <= 17 && y <= 8) t = B + 3;
  if (inRect(x, y, 19, 2, 27, 7) && !(y >= 6 && x >= 24)) t = 0;
  if (inRect(x, y, 2, 11, 5, 11)) t = 0;
  if (inRect(x, y, 14, 15, 18, 16) || inRect(x, y, 23, 15, 26, 17)) t = 95;
  t = red.get(`${x},${y}`) ?? t;
  if (x === 28 && (y === 13 || y === 14)) t = 182;
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cs) => cs.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 14, ...[4, 5, 6, 7].flatMap((y) => [[2, y], [17, y]]));
for (let y = 3; y <= 8; y++) put(above, B + 15, [9, y]), put(above, B + 16, [10, y]);

const at = {
  spawn: [25.5, 14], exit: [27, 13], handbook: [24, 11],
  office: [22, 1], 'office-note': [21, 1], 'edith-note': [23, 1], rota: [25, 2],
  printer: [21, 8], snacks: [3, 12], 'tobias-note': [4, 12],
  tally: [8, 11], 'tally-note': [7, 10], clicker: [11, 11], 'fire-notice': [12, 10], newspaper: [16, 15],
};
const objects = readObjects('sql-cinema', root).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root, roomId: 'sql-cinema', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
