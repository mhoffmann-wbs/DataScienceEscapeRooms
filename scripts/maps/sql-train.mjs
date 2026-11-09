import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const root = REPO;
const B = 304;
const W = 32, H = 22;
// Three carriages side by side, joined by gangways over the track (rows 6 and 14):
// the sleeping car (rows 1-4), the dining car (rows 8-12) and the service car (rows 16-20) with the exit.
const walls = [
  '#'.repeat(W),
  'L#' + '=D==D==D==D==D==X=ZD==O=====' + '#R',
  'Lm' + 'S...........................' + 'rR',
  'Lm' + '............................' + 'rR',
  'Lm' + '............................' + 'rR',
  '#'.repeat(27) + '()' + '###',
  't'.repeat(27) + '()' + 'ttt',
  '#'.repeat(27) + '()' + '###',
  'L#' + '==W====w===w===w===w===w=' + '{}' + '=' + '#R',
  'Lm' + '......>T<.>N<.>T<.>T<.>T<...' + 'rR',
  'Lm' + '.abcd.......................' + 'rR',
  'Lm' + '............................' + 'rR',
  'Lm' + '......>T<.>T<.>T<.>T<.>T<...' + 'rR',
  '###' + '()' + '#'.repeat(27),
  'ttt' + '()' + 't'.repeat(27),
  '###' + '()' + '#'.repeat(27),
  'L#' + '=' + '{}' + '=W=M=W==Y=W==W==W==W=W=O=' + '#R',
  'Lm' + '.....s....p...C....ql...h...' + 'rR',
  'Lm' + '.....c....c........c........' + '%R',
  'Lm' + '............................' + '%R',
  'Lm' + '...PP...k...................' + 'rR',
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, m: B + 1, r: B + 2, '=': B, '%': null, '(': null, ')': null, '{': null, '}': null,
  t: B + 5, D: B + 11, X: B + 12, Z: B + 27, O: B + 29, S: B + 26, W: B + 10, w: B + 31,
  '>': B + 17, '<': B + 18, T: 90, N: B + 19, a: B + 13, b: B + 14, c: B + 15, d: B + 16,
  M: B + 22, Y: B + 21, s: 91, p: 92, C: B + 20, q: 93, l: B + 23, h: 77, P: B + 28, k: 178,
};
// 'c' is the counter's third tile in the dining car (row 10) and an office chair in the service car
const wallData = grid(walls, { ...legend, c: (x, y) => (y === 10 ? B + 15 : 224) });
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const ch = walls[y][x];
  let t = y <= 5 ? B + 3 : y <= 13 ? B + 4 : 87;
  if (ch === '(') t = B + 6;
  if (ch === ')') t = B + 7;
  if (ch === '{') t = B + 8;
  if (ch === '}') t = B + 9;
  if (x === 30 && (y === 18 || y === 19)) t = 182;
  if (y >= 17 && y <= 20 && x >= 28 && x <= 29) t = 42;
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cs) => cs.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 30, [24, 2]);
put(above, B + 25, [6, 3], [12, 3], [18, 3], [27, 3], [11, 11], [19, 11], [27, 10], [9, 19], [17, 19], [25, 19]);
put(above, B + 24, [13, 20], [14, 20], [15, 20]);

const at = {
  spawn: [27.5, 19], exit: [29, 18], handbook: [26, 17],
  'attendant-report': [18, 1], newspaper: [13, 9], handheld: [4, 10], 'conductor-note': [5, 10], till: [6, 10],
  speed: [7, 17], 'route-map': [8, 16], doors: [12, 17], 'door-sign': [13, 16], cards: [16, 17], radio: [21, 17], 'driver-log': [22, 17],
};
const objects = readObjects('sql-train', root).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root, roomId: 'sql-train', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
