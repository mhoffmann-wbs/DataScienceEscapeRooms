// The Butterfly House (python-debug): 30 x 21.
// Airlock (top centre, exit), Ole's tech room (north-west), the tropical hall: feeding corner (north-east),
// emergence nook (west), lily pond in the middle, volunteers' desk (south-east).
import { writeMap, readObjects, REPO } from './mapkit.mjs';
const ROOT = REPO;
const B = 464;
const W = 30, H = 21;
const layer = () => new Array(W * H).fill(null);
const floor = layer(), decor = layer(), walls = layer(), above = layer();
const put = (L, t, ...cells) => cells.forEach(([x, y]) => (L[y * W + x] = t));
const fill = (L, t, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(L, t, [x, y]); };
const piece = (L, grid, x, y) => grid.forEach((row, j) => row.forEach((t, i) => put(L, t, [x + i, y + j])));

const GLASS = B, GLASS_L = B + 1, GLASS_R = B + 2, BOARD = B + 3, MULCH = B + 4, GRAVEL = B + 5;
const POND = [[B + 6, B + 7, B + 8], [B + 9, B + 10, B + 11]], BED = [[B + 12, B + 13]];
const PALM = [[B + 14, B + 15]], CROWN = [[B + 16, B + 17], [B + 18, B + 19]];
const VINES = B + 20, FLIES = B + 21, CLIMATE = B + 22, NOTICE = B + 23, CLIP = B + 24, KEYPAD = B + 25, WHITEBOARD = B + 26;
const FEEDING = B + 27, CURTAIN = B + 28, PUDDLE = B + 29, HELICONIA = B + 30, BENCH = B + 31;
const TOP = 2, DIV = 142, DIV_END = 143, DOOR = 5, LAB = 14, GRATE = 42;

// outer walls: glass all round
fill(walls, TOP, 0, 0, W - 1, 0);
fill(walls, TOP, 0, H - 1, W - 1, H - 1);
fill(walls, 112, 0, 1, 0, H - 2);
fill(walls, 113, W - 1, 1, W - 1, H - 2);
fill(walls, GLASS, 2, 1, W - 3, 1);
fill(walls, GLASS_L, 1, 1, 1, H - 2);
fill(walls, GLASS_R, W - 2, 1, W - 2, H - 2);
put(walls, TOP, [1, 0], [W - 2, 0]);
const vwall = (x, y0, y1, openings = []) => {
  for (let y = y0; y <= y1; y++) if (!openings.includes(y)) put(walls, openings.includes(y + 1) ? DIV_END : DIV, [x, y]);
};
const hwall = (x0, x1, y, openings = [], front = GLASS) => {
  for (let x = x0; x <= x1; x++) if (!openings.includes(x)) { put(walls, TOP, [x, y]); put(walls, front, [x, y + 1]); }
};
// airlock: x 12-17, y 2-5
vwall(11, 2, 7);
vwall(18, 2, 5);
hwall(12, 18, 6, [14, 15]);
// tech room: x 2-10, y 2-7, opening into the hall at x 6-7
hwall(2, 11, 8, [6, 7]);

// floors
fill(floor, 56, 2, 2, W - 3, H - 2);
// mulch under the beds
for (const [x0, y0, x1, y1] of [[19, 6, 23, 9], [2, 12, 3, 16], [6, 12, 9, 16], [16, 12, 23, 14], [26, 6, 27, 13], [2, 19, 27, 19]]) fill(floor, MULCH, x0, y0, x1, y1);
fill(floor, LAB, 2, 2, 10, 7);
put(floor, LAB, [6, 8], [7, 8], [6, 9], [7, 9]);
fill(floor, GRATE, 12, 2, 17, 5);
put(floor, GRATE, [14, 6], [15, 6], [14, 7], [15, 7]);
// gravel paths: from the airlock down the middle, a loop round the pond, out to the corners
const path = (x0, y0, x1, y1) => fill(floor, GRAVEL, x0, y0, x1, y1);
path(14, 8, 15, 19);
path(4, 10, 25, 11);
path(4, 10, 5, 18);
path(24, 4, 25, 18);
path(4, 17, 25, 18);
path(19, 4, 25, 5);
path(6, 9, 7, 9);
// boardwalk round the pond
fill(floor, BOARD, 10, 12, 13, 16);
path(14, 12, 15, 16);

// --- airlock
put(walls, DOOR, [14, 1], [15, 1]);
put(walls, KEYPAD, [16, 1]);
put(walls, CLIP, [17, 1]);            // restart checklist
put(walls, 77, [12, 3]);              // Ole's debugging guide
put(walls, 195, [17, 5]);
put(above, CURTAIN, [14, 7], [15, 7]);
put(decor, 138, [14, 2]);
put(decor, 139, [15, 2]);

// --- tech room
put(walls, CLIMATE, [3, 1]);
put(walls, NOTICE, [5, 1]);           // Finn's sticky note
put(walls, 32, [8, 2]);               // sensor hub
put(walls, 35, [10, 2]);              // sensor manual on a desk
put(walls, 21, [2, 4]);
put(walls, 18, [2, 6]);
put(walls, 39, [10, 5]);
put(walls, 195, [10, 7]);
put(walls, HELICONIA, [2, 2]);
put(walls, 177, [5, 5]);
put(walls, 20, [6, 5]);
put(walls, 17, [7, 5]);

// --- feeding corner (north-east)
put(walls, WHITEBOARD, [22, 1]);
put(walls, FEEDING, [22, 3]);
put(walls, HELICONIA, [19, 2], [27, 2]);
piece(walls, PALM, 26, 7);
piece(above, CROWN, 26, 5);
piece(walls, BED, 19, 7);
piece(walls, BED, 21, 7);
put(walls, 83, [23, 7]);
put(walls, HELICONIA, [20, 9], [22, 9]);
put(walls, BENCH, [21, 3]);
put(above, FLIES, [22, 2], [20, 5], [26, 3]);

// --- emergence nook (west)
put(walls, 85, [2, 10]);              // emergence cabinet
put(walls, CLIP, [4, 9]);             // note next to the cabinet... on the tech room's wall
piece(walls, BED, 2, 13);
piece(walls, PALM, 2, 15);
piece(above, CROWN, 2, 13);
put(walls, HELICONIA, [3, 12]);

// --- the pond and the beds round it
piece(walls, POND, 11, 13);
piece(walls, BED, 17, 13);
put(walls, BENCH, [12, 16], [17, 16]);
piece(walls, BED, 8, 13);
put(walls, HELICONIA, [9, 15], [20, 15]);
piece(walls, PALM, 21, 13);
piece(above, CROWN, 21, 11);
put(decor, PUDDLE, [14, 9], [5, 18], [24, 8]);
put(above, FLIES, [13, 12], [18, 10], [6, 14], [10, 18], [23, 16]);
put(above, VINES, [9, 1], [19, 1], [24, 1], [W - 3, 9], [2, 19 - 2]);

// --- volunteers' desk (south-east)
put(walls, 10, [22, 16]);             // census tablet on the desk
put(walls, 29, [20, 16]);             // tally sheet
put(walls, 206, [27, 16]);
put(walls, HELICONIA, [27, 14], [3, 19], [8, 19], [11, 19], [17, 19], [21, 19], [27, 19], [12, 8], [17, 8]);
put(walls, 83, [2, 18], [26, 19], [19, 13 + 0]);
put(walls, 53, [16, 14]);
piece(walls, PALM, 6, 15);
piece(above, CROWN, 6, 13);
piece(walls, BED, 26, 12);

const at = {
  spawn: [14.5, 4, 0, 0], exit: [14, 1], 'airlock-keypad': [16, 1], checklist: [17, 1], handbook: [12, 3],
  climate: [3, 1], 'intern-note': [5, 1], sensors: [8, 2], 'sensor-manual': [10, 2],
  'nectar-board': [22, 1], feeding: [22, 3],
  hatchery: [2, 10], 'cabinet-note': [4, 9],
  census: [22, 16], 'tally-sheet': [20, 16],
};
const objects = readObjects('python-debug', ROOT).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y, w, h] = at[o.name];
  return { ...o, x, y, ...(w !== undefined ? { w, h } : {}) };
});
console.log(writeMap({ root: ROOT, roomId: 'python-debug', width: W, height: H, layers: { floor, decor, walls, above }, objects }));
