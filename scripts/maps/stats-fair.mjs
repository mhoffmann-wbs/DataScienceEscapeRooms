// The Rigged Fair (stats-fair): 32 x 20.
// Cobbled gate plaza (east, exit in the right wall) with the ticket office, a sawdust midway along the
// north stalls (duck pond, Lucky Seven), the carousel and high striker in the middle, the food court
// (lemonade stand, filling machine, picnic tables) in the south-west, the commission's notices on the north hoarding.
import { writeMap, readObjects, REPO } from './mapkit.mjs';
const ROOT = REPO;
const B = 496;
const W = 32, H = 20;
const layer = () => new Array(W * H).fill(null);
const floor = layer(), decor = layer(), walls = layer(), above = layer();
const put = (L, t, ...cells) => cells.forEach(([x, y]) => (L[y * W + x] = t));
const fill = (L, t, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(L, t, [x, y]); };
const piece = (L, grid, x, y) => grid.forEach((row, j) => row.forEach((t, i) => put(L, t, [x + i, y + j])));

const FENCE = B, FENCE_L = B + 1, FENCE_R = B + 2, GRASS = B + 3, SAWDUST = B + 4, COBBLES = B + 5;
const CAROUSEL = [[B + 6, B + 7, B + 8], [B + 9, B + 10, B + 11], [B + 12, B + 13, B + 14]];
const LIGHTS = B + 15, AWN_L = B + 16, AWN_M = B + 17, AWN_R = B + 18, GATEPOST = B + 19;
const CLIP = B + 20, NOTICE = B + 21, MAP = B + 22, LAMP = B + 23, GLOW = B + 24, CANDY = B + 25, HAY = B + 26;
const BALLOONS = B + 27, LITTER = B + 28, POOL = B + 29, STRIKER_TOP = B + 30, STRIKER = B + 31;
const TOP = 2, EXIT = 55;

// outer walls: the hoarding all round
fill(walls, TOP, 0, 0, W - 1, 0);
fill(walls, TOP, 0, H - 1, W - 1, H - 1);
fill(walls, 112, 0, 1, 0, H - 2);
fill(walls, 113, W - 1, 1, W - 1, H - 2);
fill(walls, FENCE, 2, 1, W - 3, 1);
fill(walls, FENCE_L, 1, 1, 1, H - 2);
fill(walls, FENCE_R, W - 2, 1, W - 2, H - 2);
put(walls, TOP, [1, 0], [W - 2, 0]);

// floors: grass, a sawdust midway, cobbles at the gate
fill(floor, GRASS, 2, 2, W - 3, H - 2);
fill(floor, SAWDUST, 2, 5, 23, 6);       // midway along the north stalls
fill(floor, SAWDUST, 18, 7, 19, 15);     // down past the high striker
fill(floor, SAWDUST, 2, 15, 19, 16);     // along the food court
fill(floor, SAWDUST, 9, 7, 10, 14);      // west of the carousel
fill(floor, COBBLES, 24, 2, 29, 13);     // gate plaza
fill(floor, SAWDUST, 20, 14, 21, 16);

// --- gate plaza (east)
put(walls, EXIT, [W - 2, 9], [W - 2, 10]);
put(walls, GATEPOST, [28, 7]);           // the gate's keypad and the guard's note
put(walls, 61, [25, 2]);                 // ticket office (stall 1)
put(walls, 62, [27, 2]);                 // Bruno's flyer
put(walls, 77, [24, 8]);                 // the inspection pocket guide on its stand
put(walls, LAMP, [24, 12], [29, 12]);
put(above, GLOW, [24, 12], [29, 12]);
put(walls, HAY, [29, 17], [27, 18]);
put(walls, 47, [24, 16]);
put(walls, LAMP, [26, 15]);
put(above, GLOW, [26, 15]);
put(above, BALLOONS, [25, 16]);
put(decor, POOL, [26, 16]);
put(above, AWN_L, [24, 4]); put(above, AWN_M, [25, 4]); put(above, AWN_R, [26, 4]);
put(walls, 103, [29, 3]);
put(walls, 103, [29, 5]);
put(above, BALLOONS, [26, 2]);
put(decor, POOL, [24, 13], [29, 13]);

// --- the north stalls
put(walls, 58, [18, 3]);                 // duck pond (stall 2)
put(walls, 62, [16, 3]);                 // duck sign
put(walls, 63, [20, 3]);                 // shelf of prize teddies
put(walls, 57, [10, 3]);                 // Lucky Seven (stall 3)
put(walls, 62, [8, 3]);                  // dice sign
put(walls, HAY, [12, 3]);
put(walls, 47, [22, 3]);
put(above, AWN_L, [9, 4]); put(above, AWN_M, [10, 4]); put(above, AWN_R, [11, 4]);
put(above, AWN_L, [17, 4]); put(above, AWN_M, [18, 4]); put(above, AWN_R, [19, 4]);
put(walls, CANDY, [4, 3]);
put(above, BALLOONS, [5, 2], [19, 2]);
put(above, LIGHTS, ...[...Array(21).keys()].map((i) => [2 + i, 6]));
put(decor, LITTER, [13, 5], [22, 6], [6, 16]);

// --- the commission's notices on the north hoarding
put(walls, MAP, [3, 1]);                 // the fair map, at the far end from the gate
put(walls, CLIP, [13, 1]);               // inspection handbook
put(walls, NOTICE, [21, 1]);             // fill regulation

// --- carousel and high striker
piece(walls, CAROUSEL, 12, 9);
put(decor, POOL, [11, 12], [15, 12], [13, 8]);
put(walls, LAMP, [11, 8], [15, 8]);
put(above, GLOW, [11, 8], [15, 8]);
put(above, STRIKER_TOP, [21, 9]);
put(walls, STRIKER, [21, 10]);
put(walls, HAY, [20, 12]);
put(walls, 98, [16, 13]);
put(walls, LAMP, [22, 8]);
put(above, GLOW, [22, 8]);
put(above, BALLOONS, [20, 11]);
put(walls, LAMP, [7, 8]);
put(above, GLOW, [7, 8]);
put(decor, POOL, [7, 9]);
put(walls, HAY, [2, 8], [2, 13]);
put(walls, 133, [3, 9], [5, 10]);
put(walls, 132, [4, 9], [6, 10], [3, 10]);
put(walls, 53, [8, 10]);

// --- food court (south-west)
put(walls, 59, [5, 12]);                 // lemonade stand (stall 4)
put(walls, 35, [3, 12]);                 // Kai's note at the till
put(walls, 60, [8, 12]);                 // filling machine
put(walls, 69, [4, 17], [8, 17], [12, 17]);
put(above, AWN_L, [3, 16]); put(above, AWN_M, [4, 16], [5, 16], [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16]); put(above, AWN_R, [13, 16]);
put(walls, HAY, [2, 18]);
put(walls, LAMP, [18, 18]);
put(above, GLOW, [18, 18]);
put(walls, CANDY, [16, 17]);
put(above, LIGHTS, ...[...Array(17).keys()].map((i) => [2 + i, 14]));

const at = {
  spawn: [27, 10, 0, 0], exit: [W - 3, 9], gate: [28, 7], handbook: [24, 8],
  'clue:handbook': [13, 1], 'fill-law': [21, 1], 'fair-map': [3, 1],
  tickets: [25, 2], flyer: [27, 2], ducks: [18, 3], 'duck-sign': [16, 3], dice: [10, 3], 'dice-sign': [8, 3],
  lemonade: [5, 12], 'cup-note': [3, 12], filler: [8, 12],
};
const objects = readObjects('stats-fair', ROOT).map((o) => {
  const key = o.type === 'clue' && o.name === 'handbook' ? 'clue:handbook' : o.name;
  if (!(key in at)) throw new Error(`no position for ${key}`);
  const [x, y, w, h] = at[key];
  return { ...o, x, y, ...(w !== undefined ? { w, h } : {}) };
});
console.log(writeMap({ root: ROOT, roomId: 'stats-fair', width: W, height: H, layers: { floor, decor, walls, above }, objects }));
