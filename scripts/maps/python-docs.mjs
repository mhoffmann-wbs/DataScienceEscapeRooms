// The Silent Archive (python-docs): 30 x 20.
// Reading hall (centre top, exit), stacks (west), Margarete's office (north-east),
// packing room with the cellar stairs (south centre), circulation desk (south-east).
import { writeMap, readObjects, REPO } from './mapkit.mjs';
const ROOT = REPO;
const B = 432;
const W = 30, H = 20;
const layer = () => new Array(W * H).fill(null);
const floor = layer(), decor = layer(), walls = layer(), above = layer();
const put = (L, t, ...cells) => cells.forEach(([x, y]) => (L[y * W + x] = t));
const fill = (L, t, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(L, t, [x, y]); };
const get = (L, x, y) => L[y * W + x];

// tiles
const WALL = B, WALL_L = B + 1, WALL_R = B + 2, PARQUET = B + 3, CARPET = B + 4, FLAGS = B + 5;
const CASE = [[B + 6, B + 7], [B + 8, B + 9]], TABLE = [B + 10, B + 11], CHAIR = B + 12, RULE = B + 13;
const KEYPAD = B + 14, CLIP = B + 15, NOTICE = B + 16, PORTRAIT = B + 17, TERMINAL = B + 18, WINDOW = B + 19;
const STAIRS = [[B + 20, B + 21], [B + 22, B + 23]], PACKING = [B + 24, B + 25], GLOBE = B + 26, PILE = B + 27;
const PENDANT = B + 28, PAPERS = B + 29, MOONLIGHT = B + 30, LEDGER = B + 31;
const TOP = 2, DIV = 142, DIV_END = 143, DOOR = 5;

// outer walls
fill(walls, TOP, 0, 0, W - 1, 0);
fill(walls, TOP, 0, H - 1, W - 1, H - 1);
fill(walls, 112, 0, 1, 0, H - 2);
fill(walls, 113, W - 1, 1, W - 1, H - 2);
fill(walls, WALL, 2, 1, W - 3, 1);
fill(walls, WALL_L, 1, 1, 1, H - 2);
fill(walls, WALL_R, W - 2, 1, W - 2, H - 2);
put(walls, TOP, [1, 0], [W - 2, 0]);

/** An inner wall running down column x from y0 to y1, with openings (rows) left free. */
const vwall = (x, y0, y1, openings = []) => {
  for (let y = y0; y <= y1; y++) {
    if (openings.includes(y)) continue;
    put(walls, openings.includes(y + 1) ? DIV_END : DIV, [x, y]);
  }
};
/** An inner wall across the room: wall top on row y, wall front on y + 1, openings (columns) free. */
const hwall = (x0, x1, y, openings = []) => {
  for (let x = x0; x <= x1; x++) {
    if (openings.includes(x)) continue;
    put(walls, TOP, [x, y]);
    put(walls, WALL, [x, y + 1]);
  }
};
// stacks | hall and packing room
vwall(11, 2, 18, [6, 7, 15, 16]);
// hall | office
vwall(20, 2, 9, [6, 7]);
// across: hall and office above, packing room and circulation below
hwall(12, 27, 10, [15, 16, 24, 25]);
put(walls, DIV, [20, 10]);
// packing room | circulation
vwall(20, 12, 18, [15, 16]);

// floors by area
fill(floor, CARPET, 2, 2, 10, 18);
fill(floor, PARQUET, 12, 2, 19, 9);
fill(floor, 0, 21, 2, 27, 9);
fill(floor, FLAGS, 12, 12, 19, 18);
fill(floor, PARQUET, 21, 12, 27, 18);
// thresholds in the openings
put(floor, PARQUET, [11, 6], [11, 7], [20, 6], [20, 7], [15, 10], [16, 10], [15, 11], [16, 11]);
put(floor, CARPET, [11, 15], [11, 16]);
put(floor, FLAGS, [20, 15], [20, 16]);
put(floor, 0, [24, 10], [25, 10]);
put(floor, PARQUET, [24, 11], [25, 11]);

// red runner from the door down the hall to the packing room: 144 + mask of the ends (1 n, 2 e, 4 s, 8 w)
const runner = new Set();
for (let y = 2; y <= 9; y++) for (const x of [15, 16]) runner.add(`${x},${y}`);
for (const [k] of runner.entries()) {
  const [x, y] = k.split(',').map(Number);
  const has = (dx, dy) => runner.has(`${x + dx},${y + dy}`);
  const mask = (has(0, -1) ? 0 : 1) | (has(1, 0) ? 0 : 2) | (has(0, 1) ? 0 : 4) | (has(-1, 0) ? 0 : 8);
  put(floor, 144 + mask, [x, y]);
}
// office rug (3 x 3, tiles 164-172)
for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) put(floor, 164 + j * 3 + i, [23 + i, 5 + j]);

const piece = (grid, x, y) => grid.forEach((row, j) => row.forEach((t, i) => put(walls, t, [x + i, y + j])));

// --- reading hall
put(walls, DOOR, [15, 1], [16, 1]);
put(walls, KEYPAD, [18, 1]);
put(walls, WINDOW, [13, 1]);
put(walls, 77, [13, 3]);            // handbook lectern
put(walls, 81, [18, 3]);            // card catalogue
put(walls, GLOBE, [12, 5]);
piece([TABLE], 12, 8);
piece([TABLE], 18, 8);
put(walls, CHAIR, [12, 9], [13, 9]);
put(walls, 7, [19, 5]);
put(above, PENDANT, [13, 7], [18, 7]);
put(decor, MOONLIGHT, [13, 2]);

// --- stacks
put(walls, CLIP, [5, 1]);            // cart note
put(walls, 78, [5, 3]);              // returns cart
put(walls, WINDOW, [3, 1], [8, 1]);
put(decor, MOONLIGHT, [3, 2], [8, 2]);
for (const x of [2, 4, 6]) piece(CASE, x, 5);
for (const x of [4, 6, 8]) piece(CASE, x, 9);
for (const x of [2, 4, 6, 8]) piece(CASE, x, 13);
for (const x of [2, 4]) piece(CASE, x, 17);
put(walls, PILE, [9, 12]);
put(walls, PILE, [2, 9]);
piece([TABLE], 8, 3);
put(walls, CHAIR, [8, 4], [9, 4]);
put(walls, 7, [10, 2]);
put(walls, PILE, [2, 3]);
put(decor, PAPERS, [8, 7]);
put(walls, 120, [9, 17]);            // armchair in the corner
put(walls, 134, [10, 17]);           // floor lamp
put(walls, 8, [6, 17]);              // a small desk
put(above, PENDANT, [5, 7], [7, 11], [4, 15]);

// --- Margarete's office
put(walls, CLIP, [23, 1]);           // script list beside the terminal
put(walls, TERMINAL, [22, 2]);
put(walls, RULE, [25, 1]);           // her rule, above her desk
put(walls, 19, [25, 2]);             // her desk with the photo
put(walls, 29, [26, 2]);             // desk with papers
put(walls, CHAIR, [25, 3]);
put(walls, 12, [27, 2]);
put(walls, PORTRAIT, [27, 1]);
put(walls, WINDOW, [21, 1]);
put(walls, 120, [23, 6]);
put(walls, 133, [24, 6]);
put(walls, 121, [25, 6]);
piece(CASE, 21, 8);
put(walls, 134, [26, 9]);
put(walls, 7, [27, 9]);
put(walls, 76, [27, 5]);
put(decor, PAPERS, [26, 4]);
put(above, PENDANT, [25, 5]);

// --- packing room
put(walls, PORTRAIT, [13, 11]);
piece([PACKING], 13, 14);
put(walls, 80, [16, 14]);            // stacked archive boxes with the label
put(walls, 80, [19, 12], [18, 12]);
put(walls, 52, [19, 13]);
piece(STAIRS, 12, 17);
put(walls, PILE, [17, 18]);
put(walls, 80, [19, 18]);
put(decor, PAPERS, [15, 17]);
put(above, PENDANT, [14, 13]);

// --- circulation
put(walls, CLIP, [22, 11]);          // stamp instructions above the stamp machine
put(walls, 79, [22, 13]);            // date-stamp machine
put(walls, NOTICE, [27, 11]);        // fee rules
put(walls, 8, [23, 15]);
put(walls, LEDGER, [24, 15]);        // late-fees ledger
put(walls, 35, [25, 15]);
put(walls, PILE, [27, 15]);
put(walls, CHAIR, [24, 14]);
put(walls, 76, [27, 13]);
put(walls, 7, [21, 18]);
put(walls, 7, [27, 18]);
put(above, PENDANT, [24, 13]);

const at = {
  spawn: [15.5, 4, 0, 0], exit: [15, 1], 'door-keypad': [18, 1], handbook: [13, 3], catalogue: [18, 3],
  cart: [5, 3], 'cart-note': [5, 1],
  terminal: [22, 2], 'script-list': [23, 1],
  boxes: [13, 14], 'box-label': [16, 14],
  stamps: [22, 13], 'stamp-instructions': [22, 11], fees: [24, 15], 'fee-rules': [27, 11],
};
const objects = readObjects('python-docs', ROOT).map((o) => {
  if (!(o.name in at)) throw new Error(`no position for ${o.name}`);
  const [x, y, w, h] = at[o.name];
  return { ...o, x, y, ...(w !== undefined ? { w, h } : {}) };
});
console.log(writeMap({ root: ROOT, roomId: 'python-docs', width: W, height: H, layers: { floor, decor, walls, above }, objects }));
