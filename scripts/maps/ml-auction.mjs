import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const root = REPO;
const B = 688;
const W = 30, H = 20;
const d = (n) => '.'.repeat(n);
// x: 0 L, 1 l, 2-9 Albers's study, 10 wall, 11-18 foyer, 19 wall, 20-27 gallery, 28 r, 29 R
// y: 2-7 study / foyer / gallery, 8-9 wall, 10-18 saleroom (x 2-20) and workshop (x 22-27)
const walls = [
  '#'.repeat(W),
  'L#' + '=g=W=m=S' + '=' + '=PSDDSp=' + '=' + '=W=W=W=f' + '#R',
  'Ll' + 'u......t' + '|' + 't......t' + '|' + d(8) + 'rR',
  'Ll' + '.Aa..L..' + '|' + '.h....c.' + '|' + '.VQ.V.V.' + 'rR',
  'Ll' + '.x......' + 'E' + d(8) + 'E' + d(8) + 'rR',
  'Ll' + d(8) + '.' + '.N......' + '.' + '...O....' + 'rR',
  'Ll' + d(8) + '.' + 'yz......' + '.' + '.......e' + 'rR',
  'Ll' + 'p......u' + '|' + d(8) + '|' + 'e.......' + 'rR',
  'Ll' + '#'.repeat(8) + '|' + '##....##' + '|' + '#'.repeat(8) + 'rR',
  'Ll' + '=S=8=S=G' + 'E' + 'U=....=S' + 'E' + '=S=X=S==' + 'rR',
  'Ll' + d(19) + '|' + d(6) + 'rR',
  'Ll' + d(19) + '|' + d(6) + 'rR',
  'Ll' + d(19) + 'E' + d(6) + 'rR',
  'Ll' + d(19) + '.' + d(6) + 'rR',
  'Ll' + d(19) + '.' + d(6) + 'rR',
  'Ll' + d(19) + '|' + d(6) + 'rR',
  'Ll' + d(19) + '|' + d(6) + 'rR',
  'Ll' + d(19) + '|' + d(6) + 'rR',
  'Ll' + d(19) + '|' + d(6) + 'rR',
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, l: B + 1, r: B + 2, '=': B, '|': 142, E: 143,
  D: 193, g: B + 11, m: B + 12, G: B + 13, U: B + 14, W: B + 6, S: B + 31, P: B + 9, p: B + 8, 8: B + 8, f: B + 10, X: B + 25,
  u: 76, t: B + 23, A: B + 28, a: B + 29, L: 112, h: 77, c: B + 22, V: 200, Q: 180, x: 224,
  N: B + 24, y: 118, z: 119, O: B + 21, e: B + 15,
};
// 'L' is the outer left wall (112) in column 0 and the ledger table in the study: place the ledger afterwards
const wallData = grid(walls, legend);
const set = (t, ...cells) => cells.forEach(([x, y]) => (wallData[y * W + x] = t));
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
set(B + 30, [7, 3]);

// saleroom: the rostrum on its dais with the lot board, the assistant's terminal, bidders' chairs facing the rostrum
set(201, [5, 10]);
set(B + 17, [7, 10]);
set(10, [9, 11]);
for (const y of [13, 15, 17]) for (const x of [3, 4, 5, 6, 7, 9, 10, 11, 12]) set(B + 18, [x, y]);
// the right side of the saleroom: telephone bank, lots on easels, the star lot
set(B + 19, [17, 10]); set(B + 20, [18, 10]);
set(B + 15, [20, 12], [20, 15]);
set(B + 21, [18, 14]);
set(B + 23, [2, 10], [20, 18], [12, 10]);
set(103, [17, 16], [18, 16], [19, 16]);
// workshop and print room
set(207, [24, 10]);
set(204, [26, 10]);
set(81, [27, 10]);
set(B + 26, [22, 18], [27, 18], [27, 17]);
set(28, [24, 16]);
set(205, [25, 16]);
set(12, [27, 13]);

const runner = (x, y) => (x === 14 || x === 15) && y >= 2 && y <= 17;
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = B + 3;
  if (inRect(x, y, 2, 2, 9, 7)) t = 4;
  if (inRect(x, y, 11, 2, 18, 9) || inRect(x, y, 10, 5, 10, 6) || inRect(x, y, 19, 5, 19, 6)) t = B + 27;
  if (inRect(x, y, 22, 10, 27, 18) || inRect(x, y, 21, 13, 21, 14)) t = 679;
  if (runner(x, y)) {
    let mask = 0;
    if (!runner(x, y - 1)) mask |= 1;
    if (!runner(x + 1, y)) mask |= 2;
    if (!runner(x, y + 1)) mask |= 4;
    if (!runner(x - 1, y)) mask |= 8;
    t = 144 + mask;
  }
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 4, [3, 10], [4, 10], [5, 10], [6, 10], [7, 10]);
put(decor, B + 16, [3, 11], [4, 11], [5, 11], [6, 11], [7, 11]);
put(decor, B + 7, [21, 2], [23, 2], [25, 2], [5, 2]);
put(above, B + 5, [5, 14], [10, 16], [17, 12], [14, 5], [24, 5], [14, 14], [24, 13], [5, 5]);

const at = {
  spawn: [14.5, 4.5], exit: [14, 1], handbook: [12, 3],
  'albers-sketch': [3, 1], rule: [3, 3], 'ilse-memo': [7, 1], estimates: [7, 3],
  movement: [21, 3], 'movement-card': [22, 3], newspaper: [12, 5],
  histogram: [9, 9], tail: [9, 11], 'house-rule': [11, 9],
  'workshop-note': [24, 10], forgery: [26, 10], catalogue: [25, 16], 'insurer-letter': [24, 16],
};
const objects = readObjects('ml-auction', root).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root, roomId: 'ml-auction', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
