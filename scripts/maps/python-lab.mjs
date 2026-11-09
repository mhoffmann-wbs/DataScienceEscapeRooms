import { grid, writeMap, readObjects } from './mapkit.mjs';
const B = 208;
const W = 28, H = 18;
const d = (n) => '.'.repeat(n);
const walls = [
  '#'.repeat(W),
  'L#-d--w-----bDDbK==PC=V==S#R',
  'Llg' + d(7) + 'B|' + d(5) + '|' + d(4) + 'A' + d(3) + 'rR',
  'Ll.Ttp' + d(5) + 'E' + d(4) + 'hE' + '.GH..GHJ' + 'rR',
  'Ll.c' + d(7) + '.' + d(5) + '.' + d(8) + 'rR',
  'Ll.....xoz' + '.' + '.' + d(5) + '.' + '.GH..GH.' + 'rR',
  'Ll' + d(9) + '|' + d(5) + '|' + 'N' + d(7) + 'rR',
  'Llg' + d(7) + 'g|' + d(5) + '|' + d(8) + 'rR',
  'Lm' + '#'.repeat(9) + '|' + d(5) + '|' + '#'.repeat(8) + 'rR',
  'Lm' + '=M==W==W=' + 'E' + d(5) + 'E' + 'S=' + '==F===' + 'rR',
  'LmI.uu.kk' + d(9) + 'X.' + '|' + 'n..qq' + 'rR',
  'Lm' + d(18) + '|' + d(5) + 'rR',
  'Lm..' + 'YYZYk' + d(11) + '|' + '..f..' + 'rR',
  'Lm..s.s.s' + d(5) + 'YYky' + '..' + 'E' + d(5) + 'rR',
  'Lm' + d(12) + 's.s' + d(3) + '.' + d(5) + 'rR',
  'Lm' + d(24) + 'rR',
  'LmQ..YkY' + d(11) + 'g|' + '...qn' + 'rR',
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, l: 114, m: B + 27, r: B + 28, '-': 3, '=': B, '|': 142, E: 143,
  D: 5, b: B + 5, K: B + 31, V: B + 6, C: B + 7, P: B + 30, M: B + 29, W: B + 25, S: B + 17, F: B + 18, d: 24, w: 22,
  T: 10, t: 8, p: 19, B: 12, g: 7, c: B + 16, x: 120, o: 133, z: 121, h: 77,
  G: B + 8, H: B + 9, J: 21, N: 18, A: B + 24,
  I: 15, u: B + 11, k: B + 22, Z: 17, Y: 20, s: B + 15, y: B + 26, Q: B + 12, X: B + 13,
  f: 16, q: B + 19, n: B + 20,
};
const wallData = grid(walls, legend);
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const RUG = [[164, 165, 166], [167, 168, 169], [170, 171, 172]];
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = 14;
  if (inRect(x, y, 2, 2, 10, 7)) t = 0;
  if (inRect(x, y, 7, 4, 9, 6)) t = RUG[y - 4][x - 7];
  if (inRect(x, y, 18, 2, 25, 7)) t = B + 1;
  if (inRect(x, y, 21, 10, 25, 16) || (x === 20 && (y === 14 || y === 15))) t = B + 2;
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 3, ...[12, 13, 14, 15, 16].map((x) => [x, 2]), ...[12, 13, 14, 15, 16].map((x) => [x, 9]));
put(decor, B + 4, [23, 2]);
put(decor, B + 10, [19, 4], [20, 4], [23, 4], [24, 4], [19, 6], [20, 6], [23, 6], [24, 6]);
put(decor, B + 23, [21, 6], [21, 4], [22, 3]);
put(decor, B + 14, [10, 12]);
put(above, B + 21, [5, 12], [7, 12], [15, 13], [6, 16]);

const at = {
  spawn: [14, 6.5], exit: [13, 1], terminal: [3, 3], incubator: [2, 10], notebook: [18, 6], freezer: [23, 12],
  ventilation: [20, 1], 'exit-keypad': [16, 1], photo: [5, 3], diploma: [3, 1], whiteboard: [6, 1], poster: [19, 1],
  manual: [3, 9], microscope: [6, 12], jars: [25, 3], handbook: [16, 3],
};
const objects = readObjects('python-lab').map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ roomId: 'python-lab', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
