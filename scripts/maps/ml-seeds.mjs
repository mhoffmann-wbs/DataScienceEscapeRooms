import { grid, writeMap, readObjects, REPO } from './mapkit.mjs';
const root = REPO;
const B = 624;
const W = 30, H = 20;
const d = (n) => '.'.repeat(n);
// x: 0 L, 1 l, 2-9 office / sorting hall, 10 wall, 11-19 lift landing, 20 wall, 21-27 cold store / archive, 28 r, 29 R
const walls = [
  '#'.repeat(W),
  'L#' + '---w--O-' + '=T=iDDi=T=' + '====i===' + '#R',
  'Ll' + 's......p' + '|' + 'h........' + '|' + 'qq.Q.qq' + 'rR',
  'Ll' + '..dCe.Kk' + '|' + d(9) + '|' + '...e...' + 'rR',
  'Ll' + '...x....' + 'E' + d(9) + '|' + d(7) + 'rR',
  'Ll' + '.a.b....' + '.' + d(9) + '|' + 'n.....z' + 'rR',
  'Ll' + '..y.....' + '.' + d(9) + '|' + d(7) + 'rR',
  'Ll' + 'p......p' + '|' + d(9) + '|' + '#'.repeat(7) + 'rR',
  'Ll' + '#'.repeat(8) + '|' + d(9) + 'E' + 'i=NV=FU' + 'rR',
  'Ll' + '=i=TG=i=' + 'E' + d(9) + '.' + d(7) + 'rR',
  'Ll' + 'Sv.o....' + d(18) + 'rR',
  ...Array.from({ length: 8 }, () => 'Ll' + d(26) + 'rR'),
  '#'.repeat(W),
];
const legend = {
  '#': 2, L: 112, R: 113, l: B + 2, r: B + 3, '-': 3, '=': B, T: B + 1, '|': 142, E: 143,
  D: 193, i: B + 17, w: 22, O: 40, V: B + 28, F: B + 29, N: B + 30, G: B + 31, U: B + 10,
  s: 12, p: 7, d: 8, C: 10, e: 29, K: 183, k: 81, h: 77, x: 224, a: 120, b: 121, y: 133,
  q: 227, Q: 21, n: 228, z: 70, S: 71, v: 80, o: 184,
};
const wallData = grid(walls, legend);
const set = (t, ...cells) => cells.forEach(([x, y]) => (wallData[y * W + x] = t));
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// lift landing: the mine cart on its rails, sacks waiting to go up
set(B + 9, [18, 4]);
set(71, [12, 8]);
set(80, [11, 8]);
set(B + 22, [19, 2]);
set(39, [19, 8]);
// sorting hall: the tray and its tags, the new sorting line, a seed-jar cabinet
set(185, [3, 13]);
set(35, [4, 13]);
set(B + 19, [7, 13]); set(B + 20, [8, 13]); set(B + 21, [9, 13]);
set(21, [11, 11]);
set(B + 22, [2, 18], [12, 18], [13, 10]);
set(83, [11, 16]);
set(223, [3, 14], [4, 14], [8, 14]);
set(71, [7, 18], [8, 18]);
set(80, [9, 18]);
set(183, [10, 11]);
// salt pillars between the hall and the archive
const pillar = (x, y) => { set(B + 23, [x, y]); set(B + 24, [x + 1, y]); set(B + 25, [x, y + 1]); set(B + 26, [x + 1, y + 1]); };
pillar(14, 11);
pillar(14, 16);
// archive: shelving rows, the pump, a sandbag line along the water
set(B + 12, [17, 11], [18, 11], [19, 11], [22, 11], [23, 11], [24, 11]);
set(B + 16, [26, 12]);
set(B + 15, [16, 14], [17, 14], [18, 14], [19, 14], [21, 14], [22, 14], [23, 14], [24, 14]);
// the flooded end: a boardwalk out to the microscope on a dry ledge, deep water around it
const walkway = (x, y) => (x === 20 && y >= 14 && y <= 17) || (y === 17 && x >= 20 && x <= 22);
const ledge = (x, y) => inRect(x, y, 23, 16, 26, 17);
set(17, [24, 16]);
set(B + 22, [26, 16]);
for (let y = 15; y <= 18; y++) for (let x = 16; x <= 27; x++) {
  if (walkway(x, y) || ledge(x, y) || wallData[y * W + x] != null) continue;
  set(B + 7, [x, y]);
}
set(B + 13, [18, 16], [22, 18]);
set(B + 14, [17, 15], [25, 18], [27, 15], [19, 18]);

const RUG = [[164, 165, 166], [167, 168, 169], [170, 171, 172]];
const floor = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  let t = 186;
  if (inRect(x, y, 2, 2, 9, 7)) t = 0;
  if (inRect(x, y, 3, 5, 5, 7)) t = RUG[y - 5][x - 3];
  if (inRect(x, y, 21, 2, 27, 6)) t = 210; // the frosted plate of python-lab's cold room
  if (inRect(x, y, 2, 11, 11, 17)) t = 1;
  if (inRect(x, y, 16, 9, 27, 18) || (y >= 13 && x === 13 && false)) t = B + 4;
  if (inRect(x, y, 16, 15, 27, 18)) t = B + 6;
  if (walkway(x, y)) t = B + 5;
  if (ledge(x, y)) t = B + 4;
  floor.push(t);
}
const decor = new Array(W * H).fill(null);
const above = new Array(W * H).fill(null);
const put = (layer, t, ...cells) => cells.forEach(([x, y]) => (layer[y * W + x] = t));
put(decor, B + 8, ...[2, 3, 4, 5, 6, 7, 8, 9, 10].map((y) => [18, y]));
put(decor, B + 11, [27, 9], [27, 10], [27, 11], [27, 12], [27, 13], [27, 14]);
put(floor, 187, [13, 13], [12, 5], [10, 18], [3, 18]);
put(above, B + 18, [13, 4], [16, 7], [5, 12], [10, 15], [21, 10], [25, 14], [6, 3]);
put(above, B + 27, [2, 16], [3, 16], [4, 16], [5, 16]);

const at = {
  spawn: [15, 4.5], exit: [14, 1], handbook: [11, 2],
  'curator-note': [5, 1], elbow: [5, 3], cards: [8, 3], 'species-cards': [9, 3],
  'inspector-rule': [23, 8], sowing: [24, 8], 'field-map': [26, 8],
  tray: [3, 13], 'tray-tags': [4, 13], sorter: [5, 10], 'service-sheet': [6, 9],
  foreign: [24, 16],
};
const objects = readObjects('ml-seeds', root).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y] = at[o.name];
  return { ...o, x, y };
});
console.log(writeMap({ root, roomId: 'ml-seeds', width: W, height: H, layers: { floor, decor, walls: wallData, above }, objects }));
