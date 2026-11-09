import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const root = REPO;
const B = 656;
const W = 30, H = 21;
const d = (n) => '.'.repeat(n);
// x: 0 L, 1 l, 2-6 Hanne's records room, 7 wall, 8-17 night office, 18 wall, 19-27 container yard, 28 r, 29 R
// y: 2-9 offices, 10-11 the office's outer wall, 12-15 quay, 16 quay edge, 17 water, 18-19 the MV Kestrel
const walls = [
  '#'.repeat(W),
  'L#' + '-C-W-' + '-' + '-O-PDDA-W-' + '=F=HH=SFY=' + '#R',
  'Lo' + 's...p' + '|' + d(10) + '|' + d(9) + 'rR',
  'Lo' + '.e..k' + '|' + '...N...Jj.' + '|' + '.bB.gG.cc' + 'rR',
  'Lo' + '.x...' + 'E' + '.d.x...x..' + '|' + d(9) + 'rR',
  'Lo' + '.....' + '.' + d(10) + '|' + '.gG.c.bB.' + 'rR',
  'Lo' + 'u....' + '.' + '..h.......' + '|' + d(9) + 'rR',
  'Lo' + '.....' + '|' + d(10) + 'E' + 'Z........' + 'rR',
  'Lo' + 'p...s' + '|' + d(9) + 'f' + '.' + d(9) + 'rR',
  'Lo' + '.....' + '|' + 'p......K.' + '.' + '.' + d(9) + 'rR',
  'Ll' + '#'.repeat(16) + '|' + d(9) + 'rR',
  'Ll' + '==F====Y===F====' + 'E' + d(9) + 'rR',
  ...Array.from({ length: 4 }, () => 'Ll' + d(26) + 'rR'),
  'Ll' + 'q'.repeat(26) + 'rR',
  'Ll' + 'w'.repeat(26) + 'rR',
  'Ll' + 'v'.repeat(10) + 'V' + 'v'.repeat(9) + 'V' + 'v'.repeat(5) + 'rR',
  'Ll' + 'aAaaAAaaaAaaAaaaAAaaaAaaaA' + 'rR',
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, o: 114, l: B + 1, r: B + 2, '-': 3, '=': B, '|': 142, E: 143,
  D: 193, C: 9, W: 197, O: 198, P: 199, A: 24, F: B + 31, H: B + 30, S: B + 29, Y: B + 28,
  s: 12, p: 7, e: 19, k: 81, x: 224, N: 72, J: 10, j: 29, d: 35, h: 77, u: 76, f: 69, K: B + 26,
  b: B + 13, B: B + 14, g: B + 15, G: B + 16, c: 195, Z: B + 24,
  q: B + 6, w: B + 5, v: B + 9, V: B + 10, a: B + 11,
};
// the deck row uses 'A' for a lashed container (legend A is the audit notice above, so remap here)
const deckRow = walls[19];
walls[19] = 'Ll' + '.'.repeat(26) + 'rR';
const wallData = grid(walls, legend);
const set = (t, ...cells) => cells.forEach(([x, y]) => (wallData[y * W + x] = t));
[...deckRow].forEach((ch, x) => { if (ch === 'a') set(B + 11, [x, 19]); if (ch === 'A') set(B + 12, [x, 19]); });
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// container yard below the stacks: the dead X-ray gate, an opened container, pallets
set(32, [12, 9], [13, 9]);
set(183, [6, 6], [6, 7]);
set(196, [23, 8]);
set(B + 27, [26, 8]);
set(B + 25, [21, 10], [22, 10], [27, 11]);
set(195, [25, 10]);
// quay: floodlight masts, the crane console and its schedule, the gantry crane, bollards, pallets
set(B + 21, [2, 12], [19, 12], [27, 13]);
set(180, [21, 12]);
set(74, [22, 12]);
set(B + 17, [4, 15], [10, 15]);
set(B + 7, [14, 15], [20, 15], [25, 15]);
set(B + 25, [15, 12], [16, 12]);
set(B + 13, [6, 12]); set(B + 14, [7, 12]);

const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = B + 3;
  if (inRect(x, y, 2, 2, 6, 9)) t = 0;
  if (inRect(x, y, 8, 2, 17, 9) || inRect(x, y, 7, 5, 7, 6)) t = B + 23;
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 20, ...Array.from({ length: 26 }, (_, i) => [2 + i, 15]));
put(decor, B + 4, ...Array.from({ length: 26 }, (_, i) => [2 + i, 13]));
put(decor, B + 22, [3, 12], [2, 13], [20, 12], [19, 13], [26, 13], [27, 12], [20, 4], [24, 2]);
put(decor, B + 8, [12, 14], [24, 6], [17, 13], [22, 9]);
put(above, B + 18, [4, 14], [5, 14], [6, 14], [7, 14], [8, 14], [9, 14], [10, 14]);
put(above, B + 19, [7, 15]);

const at = {
  spawn: [13, 5], exit: [12, 1], handbook: [10, 6],
  odds: [9, 1], 'chief-order': [9, 4], 'xr90-poster': [11, 1], dashboard: [11, 3], 'audit-rule': [14, 1],
  neighbours: [15, 3], 'jonas-note': [16, 3], 'inspector-card': [3, 1], rules: [3, 3], pruning: [6, 3],
  'crane-schedule': [21, 12], arrivals: [22, 12],
};
const objects = readObjects('ml-customs', root).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root, roomId: 'ml-customs', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
