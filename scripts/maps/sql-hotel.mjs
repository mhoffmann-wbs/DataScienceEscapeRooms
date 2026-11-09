import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const root = REPO;
const B = 240;
const W = 28, H = 18;
// x: 0-1 left wall, 2-11 back office (top) and bar (bottom), 12 divider, 13-25 lobby, 26-27 right wall
const walls = [
  '#'.repeat(W),
  'L#' + '-F-N-A-a--' + '=' + '=s=kK=s=P=vVw' + '#R',
  'Ll' + 'Y.ZgC.M.SS' + 'E' + '.......5.G..g' + 'rR',
  'Ll' + '....c.c...' + '.' + '.............' + 'rR',
  'Ll' + '..........' + '.' + '..1234.......' + 'rR',
  'Ll' + '..hH..qq..' + '|' + '.............' + 'rR',
  'Ll' + '..........' + '|' + '.p......h.p..' + 'rR',
  'Llg' + 'X.......' + '.' + '|' + '.............' + 'rR',
  'Lm' + '########..' + '|' + '.............' + '%R',
  'Lm' + '=s=w=s==..' + '|' + '.............' + '%R',
  'Lm' + '6789...g..' + '|' + '............t' + 'rR',
  'Lm' + '..........' + '|' + '.f...f.......' + 'rR',
  'Lm' + 'bdTei.....' + '|' + '..jnj.....>B<' + 'rR',
  'Lm' + 'xx.xx.DDD.' + 'E' + '.............' + 'rR',
  'Lm' + '......yz0<' + '.' + '..uU.........' + 'rR',
  'Lm' + '......OO..' + '.' + '.........>B<.' + 'rR',
  'Lmg' + '...f.....' + '.' + '.......g....f' + 'rR',
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, l: 114, m: B + 1, r: B + 2, '-': 3, '=': B, '|': 142, E: 143, '%': null,
  F: 31, N: 9, A: 41, a: 135, s: B + 30, k: B + 10, K: B + 11, P: B + 29, v: B + 20, V: B + 21, w: B + 23,
  Y: 12, Z: 11, g: 7, C: 33, M: 32, S: B + 12, c: 224, h: 77, H: B + 14, X: 80, q: 35,
  1: B + 6, 2: B + 7, 3: B + 8, 4: B + 9, 5: 207, G: B + 22, p: B + 26, j: 37, n: 29, u: 118, U: 119, f: 134, t: B + 31,
  '>': 120, '<': 121, B: 133,
  6: 124, 7: 125, 8: 126, 9: 127, b: 128, d: 129, T: B + 27, e: 130, i: 131, x: 132,
  y: B + 15, z: B + 16, 0: B + 17, D: B + 18, O: B + 28,
};
const rows = walls.map((r) => r);
// the manager's desk is h H at x 4-5 row 5 (h is the lectern elsewhere): fix the clash by position
const wallData = grid(rows, { ...legend, h: (x, y) => (y === 5 ? B + 13 : 77) });
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
/** Runner/rug tiles for a set of cells: 144 + mask of bordered sides, or 160-163 for inside corners. */
const runner = (cells) => {
  const has = (x, y) => cells.some(([a, b]) => a === x && b === y);
  const out = new Map();
  for (const [x, y] of cells) {
    let m = (has(x, y - 1) ? 0 : 1) | (has(x + 1, y) ? 0 : 2) | (has(x, y + 1) ? 0 : 4) | (has(x - 1, y) ? 0 : 8);
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
for (let x = 17; x <= 25; x++) cells.push([x, 8], [x, 9]);
for (let y = 5; y <= 7; y++) cells.push([17, y], [18, y]);
const hallRunner = runner(cells);
const cardRug = [];
for (let x = 7; x <= 11; x++) for (let y = 13; y <= 16; y++) cardRug.push([x, y]);
const cardRunner = runner(cardRug);
const LOUNGE = [[164, 165, 165, 165, 166], [167, 168, 168, 168, 169], [167, 168, 168, 168, 169], [167, 168, 168, 168, 169], [170, 171, 171, 171, 172]];
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = B + 3;
  if (x <= 12 && y <= 7) t = B + 4;
  if (x <= 11 && y >= 8) t = B + 5;
  if (inRect(x, y, 13, 2, 19, 3)) t = B + 5;
  if (inRect(x, y, 14, 11, 18, 15)) t = LOUNGE[y - 11][x - 14];
  t = hallRunner.get(`${x},${y}`) ?? cardRunner.get(`${x},${y}`) ?? t;
  if (x === 26 && (y === 8 || y === 9)) t = 182;
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cs) => cs.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 25, [25, 8], [23, 9], [21, 8], [19, 9], [18, 7], [17, 5]);
put(above, B + 19, [14, 5], [23, 5]);
put(above, B + 24, [16, 10], [21, 12], [8, 11], [20, 3]);

const at = {
  spawn: [23.5, 9], exit: [25, 8], reception: [16, 4], logbook: [17, 4], 'door-log': [10, 2], 'card-holders': [6, 2],
  'master-card': [8, 2], accusation: [4, 5], floorplan: [3, 1], alibis: [4, 12], statement: [10, 14], newspaper: [16, 12],
  guard: [22, 2], painting: [21, 1], handbook: [21, 6],
};
const objects = readObjects('sql-hotel', root).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root, roomId: 'sql-hotel', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
