import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const ROOT = REPO;
const B = 400;
const W = 30, H = 20;
const check = (s, n) => { if (s.length !== n) throw new Error(`segment "${s}" has ${s.length}, expected ${n}`); return s; };
// office x2-10, its east wall x11, the meadow x12-27
const row = (office, wall, meadow, left = '<') => 'L' + left + check(office, 9) + wall + check(meadow, 16) + '>R';
const walls = [
  '#'.repeat(W),
  'L#' + check('=C==W=====', 10) + check('ffpffffffffpffff', 16) + '#R',
  row('S.e..Pn.t', '|', '.Y.kABCDk.Y.....'),
  row('..c..c...', 'E', '...kEFGHk.......'),
  row('.........', '.', '.............TN.'),
  row('tQ.....K.', '.', '................'),
  row('#######..', '|', 'Y.........b.....'),
  row('==I====..', '|', '................'),
  row('...h.u...', 'E', '...........Y....'),
  row('.....g...', '.', '.....Mq.........', '.'),
  row('.........', '.', '................', '.'),
  row('.....u..t', '|', '................'),
  row('#######..', '|', 'Y...............'),
  row('===O===..', '|', '..............Y.'),
  row('S...s.x..', 'E', '..bbb...........'),
  row('....c....', '.', '..bbb...Zz......'),
  row('.K.......', '.', '..bbb...........'),
  row('.........', '|', '...........Y....'),
  row('txx.....t', '|', 'Y......Zz.......'),
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, '<': B + 1, '>': B + 3, '=': B, f: B + 2, p: B + 30, C: B + 27, W: B + 28, I: B + 29, O: B + 29,
  '|': 142, E: 143,
  S: 12, e: 72, P: 19, n: 35, t: 7, c: 224, Q: 81, K: 69, h: 77, u: B + 20, g: B + 19, s: 10, x: 80,
  Y: B + 31, k: B + 15, A: B + 7, B: B + 8, D: B + 10, F: B + 12, G: B + 13, H: B + 14,
  T: B + 21, N: B + 23, M: B + 18, q: 92, b: B + 26, Z: B + 24, z: B + 25,
};
// letters reused with a different meaning inside the meadow
const meadow = { ...legend, C: B + 9, E: B + 11 };
const wallData = walls.flatMap((r, y) => {
  if (y < 2 || y > 18) return grid([r], legend);
  const left = grid([r.slice(0, 12)], legend);
  const right = grid([r.slice(12, 28)], meadow);
  const edge = grid([r.slice(28)], legend);
  return [...left, ...right, ...edge];
});
if (wallData.length !== W * H) throw new Error('bad size');
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = 0;
  if (inRect(x, y, 2, 8, 10, 11)) t = 1;
  if (inRect(x, y, 12, 2, 27, 18)) t = B + 4;
  if (inRect(x, y, 11, 10, 26, 11) || inRect(x, y, 11, 4, 14, 5) || inRect(x, y, 11, 15, 14, 16) || inRect(x, y, 25, 2, 26, 18) || inRect(x, y, 11, 9, 13, 9)) t = B + 5;
  floor.push(t);
}
floor[9 * W + 1] = 191;
floor[10 * W + 1] = 191;
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 22, ...Array.from({ length: 17 }, (_, i) => [27, i + 2]));
put(decor, B + 6, [16, 5], [19, 6], [14, 7], [21, 5], [18, 13], [23, 9], [15, 12], [20, 17], [23, 6], [22, 9], [13, 16]);
put(above, B + 16, [16, 2], [17, 2], [18, 2], [19, 2]);
put(above, B + 17, ...Array.from({ length: 13 }, (_, i) => [i + 12, 7]), ...Array.from({ length: 13 }, (_, i) => [i + 12, 13]));

const at = {
  spawn: [4.5, 10.4], exit: [1, 9], 'it-note': [4, 7], 'event-calendar': [3, 1], 'cheat-sheet': [6, 1], gate: [7, 9],
  tram: [25, 4], newspaper: [26, 4], events: [4, 2], 'planner-notebook': [8, 2], planner: [7, 2], mode: [17, 9],
  'order-form': [5, 13], stages: [6, 14], handbook: [5, 8],
};
const objects = readObjects('ts-festival', ROOT).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root: ROOT, roomId: 'ts-festival', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
