// Generates the game's pixel art: the tileset and the avatar parts sheet. All of it is drawn
// here, so it is ours to license (CC0, like the rest of the repo's art).
// Usage: node scripts/generate-art.mjs
// The avatar layout here must match src/game/avatars.ts. Tile indices are referenced by the
// maps (gid = index + 1), so append new tiles instead of reordering.
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const T = 32;
const OUTLINE = [36, 30, 44];

// --- Drawing kit ---------------------------------------------------------------

/** A seeded random generator, so every run draws the same texture noise. */
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lightens (f > 1) or darkens (f < 1) a colour, keeping its alpha. */
const sh = ([r, g, b, a = 255], f) =>
  f >= 1
    ? [r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1), a].map(Math.round)
    : [r * f, g * f, b * f, a].map(Math.round);
const alpha = ([r, g, b], a) => [r, g, b, a];

function canvas(w, h) {
  const px = new Uint8Array(w * h * 4);
  const get = (x, y) => {
    const i = (y * w + x) * 4;
    return [px[i], px[i + 1], px[i + 2], px[i + 3]];
  };
  /** Paints one pixel, blending translucent colours over what is there. */
  const set = (x, y, [r, g, b, a = 255]) => {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    if (a === 255 || px[i + 3] === 0) {
      px.set([r, g, b, a], i);
      return;
    }
    const da = px[i + 3] / 255;
    const sa = a / 255;
    const oa = sa + da * (1 - sa);
    const mix = (s, d) => Math.round((s * sa + d * da * (1 - sa)) / oa);
    px.set([mix(r, px[i]), mix(g, px[i + 1]), mix(b, px[i + 2]), Math.round(oa * 255)], i);
  };
  const c = {
    w,
    h,
    px,
    get,
    set,
    rect(x, y, rw, rh, col) {
      for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, col);
    },
    ellipse(cx, cy, rx, ry, col) {
      for (let j = Math.floor(cy - ry); j <= cy + ry; j++)
        for (let i = Math.floor(cx - rx); i <= cx + rx; i++)
          if (((i + 0.5 - cx) / rx) ** 2 + ((j + 0.5 - cy) / ry) ** 2 <= 1) set(i, j, col);
    },
    /** A rectangle with its top row lighter and its bottom row and right column darker. */
    box(x, y, rw, rh, col, light = 1.18, dark = 0.78) {
      c.rect(x, y, rw, rh, col);
      c.rect(x, y, rw, 1, sh(col, light));
      c.rect(x, y + rh - 1, rw, 1, sh(col, dark));
      c.rect(x + rw - 1, y + 1, 1, rh - 2, sh(col, (1 + dark) / 2));
    },
    /** Varies the brightness of opaque pixels a little, for texture. */
    noise(x, y, rw, rh, amount, seed) {
      const r = rng(seed);
      for (let j = y; j < y + rh; j++)
        for (let i = x; i < x + rw; i++) {
          const p = get(i, j);
          if (p[3] === 0) continue;
          const f = 1 + (r() - 0.5) * amount;
          px.set(sh(p, f).slice(0, 3), (j * w + i) * 4);
        }
    },
    /** Draws a 1px outline around everything opaque, outside of it. */
    outline(col = OUTLINE) {
      const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && px[(y * w + x) * 4 + 3] > 140;
      const edge = [];
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
          if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push([x, y]);
      for (const [x, y] of edge) set(x, y, col);
    },
    /** Paints another canvas over this one at (ox, oy), optionally mirrored. */
    paste(src, ox = 0, oy = 0, mirror = false) {
      for (let y = 0; y < src.h; y++)
        for (let x = 0; x < src.w; x++) {
          const p = src.get(mirror ? src.w - 1 - x : x, y);
          if (p[3]) set(ox + x, oy + y, p);
        }
    },
  };
  return c;
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function png({ w, h, px }) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(px.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Tileset: 8 columns x 90 rows of 32px tiles ---------------------------------
// Tiles 0-207 are the original set; from 208 on, each room's restyle has a block of 32 (see ROOM_BLOCKS below).
const TILESET_COLUMNS = 8;
const TILESET_ROWS = 90;
const tiles = canvas(TILESET_COLUMNS * T, TILESET_ROWS * T);

/**
 * Tiles that block movement on a map's walls layer. This script writes them to
 * content/tilesets/tiles.json, which the engine and the map tests read; maps carry no tile properties.
 */
const SOLID = new Set();
const solid = (...indices) => indices.forEach((i) => SOLID.add(i));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Draws tile `index`. `draw` gets the tile canvas plus `obj(fn)`, which draws `fn` on a
 * transparent layer, outlines it and pastes it on top: use it for furniture and props.
 */
function drawTile(index, draw) {
  const tile = canvas(T, T);
  const obj = (fn, outline = true) => {
    const layer = canvas(T, T);
    fn(layer);
    if (outline) layer.outline();
    tile.paste(layer);
  };
  /** A soft drop shadow on the floor below a free-standing object. */
  const shadow = (cx = 16, cy = 28, rx = 12, ry = 3) => tile.ellipse(cx, cy, rx, ry, [0, 0, 0, 60]);
  draw(tile, { obj, shadow });
  tiles.paste(tile, (index % TILESET_COLUMNS) * T, Math.floor(index / TILESET_COLUMNS) * T);
}

// Shared pieces
const WALL = [118, 124, 150];
const WALL_TOP = [54, 58, 78];
const WOOD = [134, 92, 58];
const WOOD_DARK = [96, 64, 40];
const METAL = [150, 158, 172];
const SCREEN = [40, 200, 130];

/** The top of a wall seen from above, darker along the edge towards the room. */
function wallTop(g) {
  g.rect(0, 0, T, T, WALL_TOP);
  g.noise(0, 0, T, T, 0.08, 4);
  g.rect(0, 0, T, 1, sh(WALL_TOP, 1.25));
  g.rect(0, T - 3, T, 3, sh(WALL_TOP, 0.75));
}

/** The front face of a wall: plaster above a wooden skirting board, used behind wall-mounted things. */
function wallFront(g, seed = 3) {
  g.rect(0, 0, T, T, WALL);
  g.noise(0, 0, T, T, 0.06, seed);
  g.rect(0, 0, T, 2, sh(WALL, 0.72));
  g.rect(0, 2, T, 1, sh(WALL, 1.12));
  g.rect(0, T - 5, T, 5, WOOD_DARK);
  g.rect(0, T - 5, T, 1, sh(WOOD_DARK, 1.25));
}

/** A wooden desk seen from the front, occupying the lower part of the tile. */
function deskBase(g, top = WOOD) {
  g.box(1, 13, T - 2, 10, top, 1.25);
  g.rect(1, 15, T - 2, 1, sh(top, 0.85));
  g.rect(3, 23, 3, 7, sh(top, 0.7));
  g.rect(T - 6, 23, 3, 7, sh(top, 0.7));
}

/** A white lab bench with steel legs. */
function benchBase(g) {
  const top = [214, 222, 230];
  g.box(1, 13, T - 2, 10, top, 1.1, 0.8);
  g.rect(1, 15, T - 2, 1, sh(top, 0.9));
  g.rect(4, 23, 2, 7, METAL);
  g.rect(T - 6, 23, 2, 7, METAL);
  g.rect(6, 17, T - 12, 4, sh(top, 0.88));
  g.rect(14, 18, 4, 1, sh(METAL, 0.7));
}

/** A paper sheet with lines of text. */
function paper(g, x, y, w, h, col = [250, 248, 238]) {
  g.box(x, y, w, h, col, 1, 0.86);
  for (let j = y + 2; j < y + h - 2; j += 2) g.rect(x + 2, j, Math.max(2, w - 4 - ((j * 7) % 4)), 1, [130, 130, 145]);
}

/** One leaf of a double door: doors are two tiles wide, so each tile fills its width and a pair meets at a post. */
function door(g, frame, glow) {
  wallFront(g, 11);
  g.rect(0, 1, T, T - 1, sh(frame, 0.7));
  g.box(0, 2, T, T - 2, frame, 1.3);
  g.rect(3, 5, T - 6, T - 5, [24, 20, 30]);
  for (let j = 0; j < T - 5; j++) g.rect(3, 5 + j, T - 6, 1, alpha(glow, Math.round(30 + (j / (T - 5)) * 140)));
  g.rect(3, T - 3, T - 6, 3, glow);
  g.rect(5, 7, 2, 10, alpha(sh(glow, 1.4), 90));
}

// 0 floor: wooden planks
drawTile(0, (g) => {
  const plank = [182, 138, 96];
  g.rect(0, 0, T, T, plank);
  g.noise(0, 0, T, T, 0.1, 1);
  for (let y = 0; y < T; y += 8) {
    g.rect(0, y, T, 1, sh(plank, 0.72));
    g.rect(0, y + 1, T, 1, sh(plank, 1.08));
  }
  for (const [x, y] of [[10, 0], [26, 8], [5, 16], [19, 24]]) {
    g.rect(x, y, 1, 8, sh(plank, 0.72));
    g.set(x + 1, y + 1, sh(plank, 1.1));
  }
  g.set(14, 4, sh(plank, 0.8));
  g.set(29, 20, sh(plank, 0.8));
});
// 1 floor alt: stone tiles
drawTile(1, (g) => {
  const stone = [206, 208, 214];
  g.rect(0, 0, T, T, stone);
  g.noise(0, 0, T, T, 0.06, 2);
  for (const o of [0, 16]) {
    g.rect(0, o, T, 1, sh(stone, 0.8));
    g.rect(o, 0, 1, T, sh(stone, 0.8));
    g.rect(1, o + 1, T - 1, 1, sh(stone, 1.08));
    g.rect(o + 1, 1, 1, T - 1, sh(stone, 1.08));
  }
});
// 2 wall top
drawTile(2, wallTop);
// 3 wall front
drawTile(3, (g) => wallFront(g));
// 4 carpet: red with a golden border pattern
drawTile(4, (g) => {
  const red = [150, 44, 58];
  g.rect(0, 0, T, T, red);
  g.noise(0, 0, T, T, 0.08, 5);
  for (let y = 0; y < T; y += 8)
    for (let x = (y / 8) % 2 ? 4 : 0; x < T; x += 8) {
      g.set(x + 3, y + 3, [200, 150, 70]);
      g.set(x + 4, y + 4, [200, 150, 70]);
      g.set(x + 3, y + 4, sh(red, 1.2));
      g.set(x + 4, y + 3, sh(red, 1.2));
    }
});
// 5 door: Python (blue), 6 door: SQL (amber)
drawTile(5, (g) => door(g, [50, 104, 180], [120, 190, 255]));
drawTile(6, (g) => door(g, [168, 108, 36], [255, 200, 100]));
// 7 plant in a pot
drawTile(7, (g, { obj, shadow }) => {
  shadow(16, 29, 9, 2);
  obj((o) => {
    o.box(10, 21, 12, 9, [178, 96, 58]);
    o.rect(9, 20, 14, 3, [150, 78, 46]);
    const leaf = [56, 140, 76];
    o.ellipse(16, 13, 9, 8, leaf);
    o.ellipse(10, 10, 5, 5, leaf);
    o.ellipse(22, 11, 5, 5, leaf);
    o.ellipse(16, 6, 5, 5, leaf);
    o.ellipse(12, 9, 3, 3, sh(leaf, 1.3));
    o.ellipse(19, 6, 2, 2, sh(leaf, 1.3));
    o.ellipse(21, 15, 3, 2, sh(leaf, 0.75));
    o.ellipse(13, 17, 3, 2, sh(leaf, 0.75));
  });
});
// 8 table
drawTile(8, (g, { obj, shadow }) => {
  shadow(16, 28, 13, 3);
  obj((o) => {
    o.box(1, 8, T - 2, 13, WOOD, 1.3);
    o.rect(1, 10, T - 2, 1, sh(WOOD, 0.85));
    o.rect(3, 21, 3, 8, WOOD_DARK);
    o.rect(T - 6, 21, 3, 8, WOOD_DARK);
  });
});
// 9 noticeboard
drawTile(9, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(3, 4, T - 6, 21, [176, 126, 80]);
    o.noise(4, 5, T - 8, 19, 0.15, 9);
    paper(o, 6, 7, 9, 8);
    o.box(17, 8, 9, 10, [255, 236, 140]);
    o.box(7, 17, 8, 6, [196, 226, 255]);
    o.set(10, 7, [220, 60, 60]);
    o.set(21, 8, [60, 120, 220]);
  });
});
// 10 terminal on a desk
drawTile(10, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    deskBase(o);
    o.box(7, 1, 18, 13, [52, 56, 70]);
    o.rect(9, 3, 14, 9, [18, 40, 34]);
    o.rect(10, 5, 6, 1, SCREEN);
    o.rect(10, 7, 9, 1, SCREEN);
    o.rect(10, 9, 4, 1, SCREEN);
    o.rect(15, 9, 1, 1, sh(SCREEN, 1.6));
    o.rect(14, 14, 4, 1, [52, 56, 70]);
    o.rect(9, 15, 14, 2, [70, 74, 88]);
  });
});
// 11 safe
drawTile(11, (g, { obj, shadow }) => {
  shadow(16, 29, 12, 2);
  obj((o) => {
    o.box(4, 3, T - 8, T - 5, [96, 102, 118]);
    o.box(6, 5, T - 12, T - 9, [126, 134, 152]);
    o.ellipse(16, 15, 5, 5, [62, 66, 80]);
    o.ellipse(16, 15, 3, 3, [180, 186, 200]);
    o.ellipse(16, 15, 1.5, 1.5, [230, 196, 80]);
    o.rect(21, 19, 2, 5, [62, 66, 80]);
    o.rect(6, 27, 3, 2, [62, 66, 80]);
    o.rect(T - 9, 27, 3, 2, [62, 66, 80]);
  });
});
// 12 bookshelf
drawTile(12, (g, { obj }) => {
  obj((o) => {
    o.box(2, 0, T - 4, T, [112, 74, 44]);
    const books = [[196, 70, 70], [70, 118, 196], [224, 182, 72], [88, 160, 100], [160, 90, 180], [230, 230, 220]];
    for (let s = 0; s < 3; s++) {
      const y = 2 + s * 10;
      o.rect(4, y, T - 8, 8, [70, 46, 26]);
      o.rect(4, y + 8, T - 8, 2, [140, 98, 62]);
      let x = 5;
      for (let i = 0; x < T - 6; i++) {
        const bw = 2 + ((i + s) % 3 === 0 ? 2 : 1);
        const bh = 6 + ((i * 3 + s) % 3 === 0 ? 0 : 1);
        const col = books[(i * 2 + s) % books.length];
        o.rect(x, y + 8 - bh, bw, bh, col);
        o.rect(x, y + 8 - bh, 1, bh, sh(col, 1.2));
        o.rect(x, y + 10 - bh, bw, 1, sh(col, 0.7));
        x += bw + (i % 4 === 3 ? 1 : 0);
      }
    }
  });
});
// 13 keypad
drawTile(13, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(9, 4, 14, 21, [52, 56, 70]);
    o.rect(11, 6, 10, 4, [20, 40, 30]);
    o.rect(12, 7, 5, 2, [120, 230, 160]);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++) {
        o.rect(11 + c * 4, 12 + r * 3, 2, 2, [206, 210, 220]);
        o.set(12 + c * 4, 13 + r * 3, [150, 156, 170]);
      }
    o.set(21, 5, [230, 70, 70]);
  });
});

// --- Research lab (python-lab) -----------------------------------------------
// 14 lab floor: pale teal tiles
drawTile(14, (g) => {
  const teal = [192, 220, 216];
  g.rect(0, 0, T, T, teal);
  g.noise(0, 0, T, T, 0.05, 14);
  g.rect(0, 0, T, 1, sh(teal, 0.84));
  g.rect(0, 0, 1, T, sh(teal, 0.84));
  g.rect(1, 1, T - 1, 1, sh(teal, 1.08));
  g.rect(1, 1, 1, T - 1, sh(teal, 1.08));
  g.set(22, 9, sh(teal, 0.9));
  g.set(8, 24, sh(teal, 0.9));
});
// 15 incubator: cabinet with a warm window
drawTile(15, (g, { obj, shadow }) => {
  shadow(16, 30, 12, 2);
  obj((o) => {
    o.box(3, 0, T - 6, T - 1, [208, 212, 220]);
    o.rect(6, 4, T - 12, 14, [80, 40, 26]);
    for (let j = 0; j < 10; j++) o.rect(8, 6 + j, T - 16, 1, [250, 120 + j * 9, 50]);
    o.rect(9, 7, 2, 6, [255, 230, 170]);
    o.rect(8, 22, 6, 4, [40, 44, 56]);
    o.rect(9, 23, 4, 2, [255, 90, 70]);
    o.rect(18, 22, 6, 1, [140, 146, 156]);
    o.rect(18, 24, 6, 1, [140, 146, 156]);
  });
});
// 16 freezer: frosty chest with a padlock
drawTile(16, (g, { obj, shadow }) => {
  shadow(16, 30, 13, 2);
  obj((o) => {
    o.box(2, 1, T - 4, T - 3, [232, 240, 248], 1.05);
    o.rect(2, 1, T - 4, 4, [196, 218, 240]);
    o.rect(4, 15, T - 8, 1, [170, 190, 212]);
    for (const [x, y] of [[6, 7], [9, 9], [22, 6], [25, 10], [7, 20], [24, 22]]) o.set(x, y, [255, 255, 255]);
    o.rect(14, 13, 4, 4, [120, 120, 132]);
    o.rect(15, 14, 2, 3, [232, 240, 248]);
    o.box(12, 16, 8, 7, [216, 176, 64]);
    o.set(16, 19, [90, 70, 30]);
  });
});
// 17 microscope on a bench
drawTile(17, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    benchBase(o);
    o.box(11, 11, 12, 3, [52, 56, 70]);
    o.box(18, 0, 4, 12, [60, 64, 78]);
    o.box(12, 2, 8, 3, [60, 64, 78]);
    o.rect(13, 5, 3, 5, [90, 94, 108]);
    o.rect(12, 9, 6, 1, [120, 255, 170]);
    o.set(19, 1, [180, 186, 200]);
  });
});
// 18 laptop on a bench
drawTile(18, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    benchBase(o);
    o.box(7, 1, 18, 11, [48, 52, 64]);
    o.rect(9, 3, 14, 7, [18, 30, 40]);
    for (let y = 4; y < 10; y += 2) o.rect(10, y, 3 + ((y * 5) % 9), 1, [120, 220, 255]);
    o.box(5, 12, 22, 2, [120, 126, 140]);
  });
});
// 19 desk with a photo frame
drawTile(19, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    deskBase(o);
    o.box(9, 1, 14, 13, [168, 120, 70]);
    o.rect(11, 3, 10, 9, [186, 218, 240]);
    o.ellipse(16, 7, 2.5, 2.5, [236, 196, 160]);
    o.rect(13, 9, 6, 3, [90, 130, 190]);
    o.ellipse(13, 4.5, 1.5, 1.5, [110, 110, 120]);
    o.rect(19, 5, 2, 4, [110, 110, 120]);
  });
});
// 20 lab bench with glassware
drawTile(20, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    benchBase(o);
    o.box(5, 4, 5, 9, [196, 232, 240], 1.05);
    o.rect(6, 8, 3, 4, [120, 220, 160]);
    o.rect(5, 2, 5, 2, [160, 166, 180]);
    o.ellipse(21, 10, 5, 4, [196, 232, 240]);
    o.ellipse(21, 11, 4, 2.5, [230, 130, 200]);
    o.rect(20, 3, 3, 4, [196, 232, 240]);
    o.set(19, 9, [255, 255, 255]);
  });
});
// 21 shelf of glowing jars
drawTile(21, (g, { obj }) => {
  obj((o) => {
    o.box(2, 0, T - 4, T, [112, 74, 44]);
    for (let s = 0; s < 3; s++) {
      const y = 2 + s * 10;
      o.rect(4, y, T - 8, 8, [70, 46, 26]);
      o.rect(4, y + 8, T - 8, 2, [140, 98, 62]);
      for (let i = 0; i < 3; i++) {
        const x = 5 + i * 8;
        o.box(x, y + 1, 6, 7, [200, 228, 236], 1.05);
        const glow = [[130, 255, 150], [150, 220, 255], [255, 200, 120]][(i + s) % 3];
        o.rect(x + 1, y + 4, 4, 3, glow);
        o.set(x + 1, y + 2, [255, 255, 255]);
        o.rect(x, y, 6, 1, [150, 110, 80]);
      }
    }
  });
});
// 22 whiteboard
drawTile(22, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(2, 4, T - 4, 20, [170, 176, 188]);
    o.rect(3, 5, T - 6, 17, [248, 250, 252]);
    o.rect(5, 8, 7, 1, [70, 110, 200]);
    o.rect(5, 10, 10, 1, [70, 110, 200]);
    for (let x = 0; x < 10; x++) o.set(16 + x, 18 - Math.round(x * 0.8 + Math.sin(x) * 1.5), [200, 70, 70]);
    o.rect(6, 15, 3, 3, [230, 180, 60]);
    o.rect(5, 24, 22, 2, [140, 146, 156]);
    o.rect(20, 23, 4, 1, [60, 120, 220]);
  });
});
// 23 vent grille
drawTile(23, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(4, 5, T - 8, 19, [70, 74, 88]);
    for (let y = 7; y < 22; y += 3) {
      o.rect(6, y, T - 12, 1, [160, 166, 180]);
      o.rect(6, y + 1, T - 12, 1, [40, 42, 52]);
    }
    for (const [x, y] of [[5, 6], [T - 6, 6], [5, 22], [T - 6, 22]]) o.set(x, y, [200, 204, 214]);
  });
});
// 24 diploma
drawTile(24, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(7, 4, 18, 17, [176, 132, 58], 1.3);
    o.rect(9, 6, 14, 13, [252, 246, 226]);
    o.rect(11, 8, 10, 1, [80, 80, 90]);
    o.rect(12, 11, 8, 1, [150, 150, 160]);
    o.rect(12, 13, 8, 1, [150, 150, 160]);
    o.ellipse(19, 16.5, 2, 2, [200, 60, 60]);
  });
});
// 25 air-quality poster
drawTile(25, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(8, 2, 16, 22, [252, 252, 250], 1, 0.88);
    o.rect(10, 4, 12, 1, [80, 80, 90]);
    o.rect(11, 16, 3, 6, [80, 190, 110]);
    o.rect(15, 12, 3, 10, [240, 200, 70]);
    o.rect(19, 7, 3, 15, [220, 80, 70]);
    o.rect(10, 22, 13, 1, [80, 80, 90]);
  });
});
// 26 clipboard manual
drawTile(26, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(9, 4, 14, 20, [160, 114, 72]);
    paper(o, 10, 7, 12, 16);
    o.box(13, 3, 6, 3, [170, 176, 190]);
  });
});

// --- Hotel (sql-hotel) -------------------------------------------------------
// 27 reception desk with a bell and the logbook
drawTile(27, (g, { obj }) => {
  obj((o) => {
    o.box(0, 10, T, 20, [150, 40, 52]);
    o.rect(0, 10, T, 4, [206, 170, 92]);
    o.rect(0, 13, T, 1, [150, 116, 56]);
    for (let x = 3; x < T; x += 8) o.rect(x, 17, 1, 11, sh([150, 40, 52], 0.8));
    o.box(3, 3, 13, 9, [40, 60, 120]);
    o.rect(5, 4, 4, 7, [250, 246, 230]);
    o.rect(10, 4, 4, 7, [250, 246, 230]);
    o.ellipse(24, 8, 4, 3, [224, 194, 84]);
    o.rect(20, 10, 9, 1, [150, 120, 50]);
    o.rect(23, 4, 2, 2, [224, 194, 84]);
    o.set(23, 7, [255, 240, 180]);
  });
});
// 28 telephone on a desk
drawTile(28, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    deskBase(o);
    o.box(9, 6, 14, 8, [36, 36, 44]);
    o.box(7, 3, 18, 4, [36, 36, 44], 1.4);
    o.rect(12, 8, 8, 4, [220, 64, 64]);
    for (let i = 0; i < 3; i++) o.set(13 + i * 3, 10, [250, 230, 230]);
  });
});
// 29 low table with a newspaper
drawTile(29, (g, { obj, shadow }) => {
  shadow(16, 28, 13, 3);
  obj((o) => {
    o.box(3, 12, T - 6, 10, WOOD, 1.3);
    o.rect(5, 22, 3, 6, WOOD_DARK);
    o.rect(T - 8, 22, 3, 6, WOOD_DARK);
    o.box(8, 7, 16, 11, [238, 234, 222], 1, 0.85);
    o.rect(10, 9, 12, 2, [50, 50, 60]);
    o.rect(10, 12, 5, 4, [150, 160, 180]);
    for (let y = 12; y < 17; y += 2) o.rect(16, y, 6, 1, [150, 150, 160]);
  });
});
// 30 painting
drawTile(30, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(6, 3, 20, 22, [196, 154, 62], 1.35);
    o.rect(8, 5, 16, 18, [60, 84, 76]);
    o.ellipse(16, 12, 4, 5, [232, 200, 170]);
    o.ellipse(16, 9, 4.5, 3, [80, 50, 36]);
    o.rect(11, 17, 10, 6, [40, 44, 70]);
    o.rect(15, 17, 2, 3, [240, 240, 250]);
  });
});
// 31 floor plan
drawTile(31, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(4, 4, T - 8, 20, [230, 240, 252], 1, 0.88);
    o.rect(6, 7, T - 12, 1, [60, 90, 160]);
    o.rect(6, 19, T - 12, 1, [60, 90, 160]);
    for (let x = 6; x < T - 6; x += 5) o.rect(x, 7, 1, 13, [60, 90, 160]);
    o.rect(17, 8, 4, 4, [220, 70, 70]);
  });
});
// 32 security monitors on a desk
drawTile(32, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    deskBase(o, [78, 82, 96]);
    for (const x of [2, 17]) {
      o.box(x, 1, 13, 11, [36, 36, 44]);
      o.rect(x + 1, 2, 11, 8, [50, 100, 80]);
      o.rect(x + 2, 4, 5, 1, [170, 236, 196]);
      o.rect(x + 2, 6, 7, 3, [36, 70, 56]);
      o.set(x + 10, 3, [230, 60, 60]);
    }
  });
});
// 33 key-card encoder on a desk
drawTile(33, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    deskBase(o);
    o.box(7, 5, 17, 9, [206, 210, 220]);
    o.rect(9, 7, 8, 3, [30, 60, 46]);
    o.rect(10, 8, 5, 1, SCREEN);
    o.rect(19, 6, 3, 6, [36, 36, 44]);
    o.box(19, 0, 7, 8, [244, 204, 72]);
    o.rect(20, 2, 5, 1, [180, 140, 30]);
  });
});
// 34 bar counter with a till
drawTile(34, (g, { obj }) => {
  obj((o) => {
    o.box(0, 10, T, 20, [96, 56, 42]);
    o.rect(0, 10, T, 3, [160, 108, 74]);
    for (let x = 4; x < T; x += 8) o.rect(x, 16, 4, 10, [84, 48, 36]);
    o.box(7, 1, 18, 11, [52, 56, 70]);
    o.rect(9, 2, 14, 4, [30, 60, 46]);
    o.rect(10, 3, 8, 2, [120, 230, 160]);
    for (let i = 0; i < 4; i++) o.rect(9 + i * 4, 7, 3, 2, [206, 210, 220]);
  });
});
// 35 desk with papers
drawTile(35, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    deskBase(o);
    paper(o, 5, 6, 10, 9);
    paper(o, 13, 4, 11, 10, [244, 238, 220]);
    o.rect(24, 7, 2, 7, [40, 64, 170]);
    o.set(24, 6, [230, 220, 200]);
  });
});
// 36 hotel floor: blue patterned carpet
drawTile(36, (g) => {
  const blue = [54, 72, 124];
  g.rect(0, 0, T, T, blue);
  g.noise(0, 0, T, T, 0.08, 36);
  g.rect(15, 0, 2, T, sh(blue, 1.15));
  g.rect(0, 15, T, 2, sh(blue, 1.15));
  for (let i = 0; i < 4; i++) {
    g.rect(14 - i, 15 - i + i, 4 + i * 2, 2, alpha([204, 172, 92], 255 - i * 50));
    g.rect(15, 14 - i, 2, 4 + i * 2, alpha([204, 172, 92], 255 - i * 50));
  }
  g.set(0, 0, [204, 172, 92]);
});
// 37 armchair
drawTile(37, (g, { obj, shadow }) => {
  shadow(16, 29, 12, 2);
  obj((o) => {
    const red = [160, 44, 56];
    o.box(6, 4, 20, 14, sh(red, 0.85), 1.3);
    o.box(6, 14, 20, 12, red, 1.25);
    o.box(2, 11, 6, 15, sh(red, 0.8), 1.4);
    o.box(24, 11, 6, 15, sh(red, 0.8), 1.4);
    o.rect(5, 26, 3, 3, [70, 40, 30]);
    o.rect(24, 26, 3, 3, [70, 40, 30]);
    o.set(16, 9, sh(red, 0.6));
  });
});

// --- Lobby -------------------------------------------------------------------
// 38 rug for private areas: green with a light diamond pattern
drawTile(38, (g) => {
  const green = [54, 114, 94];
  g.rect(0, 0, T, T, green);
  g.noise(0, 0, T, T, 0.08, 38);
  const light = [96, 158, 130];
  for (let i = 0; i < 8; i++) {
    g.rect(15 - i, 8 + i, 2, 1, light);
    g.rect(15 + i, 8 + i, 2, 1, light);
    g.rect(15 - i, 23 - i, 2, 1, light);
    g.rect(15 + i, 23 - i, 2, 1, light);
  }
  g.rect(15, 15, 2, 2, [224, 196, 110]);
  g.rect(0, 0, T, 1, sh(green, 0.82));
  g.rect(0, 0, 1, T, sh(green, 0.82));
});

// --- Arctic station (ts-nordlys) ---------------------------------------------
// 39 fuel tank: a red cylinder with a level window
drawTile(39, (g, { obj, shadow }) => {
  shadow(16, 30, 12, 2);
  obj((o) => {
    const red = [176, 48, 48];
    o.rect(6, 4, 20, 25, red);
    for (let x = 6; x < 26; x++) {
      const f = 1.25 - Math.abs(x - 12) / 22;
      o.rect(x, 4, 1, 25, sh(red, f));
    }
    o.ellipse(16, 4, 10, 3, sh(red, 1.25));
    o.rect(6, 10, 20, 1, sh(red, 0.65));
    o.rect(6, 22, 20, 1, sh(red, 0.65));
    o.box(13, 12, 6, 10, [40, 40, 50]);
    o.rect(14, 15, 4, 6, [250, 200, 80]);
    o.rect(8, 29, 4, 2, [80, 80, 90]);
    o.rect(20, 29, 4, 2, [80, 80, 90]);
  });
});
// 40 gauge panel
drawTile(40, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(5, 3, 22, 22, [64, 68, 82]);
    o.ellipse(16, 13, 8, 8, [238, 242, 246]);
    o.ellipse(16, 13, 6, 6, [250, 252, 255]);
    for (let a = 0; a < 7; a++) {
      const r = (Math.PI * (0.8 + a * 0.23));
      o.set(16 + Math.round(Math.cos(r) * 6.5), 13 + Math.round(Math.sin(r) * 6.5), [80, 80, 90]);
    }
    o.rect(10, 13, 6, 1, [220, 70, 70]);
    o.ellipse(16, 13.5, 1.5, 1.5, [40, 40, 50]);
    o.rect(8, 22, 16, 2, [120, 220, 160]);
  });
});
// 41 window with northern lights
drawTile(41, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(4, 3, 24, 21, [186, 192, 206], 1.15);
    o.rect(6, 5, 20, 17, [14, 22, 50]);
    for (let x = 6; x < 26; x++) {
      const y = 12 + Math.round(3 * Math.sin(x / 3));
      o.rect(x, y - 2, 1, 4, [80, 232, 160]);
      o.rect(x, y - 4, 1, 2, [150, 110, 232]);
      o.rect(x, y + 2, 1, 1, alpha([80, 232, 160], 90));
    }
    o.rect(15, 5, 2, 17, [186, 192, 206]);
    for (const [x, y] of [[9, 7], [22, 6], [12, 19], [20, 20]]) o.set(x, y, [255, 255, 255]);
    o.rect(6, 19, 20, 3, [230, 240, 250]);
  });
});
// 42 metal grating floor
drawTile(42, (g) => {
  const steel = [122, 130, 142];
  g.rect(0, 0, T, T, steel);
  for (let i = 0; i < T; i += 4) {
    g.rect(i, 0, 1, T, sh(steel, 0.84));
    g.rect(0, i, T, 1, sh(steel, 0.84));
    for (let j = 2; j < T; j += 4) g.set(i + 2, j, sh(steel, 1.15));
  }
  g.rect(0, 0, T, 1, sh(steel, 0.7));
  g.rect(0, 0, 1, T, sh(steel, 0.7));
  for (const [x, y] of [[2, 2], [T - 3, 2], [2, T - 3], [T - 3, T - 3]]) g.set(x, y, [200, 206, 216]);
});
// 43 door: time series (ice blue)
drawTile(43, (g) => door(g, [120, 172, 204], [196, 242, 255]));

// --- Market hall (pandas-market) -----------------------------------------------
/** A market stall: a striped awning on poles over a wooden counter; `goods` draws on the counter. */
function stall(o, stripe, goods) {
  o.rect(3, 6, 2, 16, WOOD_DARK);
  o.rect(T - 5, 6, 2, 16, WOOD_DARK);
  for (let x = 1; x < T - 1; x++) o.rect(x, 1, 1, 6, Math.floor((x - 1) / 5) % 2 ? [248, 244, 232] : stripe);
  for (let x = 1; x < T - 1; x += 5) o.ellipse(x + 2.5, 7, 2.5, 1.5, stripe);
  o.rect(1, 1, T - 2, 1, sh(stripe, 1.25));
  o.box(1, 18, T - 2, 11, WOOD, 1.3);
  o.rect(1, 20, T - 2, 1, sh(WOOD, 0.85));
  goods(o);
}
/** A crate seen from the front, filled with round produce. */
function crate(o, x, y, w, fruit) {
  o.box(x, y + 3, w, 6, [190, 140, 84]);
  o.rect(x, y + 5, w, 1, [150, 104, 60]);
  for (let i = x + 2; i < x + w - 1; i += 3) o.ellipse(i + 0.5, y + 2.5, 1.8, 1.8, fruit);
  for (let i = x + 2; i < x + w - 1; i += 6) o.set(i, y + 1, sh(fruit, 1.4));
}

// 44 market floor: cobblestones
drawTile(44, (g) => {
  const mortar = [126, 118, 108];
  g.rect(0, 0, T, T, mortar);
  const r = rng(44);
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let col = -1; col < 4; col++) {
      const x = col * 8 + off;
      const stone = sh([176, 166, 150], 0.9 + r() * 0.18);
      g.rect(x + 1, row * 8 + 1, 7, 6, stone);
      g.rect(x + 1, row * 8 + 1, 7, 1, sh(stone, 1.12));
      g.rect(x + 1, row * 8 + 6, 7, 1, sh(stone, 0.86));
    }
  }
});
// 45 vegetable stall
drawTile(45, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) =>
    stall(o, [70, 150, 80], () => {
      crate(o, 3, 11, 9, [230, 120, 40]);
      crate(o, 13, 11, 8, [90, 170, 70]);
      crate(o, 22, 11, 8, [210, 50, 50]);
    }),
  );
});
// 46 honey stall
drawTile(46, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) =>
    stall(o, [232, 176, 40], () => {
      for (let i = 0; i < 4; i++) {
        const x = 4 + i * 6;
        o.box(x, 13, 5, 6, [236, 160, 30], 1.25);
        o.rect(x, 12, 5, 2, [250, 246, 236]);
        o.set(x + 1, 15, [255, 220, 130]);
      }
      o.box(12, 22, 8, 4, [250, 240, 200]);
    }),
  );
});
// 47 bread stall
drawTile(47, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) =>
    stall(o, [190, 70, 60], () => {
      const crust = [196, 132, 64];
      o.ellipse(9, 16, 5, 3, crust);
      o.ellipse(9, 15, 4, 1.5, sh(crust, 1.2));
      o.ellipse(20, 16, 4, 2.5, sh(crust, 0.9));
      o.ellipse(26, 16, 2.5, 2.5, sh(crust, 1.1));
      for (let x = 7; x < 12; x += 2) o.set(x, 15, sh(crust, 0.7));
      o.box(4, 22, 7, 5, [250, 248, 238], 1, 0.85);
      o.rect(5, 24, 4, 1, [80, 80, 90]);
    }),
  );
});
// 48 chalkboard easel
drawTile(48, (g, { obj, shadow }) => {
  shadow(16, 30, 10, 2);
  obj((o) => {
    o.rect(7, 24, 2, 6, WOOD_DARK);
    o.rect(T - 9, 24, 2, 6, WOOD_DARK);
    o.box(5, 2, T - 10, 23, [150, 104, 60], 1.3);
    o.rect(7, 4, T - 14, 19, [44, 56, 50]);
    for (let y = 7; y < 21; y += 4) {
      o.rect(9, y, 6 + ((y * 3) % 5), 1, [230, 232, 226]);
      o.rect(19, y, 4, 1, [250, 220, 120]);
    }
  });
});
// 49 fountain
drawTile(49, (g, { obj, shadow }) => {
  shadow(16, 28, 14, 3);
  obj((o) => {
    const stone = [170, 172, 180];
    o.ellipse(16, 21, 14, 7, stone);
    o.ellipse(16, 19, 12, 5, sh(stone, 1.15));
    o.ellipse(16, 20, 10.5, 4, [90, 160, 210]);
    o.ellipse(13, 19, 3, 1, [190, 230, 250]);
    o.box(14, 8, 4, 12, stone);
    o.ellipse(16, 8, 5, 2, sh(stone, 1.15));
    o.rect(15, 2, 2, 6, [150, 210, 245]);
    o.set(13, 5, [190, 230, 250]);
    o.set(19, 4, [190, 230, 250]);
    o.set(12, 9, [150, 210, 245]);
    o.set(20, 9, [150, 210, 245]);
  });
});
// 50 table with a ledger and a calculator
drawTile(50, (g, { obj, shadow }) => {
  shadow(16, 28, 13, 3);
  obj((o) => {
    o.box(1, 10, T - 2, 11, WOOD, 1.3);
    o.rect(1, 12, T - 2, 1, sh(WOOD, 0.85));
    o.rect(3, 21, 3, 8, WOOD_DARK);
    o.rect(T - 6, 21, 3, 8, WOOD_DARK);
    o.box(3, 3, 15, 10, [40, 90, 70]);
    paper(o, 4, 4, 6, 8);
    paper(o, 11, 4, 6, 8);
    o.box(20, 4, 8, 9, [60, 64, 78]);
    o.rect(21, 5, 6, 2, [160, 220, 170]);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) o.set(21 + c * 2, 8 + r * 2, [210, 214, 222]);
  });
});
// 51 table with cash envelopes
drawTile(51, (g, { obj, shadow }) => {
  shadow(16, 28, 13, 3);
  obj((o) => {
    o.box(1, 10, T - 2, 11, WOOD, 1.3);
    o.rect(1, 12, T - 2, 1, sh(WOOD, 0.85));
    o.rect(3, 21, 3, 8, WOOD_DARK);
    o.rect(T - 6, 21, 3, 8, WOOD_DARK);
    const env = [236, 214, 160];
    for (const [x, y] of [[3, 6], [10, 3], [17, 6], [22, 2]]) {
      o.box(x, y, 8, 6, env, 1.1);
      o.rect(x + 1, y + 1, 3, 1, sh(env, 0.8));
      o.rect(x + 4, y + 1, 3, 1, sh(env, 0.8));
      o.set(x + 4, y + 2, sh(env, 0.7));
    }
    o.rect(12, 7, 4, 2, [120, 170, 110]);
  });
});
// 52 stacked crates of apples
drawTile(52, (g, { obj, shadow }) => {
  shadow(16, 29, 12, 2);
  obj((o) => {
    crate(o, 4, 19, 24, [210, 50, 50]);
    crate(o, 4, 11, 12, [240, 190, 50]);
    crate(o, 17, 11, 11, [100, 170, 70]);
  });
});
// 53 buckets of flowers
drawTile(53, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    for (const [x, col] of [[5, [230, 80, 120]], [16, [250, 210, 60]], [26, [150, 110, 230]]]) {
      o.rect(x - 1, 8, 1, 12, [70, 140, 70]);
      o.rect(x + 1, 10, 1, 10, [70, 140, 70]);
      o.ellipse(x - 1, 8, 2.5, 2.5, col);
      o.ellipse(x + 2, 10, 2.5, 2.5, sh(col, 0.85));
      o.ellipse(x, 6, 2, 2, sh(col, 1.2));
      o.box(x - 4, 19, 8, 10, [90, 120, 160]);
    }
  });
});

// --- Side doors (statistics) ---------------------------------------------------
/**
 * One leaf of a double door in a side wall, opening to the right (a door in a map's left wall);
 * mirrored for the right wall. Doors are two tiles tall, so each tile fills its height and a
 * pair meets at a post, like the doors in the top wall turned on their side.
 */
function sideDoor(g, frame, glow) {
  g.rect(0, 0, T, T, WALL_TOP);
  g.noise(0, 0, T, T, 0.08, 12);
  g.rect(0, 0, T - 1, T, sh(frame, 0.7));
  g.box(0, 0, T - 2, T, frame, 1.3);
  g.rect(0, 3, T - 5, T - 6, [24, 20, 30]);
  for (let i = 0; i < T - 5; i++) g.rect(i, 3, 1, T - 6, alpha(glow, Math.round(30 + (i / (T - 5)) * 140)));
  g.rect(T - 5, 3, 3, T - 6, glow);
  g.rect(8, 5, 10, 2, alpha(sh(glow, 1.4), 90));
}
const STATS_FRAME = [126, 84, 186];
const STATS_GLOW = [214, 186, 255];
// 54 door in a left wall: statistics (violet), 55 the same door in a right wall
drawTile(54, (g) => sideDoor(g, STATS_FRAME, STATS_GLOW));
drawTile(55, (g) => {
  const leaf = canvas(T, T);
  sideDoor(leaf, STATS_FRAME, STATS_GLOW);
  g.paste(leaf, 0, 0, true);
});

// --- Fairground at night (stats-fair) -------------------------------------------
// 56 fairground floor: trampled grass with sawdust
drawTile(56, (g) => {
  const grass = [72, 112, 62];
  g.rect(0, 0, T, T, grass);
  g.noise(0, 0, T, T, 0.16, 56);
  const r = rng(56);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(r() * T);
    const y = Math.floor(r() * T);
    if (i < 14) g.rect(x, y, 1, 2, sh(grass, 1.3));
    else g.rect(x, y, 2, 1, [196, 168, 112]);
  }
});
/** A fairground booth: a tall striped canopy with a scalloped edge over a painted counter. */
function booth(o, stripe, counter, goods) {
  o.rect(3, 4, 2, 18, WOOD_DARK);
  o.rect(T - 5, 4, 2, 18, WOOD_DARK);
  for (let x = 1; x < T - 1; x++) o.rect(x, 0, 1, 6, Math.floor((x - 1) / 4) % 2 ? [250, 246, 236] : stripe);
  for (let x = 1; x < T - 1; x += 4) o.ellipse(x + 2, 6, 2, 1.5, stripe);
  o.rect(1, 0, T - 2, 1, sh(stripe, 1.3));
  for (let x = 4; x < T - 3; x += 6) o.set(x, 9, [255, 236, 150]);
  o.box(1, 18, T - 2, 11, counter, 1.3);
  o.rect(1, 20, T - 2, 1, sh(counter, 0.82));
  for (let x = 4; x < T - 4; x += 6) o.rect(x, 23, 3, 3, sh(counter, 1.35));
  goods(o);
}
/** A die seen at an angle: a light square with pips. */
function die(o, x, y, pips) {
  o.box(x, y, 6, 6, [248, 246, 240], 1, 0.8);
  for (const [i, j] of pips) o.set(x + i, y + j, [40, 36, 50]);
}
// 57 dice stall (Lucky Seven)
drawTile(57, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) =>
    booth(o, [128, 70, 190], [170, 46, 70], () => {
      o.box(6, 12, 20, 6, [40, 110, 70], 1.2);
      die(o, 8, 11, [[1, 1], [4, 4]]);
      die(o, 17, 12, [[1, 1], [3, 3], [4, 4]]);
      o.box(11, 21, 10, 5, [252, 216, 80], 1.2);
      o.rect(14, 22, 4, 3, [170, 46, 70]);
    }),
  );
});
// 58 duck pond: a round tub with floating ducks
drawTile(58, (g, { obj, shadow }) => {
  shadow(16, 28, 15, 3);
  obj((o) => {
    o.ellipse(16, 19, 15, 9, [196, 60, 60]);
    o.ellipse(16, 18, 13.5, 7.5, sh([196, 60, 60], 1.25));
    o.ellipse(16, 18, 12, 6, [70, 150, 210]);
    o.ellipse(12, 16, 4, 1.2, [150, 210, 240]);
    for (const [x, y] of [[9, 18], [16, 15], [21, 20], [14, 21], [23, 15]]) {
      o.ellipse(x, y, 2.5, 1.8, [252, 214, 60]);
      o.ellipse(x + 1.5, y - 2, 1.5, 1.4, [252, 214, 60]);
      o.set(x + 3, y - 2, [240, 130, 40]);
      o.set(x + 1, y - 2, [40, 36, 50]);
    }
    o.box(3, 23, 26, 4, [176, 52, 52], 1.1);
  });
});
// 59 lemonade stand: a yellow canopy, a jug and cups
drawTile(59, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) =>
    booth(o, [240, 200, 50], [70, 150, 190], () => {
      o.box(7, 9, 8, 9, [250, 240, 150], 1.2);
      o.rect(8, 11, 6, 6, [250, 222, 70]);
      o.rect(15, 11, 2, 4, [220, 230, 236]);
      for (const x of [18, 23]) {
        o.box(x, 13, 4, 5, [240, 244, 248], 1, 0.85);
        o.rect(x + 1, 14, 2, 3, [250, 222, 70]);
      }
      o.ellipse(11, 7.5, 1.5, 1.5, [120, 190, 70]);
    }),
  );
});
// 60 filling machine: a steel dispenser with a lemonade tank
drawTile(60, (g, { obj, shadow }) => {
  shadow(16, 30, 11, 2);
  obj((o) => {
    o.box(7, 9, 18, 20, METAL, 1.25);
    o.rect(9, 11, 14, 7, [200, 206, 216]);
    o.box(9, 1, 14, 9, [236, 242, 246], 1, 0.85);
    o.rect(10, 4, 12, 5, [250, 222, 70]);
    o.rect(11, 4, 2, 1, [255, 246, 170]);
    o.rect(10, 12, 5, 3, [24, 40, 34]);
    o.rect(11, 13, 3, 1, [120, 230, 160]);
    o.ellipse(19, 13.5, 1.5, 1.5, [220, 70, 70]);
    o.rect(15, 18, 2, 3, [90, 96, 110]);
    o.box(13, 22, 6, 5, [240, 244, 248], 1, 0.85);
    o.rect(14, 24, 4, 2, [250, 222, 70]);
    o.rect(9, 27, 14, 1, sh(METAL, 0.7));
  });
});
// 61 ticket booth: a small kiosk with a window and a laptop
drawTile(61, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) => {
    const red = [176, 52, 60];
    o.box(2, 3, T - 4, T - 4, red, 1.2);
    o.rect(2, 1, T - 4, 4, [250, 236, 200]);
    for (let x = 2; x < T - 2; x += 4) o.rect(x, 1, 2, 4, [210, 160, 60]);
    o.rect(5, 8, T - 10, 10, [36, 30, 44]);
    o.rect(6, 9, T - 12, 8, [70, 60, 90]);
    o.box(10, 13, 10, 5, [52, 56, 70]);
    o.rect(11, 14, 8, 3, [70, 160, 220]);
    o.box(3, 18, T - 6, 3, WOOD, 1.3);
    o.box(9, 22, 14, 4, [250, 236, 200], 1, 0.85);
    o.rect(11, 23, 10, 2, red);
  });
});
// 62 signpost: a painted board on a post
drawTile(62, (g, { obj, shadow }) => {
  shadow(16, 30, 7, 2);
  obj((o) => {
    o.rect(15, 16, 3, 14, WOOD_DARK);
    o.box(4, 3, 24, 15, [236, 222, 186], 1.1);
    o.rect(5, 4, 22, 1, [200, 70, 70]);
    o.rect(7, 7, 14, 1, [70, 60, 90]);
    o.rect(7, 10, 18, 1, [130, 120, 150]);
    o.rect(7, 13, 11, 1, [130, 120, 150]);
    o.ellipse(23, 13, 2, 2, [240, 200, 50]);
  });
});
// 63 prize shelf with teddy bears
drawTile(63, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) => {
    o.box(2, 2, T - 4, T - 3, [112, 74, 44]);
    for (const y of [12, 24]) o.rect(3, y, T - 6, 2, [150, 104, 66]);
    const bears = [[196, 140, 90], [230, 120, 150], [120, 170, 220]];
    for (let s = 0; s < 2; s++)
      for (let i = 0; i < 3; i++) {
        const x = 7 + i * 9;
        const y = 8 + s * 12;
        const col = bears[(i + s) % 3];
        o.ellipse(x, y, 3.5, 3.5, col);
        o.ellipse(x, y - 4, 2.5, 2.5, col);
        o.set(x - 2, y - 6, sh(col, 0.8));
        o.set(x + 2, y - 6, sh(col, 0.8));
        o.set(x, y - 4, [40, 36, 50]);
      }
  });
});
// 64 wall with string lights
drawTile(64, (g) => {
  wallFront(g, 64);
  for (let x = 0; x < T; x++) g.set(x, 6 + Math.round(Math.sin((x / T) * Math.PI) * 4), [50, 46, 60]);
  const bulbs = [[255, 220, 90], [250, 110, 110], [130, 200, 255], [150, 240, 140]];
  for (let i = 0; i < 4; i++) {
    const x = 4 + i * 8;
    const y = 8 + Math.round(Math.sin((x / T) * Math.PI) * 4);
    g.ellipse(x, y, 3.5, 3.5, alpha(bulbs[i], 70));
    g.ellipse(x, y, 1.5, 2, bulbs[i]);
  }
});
// 65 fair poster
drawTile(65, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(7, 2, 18, 22, [40, 40, 90], 1.2);
    for (let i = 0; i < 5; i++) o.set(9 + i * 4, 4, [255, 220, 90]);
    o.ellipse(16, 12, 5, 5, [240, 200, 50]);
    o.ellipse(16, 12, 3, 3, [220, 70, 90]);
    o.rect(10, 19, 12, 1, [250, 246, 236]);
    o.rect(12, 21, 8, 1, [200, 190, 230]);
  });
});

// --- Chocolate factory (stats-ab) -----------------------------------------------
// 66 factory floor: terracotta quarry tiles
drawTile(66, (g) => {
  const tile = [166, 96, 70];
  g.rect(0, 0, T, T, sh(tile, 0.75));
  const r = rng(66);
  for (const [x, y] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
    const c = sh(tile, 0.94 + r() * 0.12);
    g.rect(x + 1, y + 1, 15, 15, c);
    g.rect(x + 1, y + 1, 15, 1, sh(c, 1.12));
    g.rect(x + 1, y + 15, 15, 1, sh(c, 0.88));
  }
  g.noise(0, 0, T, T, 0.06, 66);
});
/** A chocolate bar in its wrapper, seen from above. */
function bar(o, x, y, wrap) {
  o.box(x, y, 7, 4, wrap, 1.25);
  o.rect(x + 2, y + 1, 3, 2, [250, 240, 220]);
}
// 67 conveyor belt with chocolate bars
drawTile(67, (g, { obj, shadow }) => {
  shadow(16, 30, 15, 2);
  obj((o) => {
    o.box(0, 10, T, 12, [60, 62, 74], 1.3);
    for (let x = 1; x < T; x += 4) o.rect(x, 12, 1, 8, [80, 84, 98]);
    o.rect(0, 22, T, 2, METAL);
    for (const x of [3, T - 6]) o.rect(x, 24, 3, 6, sh(METAL, 0.7));
    bar(o, 2, 13, [120, 70, 44]);
    bar(o, 12, 14, [200, 60, 70]);
    bar(o, 22, 13, [120, 70, 44]);
  });
});
// 68 scale on a bench
drawTile(68, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    benchBase(o);
    o.box(6, 5, 20, 9, [226, 230, 236], 1.1);
    o.box(8, 2, 16, 4, METAL, 1.2);
    bar(o, 12, 0, [200, 60, 70]);
    o.rect(9, 8, 10, 4, [24, 40, 34]);
    o.rect(10, 9, 7, 2, [120, 230, 160]);
    o.ellipse(22, 10, 1.5, 1.5, [70, 160, 220]);
  });
});
// 69 tasting table: plates of chocolate and rating cards
drawTile(69, (g, { obj, shadow }) => {
  shadow(16, 28, 13, 3);
  obj((o) => {
    o.box(1, 9, T - 2, 12, [244, 240, 232], 1.05, 0.85);
    o.rect(1, 11, T - 2, 1, [220, 214, 204]);
    o.rect(3, 21, 3, 8, WOOD_DARK);
    o.rect(T - 6, 21, 3, 8, WOOD_DARK);
    for (const [x, col] of [[8, [92, 54, 36]], [21, [150, 96, 60]]]) {
      o.ellipse(x, 6, 6, 3, [250, 250, 250]);
      for (let i = -3; i <= 2; i += 3) o.box(x + i, 4, 3, 3, col, 1.25);
    }
    paper(o, 4, 12, 7, 7);
    paper(o, 18, 12, 7, 7);
    o.rect(12, 14, 4, 1, [200, 60, 70]);
  });
});
// 70 fridge with a padlock
drawTile(70, (g, { obj, shadow }) => {
  shadow(16, 30, 12, 2);
  obj((o) => {
    o.box(5, 0, 22, 30, [226, 232, 238], 1.05, 0.82);
    o.rect(6, 11, 20, 1, [170, 176, 188]);
    o.rect(22, 3, 2, 6, METAL);
    o.rect(22, 14, 2, 10, METAL);
    o.rect(8, 3, 9, 5, [120, 70, 44]);
    o.rect(9, 4, 3, 1, [250, 240, 220]);
    o.ellipse(19, 21, 3, 2, [200, 160, 50]);
    o.rect(17, 17, 4, 3, [140, 146, 156]);
    o.rect(18, 18, 2, 2, [226, 232, 238]);
  });
});
// 71 cocoa sacks
drawTile(71, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) => {
    const jute = [186, 150, 100];
    for (const [x, y] of [[9, 21], [23, 21], [16, 11]]) {
      o.ellipse(x, y, 7, 7, jute);
      o.ellipse(x, y - 6, 3, 1.5, sh(jute, 0.8));
      o.rect(x - 3, y - 1, 6, 1, [120, 70, 44]);
      o.rect(x - 2, y + 1, 4, 1, [120, 70, 44]);
    }
    o.ellipse(16, 5, 2, 1.5, [110, 62, 40]);
    o.ellipse(19, 6, 1.5, 1.2, [130, 76, 48]);
  });
});
// 72 dashboard: a wide monitor with conversion bars on a desk
drawTile(72, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    deskBase(o);
    o.box(2, 0, 28, 14, [52, 56, 70]);
    o.rect(4, 2, 24, 10, [20, 28, 40]);
    for (const [x, h, col] of [[6, 4, [57, 135, 229]], [11, 5, [217, 89, 38]], [16, 7, [25, 158, 112]]]) o.rect(x, 11 - h, 3, h, col);
    o.rect(21, 4, 5, 1, [200, 206, 216]);
    o.rect(21, 6, 4, 1, [130, 136, 150]);
    o.rect(21, 8, 5, 1, [130, 136, 150]);
    o.rect(14, 14, 4, 1, [52, 56, 70]);
    o.box(8, 15, 12, 2, [80, 84, 98]);
  });
});
// 73 planning board: a whiteboard with four proposal cards
drawTile(73, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(2, 3, T - 4, 21, [170, 176, 188]);
    o.rect(3, 4, T - 6, 18, [248, 250, 252]);
    const cards = [[250, 200, 90], [150, 200, 250], [160, 230, 160], [250, 160, 170]];
    cards.forEach((col, i) => {
      const x = 4 + (i % 2) * 12;
      const y = 5 + Math.floor(i / 2) * 8;
      o.box(x, y, 10, 7, col, 1.1);
      o.rect(x + 1, y + 2, 6, 1, sh(col, 0.6));
      o.rect(x + 1, y + 4, 8, 1, sh(col, 0.75));
    });
    o.rect(18, 6, 3, 3, [25, 158, 112]);
    o.rect(5, 24, 22, 2, [140, 146, 156]);
  });
});
// 74 release console: a panel with switches and a big button
drawTile(74, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) => {
    o.box(2, 8, T - 4, 21, [70, 74, 88], 1.25);
    o.rect(4, 10, T - 8, 6, [24, 40, 34]);
    o.rect(5, 12, 9, 2, [120, 230, 160]);
    for (let i = 0; i < 4; i++) {
      o.rect(5 + i * 4, 19, 2, 4, [206, 210, 220]);
      o.set(5 + i * 4, 18 + (i % 2) * 5, [230, 196, 80]);
    }
    o.ellipse(24, 21, 3.5, 3.5, [200, 50, 60]);
    o.ellipse(23.5, 20, 1.5, 1.2, [250, 140, 140]);
    o.box(6, 2, 20, 7, [52, 56, 70]);
    o.rect(8, 4, 16, 3, [40, 36, 60]);
    o.rect(9, 5, 3, 1, [214, 186, 255]);
  });
});
// 75 bell-curve poster
drawTile(75, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(5, 2, 22, 22, [252, 252, 250], 1, 0.88);
    o.rect(7, 20, 18, 1, [80, 80, 90]);
    for (let x = 0; x < 18; x++) {
      const y = Math.round(19 - 13 * Math.exp(-(((x - 8.5) / 3.6) ** 2) / 2));
      o.rect(7 + x, y, 1, 20 - y, x > 4 && x < 13 ? [190, 170, 240] : [226, 220, 246]);
      o.set(7 + x, y, [126, 84, 186]);
    }
    o.rect(16, 5, 1, 15, [200, 70, 70]);
  });
});
// 76 shelf of chocolate packaging
drawTile(76, (g, { obj }) => {
  wallFront(g);
  obj((o) => {
    o.box(2, 3, T - 4, 21, [112, 74, 44]);
    const wraps = [[200, 60, 70], [120, 70, 44], [70, 130, 200], [240, 200, 50], [90, 160, 100]];
    for (let s = 0; s < 2; s++) {
      const y = 5 + s * 10;
      o.rect(3, y + 8, T - 6, 2, [150, 104, 66]);
      for (let i = 0; i < 6; i++) {
        const col = wraps[(i + s * 2) % wraps.length];
        o.box(4 + i * 4, y + 1, 3, 7, col, 1.25);
        o.set(5 + i * 4, y + 4, [250, 240, 220]);
      }
    }
  });
});

// --- Every room ----------------------------------------------------------------
// 77 handbook on a lectern: an open book with a ribbon on a wooden reading stand
drawTile(77, (g, { obj, shadow }) => {
  shadow(16, 29, 10, 2);
  obj((o) => {
    o.box(9, 26, 14, 3, WOOD_DARK);
    o.rect(14, 17, 4, 10, WOOD_DARK);
    o.rect(14, 17, 1, 10, sh(WOOD_DARK, 1.2));
    o.box(3, 10, 26, 9, WOOD, 1.3);
    o.rect(4, 15, 24, 3, [52, 84, 150]);
    const page = [250, 248, 238];
    o.box(5, 4, 11, 12, page, 1, 0.9);
    o.box(16, 4, 11, 12, page, 1, 0.9);
    o.rect(15, 4, 2, 12, [206, 196, 176]);
    for (let y = 6; y < 14; y += 2) {
      o.rect(7, y, y === 6 ? 5 : 7, 1, [130, 132, 150]);
      o.rect(18, y, y === 12 ? 4 : 7, 1, [130, 132, 150]);
    }
    o.rect(22, 15, 2, 6, [210, 50, 60]);
    o.set(22, 21, [160, 34, 44]);
  });
});

// --- Archive (python-docs) -----------------------------------------------------
const BOOK_COLOURS = [[196, 70, 70], [70, 118, 196], [224, 182, 72], [88, 160, 100], [160, 90, 180], [230, 230, 220]];
// 78 returns cart: a metal trolley with two shelves of books and small wheels
drawTile(78, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    for (const y of [8, 18]) {
      let x = 5;
      for (let i = 0; x < T - 6; i++) {
        const bw = 2 + (i % 3 === 0 ? 1 : 0);
        const bh = 7 + (i % 2);
        const col = BOOK_COLOURS[(i * 2 + y) % BOOK_COLOURS.length];
        o.rect(x, y - bh + 1, bw, bh, col);
        o.rect(x, y - bh + 1, 1, bh, sh(col, 1.2));
        x += bw;
      }
      o.box(3, y + 1, T - 6, 3, METAL);
    }
    o.rect(3, 4, 2, 21, sh(METAL, 0.8));
    o.rect(T - 5, 4, 2, 21, sh(METAL, 0.8));
    o.rect(T - 7, 2, 6, 2, sh(METAL, 0.7));
    for (const x of [5, T - 7]) o.ellipse(x + 1, 27, 2, 2, [52, 56, 70]);
  });
});
// 79 date-stamp machine on a desk: a grey box with a red stamp arm and a tray of books
drawTile(79, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    deskBase(o);
    o.box(6, 3, 14, 12, [120, 128, 146]);
    o.rect(8, 5, 10, 3, [40, 44, 56]);
    o.rect(9, 6, 5, 1, [250, 170, 70]);
    o.box(10, 9, 6, 4, [200, 56, 60]);
    o.rect(12, 13, 2, 2, [62, 66, 80]);
    o.box(21, 9, 8, 6, [176, 126, 80]);
    o.rect(22, 7, 6, 3, [70, 118, 196]);
    o.rect(22, 6, 6, 1, [250, 248, 238]);
  });
});
// 80 archive boxes: a stack of brown cardboard boxes with white labels
drawTile(80, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 3);
  obj((o) => {
    const card = [190, 150, 100];
    o.box(3, 16, 13, 12, card);
    o.box(16, 16, 13, 12, sh(card, 0.94));
    o.box(8, 4, 15, 12, sh(card, 1.04));
    for (const [x, y] of [[6, 19], [19, 19], [12, 7]]) {
      paper(o, x, y, 7, 4);
      o.rect(x + 1, y + 1, 4, 1, [130, 132, 150]);
    }
    o.rect(3, 22, 26, 1, sh(card, 0.8));
  });
});
// 81 card catalogue: a wooden cabinet of small drawers with brass handles
drawTile(81, (g, { obj, shadow }) => {
  shadow(16, 29, 12, 2);
  obj((o) => {
    o.box(4, 2, T - 8, 25, WOOD, 1.25);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++) {
        const x = 6 + c * 7;
        const y = 4 + r * 6;
        o.box(x, y, 6, 5, sh(WOOD, 1.12), 1.15, 0.8);
        o.rect(x + 2, y + 2, 2, 1, [230, 196, 80]);
        o.set(x + 1, y + 1, [250, 248, 238]);
      }
    o.rect(5, 27, 3, 2, WOOD_DARK);
    o.rect(T - 8, 27, 3, 2, WOOD_DARK);
  });
});

// --- Butterfly house (python-debug) ----------------------------------------------
const LEAF = [52, 138, 74];
/** A small butterfly seen from above: two pairs of wings around a dark body. */
function butterfly(o, x, y, col) {
  o.ellipse(x - 1.5, y - 0.5, 1.6, 1.4, col);
  o.ellipse(x + 2.5, y - 0.5, 1.6, 1.4, col);
  o.set(x - 1, y + 1, sh(col, 0.8));
  o.set(x + 2, y + 1, sh(col, 0.8));
  o.rect(x, y - 1, 1, 3, [40, 30, 36]);
}
// 82 greenhouse floor: a damp slate path with moss in the joints
drawTile(82, (g) => {
  const slate = [104, 112, 116];
  g.rect(0, 0, T, T, [84, 104, 84]);
  for (const [x, y, w, h] of [[1, 1, 14, 9], [16, 1, 15, 13], [1, 11, 9, 9], [11, 11, 4, 9], [16, 15, 15, 8], [1, 21, 13, 10], [15, 24, 16, 7]]) {
    g.box(x, y, w, h, sh(slate, 0.94 + ((x + y) % 5) * 0.03), 1.06, 0.9);
  }
  g.noise(0, 0, T, T, 0.12, 82);
  const r = rng(82);
  for (let i = 0; i < 10; i++) g.set(Math.floor(r() * T), Math.floor(r() * T), [96, 150, 84]);
});
// 83 plant bed: a raised wooden bed of large tropical leaves with a butterfly on top
drawTile(83, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    o.box(1, 20, T - 2, 9, WOOD, 1.25);
    o.rect(1, 23, T - 2, 1, sh(WOOD, 0.8));
    o.rect(3, 19, T - 6, 2, [74, 52, 36]);
    for (const [x, y, rx, ry, f] of [[8, 13, 7, 6, 1], [22, 12, 7, 7, 0.9], [15, 8, 6, 7, 1.1], [5, 18, 5, 3, 0.8], [26, 18, 4, 3, 0.85]]) {
      o.ellipse(x, y, rx, ry, sh(LEAF, f));
      o.rect(x, y - ry + 2, 1, ry * 2 - 3, sh(LEAF, f * 0.7));
    }
    o.ellipse(15, 17, 6, 3, sh(LEAF, 0.85));
    o.ellipse(12, 10, 2, 2, sh(LEAF, 1.35));
    butterfly(o, 21, 7, [76, 130, 230]);
  });
});
// 84 feeding station: a pedestal with a red nectar dish, orange slices and a visiting butterfly
drawTile(84, (g, { obj, shadow }) => {
  shadow(16, 29, 10, 2);
  obj((o) => {
    o.box(13, 14, 6, 14, [214, 222, 230], 1.1, 0.8);
    o.box(9, 26, 14, 3, [170, 178, 190]);
    o.ellipse(16, 12, 12, 4, [196, 60, 66]);
    o.ellipse(16, 11, 10, 2.5, [236, 120, 110]);
    for (const x of [9, 20]) {
      o.ellipse(x, 10, 3, 2, [244, 156, 40]);
      o.ellipse(x, 10, 2, 1, [252, 204, 96]);
    }
    o.ellipse(15, 10, 2, 1, [250, 220, 120]);
    butterfly(o, 14, 5, [240, 128, 40]);
  });
});
// 85 emergence cabinet: a glass-fronted wooden cabinet with rows of green chrysalises
drawTile(85, (g, { obj, shadow }) => {
  shadow(16, 29, 12, 2);
  obj((o) => {
    o.box(3, 2, T - 6, 26, WOOD, 1.25);
    o.rect(5, 4, T - 10, 21, [196, 222, 214]);
    for (const y of [5, 13]) {
      o.rect(5, y, T - 10, 1, WOOD_DARK);
      for (let x = 7; x < T - 6; x += 4) {
        o.rect(x, y + 1, 1, 1, [120, 100, 70]);
        o.ellipse(x + 0.5, y + 4, 1.5, 2.5, (x + y) % 3 ? [110, 170, 80] : [168, 146, 70]);
      }
    }
    butterfly(o, 18, 21, [230, 230, 236]);
    o.rect(5, 4, 2, 21, alpha([255, 255, 255], 70));
    o.rect(5, 27, 3, 2, WOOD_DARK);
    o.rect(T - 8, 27, 3, 2, WOOD_DARK);
  });
});
// 86 greenhouse window: glass panes with leaves pressed against them
drawTile(86, (g, { obj }) => {
  wallFront(g, 86);
  obj((o) => {
    o.box(3, 3, 26, 22, [200, 208, 214], 1.15);
    o.rect(5, 5, 22, 18, [150, 196, 176]);
    for (const [x, y, rx, ry] of [[9, 18, 6, 5], [22, 17, 6, 6], [15, 11, 4, 5], [24, 8, 3, 3]]) o.ellipse(x, y, rx, ry, alpha(LEAF, 210));
    o.rect(15, 5, 2, 18, [200, 208, 214]);
    o.rect(5, 13, 22, 1, [200, 208, 214]);
    o.rect(6, 6, 3, 1, alpha([255, 255, 255], 150));
    butterfly(o, 9, 8, [250, 210, 60]);
  });
});

// --- Night train (sql-train) ----------------------------------------------------
const TRAIN_PANEL = [168, 60, 56];
const NIGHT = [22, 30, 62];
/** A small desk of grey laminate with a dark edge, for the service car's equipment. */
function trainDesk(o) {
  o.box(1, 16, T - 2, 12, [176, 180, 188], 1.15);
  o.rect(1, 18, T - 2, 1, [120, 124, 134]);
  o.rect(3, 27, 3, 2, [80, 84, 94]);
  o.rect(T - 6, 27, 3, 2, [80, 84, 94]);
}
// 87 train floor: dark grey-blue linoleum with a fine speckle and a pale seam
drawTile(87, (g) => {
  g.rect(0, 0, T, T, [74, 82, 102]);
  g.noise(0, 0, T, T, 0.1, 87);
  const r = rng(870);
  for (let i = 0; i < 14; i++) g.set(Math.floor(r() * T), Math.floor(r() * T), [104, 114, 138]);
  g.rect(0, T - 1, T, 1, [62, 68, 86]);
});
// 88 train window at night: a rounded pane with stars, a moon and dark hills, in a red carriage wall
drawTile(88, (g, { obj }) => {
  wallFront(g, 88);
  g.rect(0, 22, T, 2, TRAIN_PANEL);
  obj((o) => {
    o.box(3, 3, 26, 18, [196, 200, 208], 1.15);
    o.rect(5, 5, 22, 14, NIGHT);
    for (const [x, y] of [[7, 7], [12, 6], [19, 8], [24, 6], [9, 11], [22, 11]]) o.set(x, y, [230, 230, 250]);
    o.ellipse(21, 8, 2.5, 2.5, [244, 236, 196]);
    o.ellipse(22, 7, 2, 2, NIGHT);
    o.ellipse(9, 20, 9, 5, [30, 44, 50]);
    o.ellipse(23, 21, 8, 6, [36, 52, 58]);
    o.rect(5, 5, 22, 1, alpha([255, 255, 255], 60));
  });
});
// 89 compartment door: a wood-veneer sliding door with a small window, a number plate and a card reader
drawTile(89, (g, { obj }) => {
  wallFront(g, 89);
  g.rect(0, 22, T, 2, TRAIN_PANEL);
  obj((o) => {
    o.box(6, 2, 20, 28, [176, 128, 84], 1.2);
    o.rect(9, 5, 14, 9, [150, 176, 196]);
    o.rect(9, 5, 14, 1, alpha([255, 255, 255], 120));
    o.rect(15, 5, 1, 9, [176, 128, 84]);
    o.rect(12, 17, 8, 3, [232, 226, 200]);
    o.rect(13, 18, 6, 1, [90, 80, 70]);
    o.rect(22, 15, 2, 7, [90, 90, 96]);
    o.box(27, 12, 4, 6, [60, 64, 74]);
    o.set(28, 13, [90, 230, 120]);
  });
});
// 90 dining table: a small table with a white cloth, a lamp with a red shade and two cups
drawTile(90, (g, { obj, shadow }) => {
  shadow(16, 29, 13, 2);
  obj((o) => {
    o.box(2, 12, T - 4, 13, [240, 238, 230], 1.05, 0.85);
    o.rect(2, 23, T - 4, 2, [214, 210, 198]);
    o.rect(6, 25, 2, 4, WOOD_DARK);
    o.rect(T - 8, 25, 2, 4, WOOD_DARK);
    o.rect(15, 8, 2, 8, [180, 160, 90]);
    o.ellipse(16, 7, 5, 3, [200, 60, 56]);
    o.ellipse(16, 6, 3, 1, [240, 120, 90]);
    for (const x of [7, 25]) {
      o.ellipse(x, 17, 3, 2, [250, 250, 250]);
      o.ellipse(x, 17, 2, 1, [110, 70, 44]);
    }
  });
});
// 91 speed recorder: a black box on a desk with a paper strip chart and a speed dial
drawTile(91, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    trainDesk(o);
    o.box(4, 4, 24, 14, [44, 46, 54], 1.4);
    o.ellipse(10, 10, 4.5, 4.5, [236, 236, 228]);
    o.rect(10, 7, 1, 4, [200, 40, 40]);
    o.rect(17, 6, 9, 9, [244, 242, 230]);
    let y = 12;
    for (let x = 17; x < 26; x++) {
      y = [12, 11, 9, 8, 8, 13, 13, 9, 8][x - 17];
      o.set(x, y, [40, 80, 200]);
    }
  });
});
// 92 door control panel: a grey panel on a desk with a train outline and a row of door lights
drawTile(92, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    trainDesk(o);
    o.box(3, 3, 26, 15, [126, 132, 144], 1.2);
    o.rect(5, 8, 22, 4, [210, 214, 220]);
    for (let x = 5; x < 27; x += 4) o.rect(x, 8, 1, 4, [90, 96, 108]);
    for (let i = 0; i < 6; i++) o.rect(6 + i * 4, 14, 2, 2, i === 2 ? [240, 70, 60] : [90, 220, 110]);
    o.rect(6, 5, 5, 1, [60, 64, 74]);
  });
});
// 93 train radio: a desk with a radio set, a coiled handset cable and a red emergency button
drawTile(93, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    trainDesk(o);
    o.box(4, 6, 18, 12, [62, 70, 64], 1.3);
    o.rect(6, 8, 9, 4, [120, 220, 160]);
    o.rect(7, 9, 5, 1, [40, 90, 60]);
    for (const x of [7, 11, 15, 19]) o.ellipse(x, 15, 1.5, 1.5, [200, 200, 190]);
    o.rect(18, 2, 1, 5, [40, 40, 44]);
    o.box(23, 8, 6, 9, [36, 36, 40], 1.3);
    for (let y = 18; y < 23; y += 2) o.rect(24, y, 4, 1, [36, 36, 40]);
    o.ellipse(25, 21, 3, 2, [214, 50, 46]);
  });
});
// 94 conductor's handheld: a ticket scanner with a lit screen and a lanyard on a small counter
drawTile(94, (g, { obj, shadow }) => {
  shadow(16, 29, 12, 2);
  obj((o) => {
    o.box(3, 14, T - 6, 14, WOOD, 1.25);
    o.rect(3, 17, T - 6, 1, WOOD_DARK);
    o.box(10, 4, 12, 14, [52, 56, 66], 1.4);
    o.rect(12, 6, 8, 6, [140, 210, 240]);
    o.rect(13, 8, 6, 1, [40, 80, 110]);
    o.rect(13, 10, 4, 1, [40, 80, 110]);
    o.rect(12, 14, 8, 2, [214, 60, 56]);
    for (let x = 22; x < 28; x++) o.set(x, 10 + Math.round(Math.sin(x) * 2), [40, 100, 200]);
    o.ellipse(8, 22, 3, 2, [250, 248, 238]);
  });
});

// --- Cinema (sql-cinema) ---------------------------------------------------------
const VELVET = [146, 30, 46];
const GOLD = [222, 182, 82];
/** A box office counter front: dark red panels under a brass-edged top. */
function cinemaCounter(o) {
  o.box(0, 14, T, 16, [110, 30, 40], 1.2);
  o.rect(0, 14, T, 2, GOLD);
  for (let x = 3; x < T; x += 10) o.box(x, 19, 7, 8, sh(VELVET, 0.85), 1.15);
}
// 95 cinema carpet: deep red with a small gold diamond pattern
drawTile(95, (g) => {
  g.rect(0, 0, T, T, [112, 24, 40]);
  g.noise(0, 0, T, T, 0.08, 95);
  const dim = alpha(GOLD, 110);
  for (const [cx, cy] of [[8, 8], [24, 24]]) {
    g.set(cx, cy - 1, dim);
    g.rect(cx - 1, cy, 3, 1, dim);
    g.set(cx, cy + 1, dim);
  }
  for (const [x, y] of [[24, 8], [8, 24]]) g.set(x, y, alpha(GOLD, 60));
});
// 96 film poster: a lit frame with a moon over a silhouette and a title band
drawTile(96, (g, { obj }) => {
  wallFront(g, 96);
  obj((o) => {
    o.box(6, 2, 20, 24, GOLD, 1.2);
    o.rect(8, 4, 16, 20, [36, 40, 86]);
    for (let j = 0; j < 12; j++) o.rect(8, 4 + j, 16, 1, alpha([120, 70, 160], 10 + j * 8));
    o.ellipse(19, 9, 3, 3, [250, 236, 180]);
    o.ellipse(12, 19, 6, 3, [20, 22, 40]);
    o.rect(11, 13, 2, 7, [20, 22, 40]);
    o.ellipse(12, 12, 2, 2, [20, 22, 40]);
    o.rect(9, 21, 14, 2, [240, 220, 140]);
    o.rect(10, 22, 4, 1, [140, 60, 50]);
    o.rect(15, 22, 6, 1, [140, 60, 50]);
  });
});
// 97 box office till: a counter with a ticket printer pushing out a strip of tickets
drawTile(97, (g, { obj }) => {
  obj((o) => {
    cinemaCounter(o);
    o.box(4, 3, 14, 12, [52, 56, 70], 1.3);
    o.rect(6, 5, 10, 3, [30, 60, 46]);
    o.rect(7, 6, 6, 1, [120, 230, 160]);
    o.rect(6, 10, 10, 2, [24, 26, 32]);
    o.box(19, 6, 10, 9, [214, 216, 222], 1.1);
    o.rect(20, 8, 8, 1, [40, 40, 48]);
    o.box(21, 1, 6, 7, [252, 236, 170], 1, 0.85);
    o.rect(21, 4, 6, 1, [200, 150, 80]);
    o.rect(22, 2, 3, 1, [160, 60, 50]);
  });
});
// 98 popcorn machine: a glass cabinet full of popcorn with a red roof, on the counter
drawTile(98, (g, { obj }) => {
  obj((o) => {
    cinemaCounter(o);
    o.box(6, 0, 20, 4, [214, 46, 46], 1.25);
    o.rect(6, 3, 20, 1, GOLD);
    o.box(7, 4, 18, 11, [200, 220, 230], 1.1);
    const r = rng(98);
    for (let i = 0; i < 40; i++) o.set(8 + Math.floor(r() * 16), 8 + Math.floor(r() * 6), r() < 0.5 ? [255, 246, 214] : [246, 214, 120]);
    o.rect(8, 5, 2, 9, alpha([255, 255, 255], 90));
    o.box(26, 8, 4, 6, [250, 250, 250]);
    o.rect(26, 9, 4, 1, [214, 46, 46]);
    o.rect(26, 11, 4, 1, [214, 46, 46]);
  });
});
// 99 usher's podium: a small lectern with a tablet and a spike of torn ticket stubs
drawTile(99, (g, { obj, shadow }) => {
  shadow(16, 29, 9, 2);
  obj((o) => {
    o.box(9, 13, 14, 16, VELVET, 1.2);
    o.rect(9, 13, 14, 2, GOLD);
    o.rect(11, 18, 10, 1, sh(VELVET, 0.75));
    o.box(7, 8, 18, 6, [60, 44, 36], 1.3);
    o.rect(9, 9, 8, 4, [140, 210, 240]);
    o.rect(10, 10, 5, 1, [40, 80, 110]);
    o.rect(21, 2, 1, 7, [150, 158, 172]);
    for (let y = 3; y < 8; y += 2) o.rect(19, y, 5, 1, [252, 236, 170]);
  });
});
// 100 clicker stand: a post with a digital people counter and a handheld clicker on a cord
drawTile(100, (g, { obj, shadow }) => {
  shadow(16, 29, 7, 2);
  obj((o) => {
    o.rect(15, 14, 3, 14, [150, 158, 172]);
    o.box(11, 27, 11, 3, [90, 96, 108]);
    o.box(6, 3, 21, 12, [44, 46, 54], 1.4);
    o.rect(8, 5, 17, 7, [30, 8, 10]);
    for (let i = 0; i < 3; i++) o.rect(10 + i * 5, 8, 3, 1, [240, 60, 50]);
    o.rect(8, 13, 4, 1, [240, 200, 60]);
    o.box(21, 16, 6, 8, [214, 60, 56], 1.3);
    o.set(23, 18, [250, 250, 250]);
    for (let y = 15; y < 17; y++) o.set(19, y, [36, 36, 40]);
  });
});
// 101 office door: a plain wooden door with a name plate, a keypad beside it
drawTile(101, (g, { obj }) => {
  wallFront(g, 101);
  obj((o) => {
    o.box(4, 2, 18, 28, [150, 104, 66], 1.2);
    o.rect(6, 5, 14, 10, sh([150, 104, 66], 0.88));
    o.rect(6, 17, 14, 10, sh([150, 104, 66], 0.88));
    o.box(8, 8, 10, 3, GOLD, 1.2);
    o.rect(18, 17, 2, 3, GOLD);
    o.box(24, 10, 6, 9, [52, 56, 70]);
    o.rect(25, 11, 4, 2, [120, 230, 160]);
    for (let j = 0; j < 2; j++) o.rect(25, 14 + j * 2, 4, 1, [206, 210, 220]);
  });
});
// 102 hall door: a padded red leather door with brass studs and a round window
drawTile(102, (g, { obj }) => {
  wallFront(g, 102);
  obj((o) => {
    o.box(3, 1, 26, 29, [126, 24, 38], 1.15);
    for (let y = 5; y < 29; y += 6) for (let x = 6; x < 28; x += 6) o.set(x, y, GOLD);
    o.ellipse(16, 9, 5, 5, GOLD);
    o.ellipse(16, 9, 4, 4, [40, 34, 60]);
    o.rect(14, 7, 2, 2, alpha([255, 255, 255], 90));
    o.rect(7, 16, 18, 2, sh(GOLD, 0.9));
  });
});
// 103 velvet rope: two brass posts with a sagging red rope between them
drawTile(103, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    for (const x of [3, 26]) {
      o.rect(x + 1, 8, 2, 19, GOLD);
      o.ellipse(x + 2, 7, 2.5, 2.5, sh(GOLD, 1.15));
      o.box(x - 1, 26, 6, 3, sh(GOLD, 0.8));
    }
    for (let x = 6; x < 27; x++) o.rect(x, 10 + Math.round(Math.sin(((x - 6) / 20) * Math.PI) * 5), 1, 2, VELVET);
  });
});
// 104 snack counter: the counter with paper cups and a stack of cardboard trays
drawTile(104, (g, { obj }) => {
  obj((o) => {
    cinemaCounter(o);
    for (const x of [4, 10]) {
      o.box(x, 6, 5, 9, [250, 250, 250]);
      o.rect(x, 9, 5, 2, [214, 46, 46]);
      o.rect(x + 2, 3, 1, 3, [240, 200, 60]);
    }
    for (let i = 0; i < 4; i++) o.box(17, 12 - i * 2, 11, 2, [196, 160, 110], 1.1);
  });
});

// --- Station post office at night (nn-post) --------------------------------------
const NEURAL_FRAME = [40, 132, 104];
const NEURAL_GLOW = [176, 255, 214];
// 105 door in a left wall: neural networks (green), 106 the same door in a right wall
drawTile(105, (g) => sideDoor(g, NEURAL_FRAME, NEURAL_GLOW));
drawTile(106, (g) => {
  const leaf = canvas(T, T);
  sideDoor(leaf, NEURAL_FRAME, NEURAL_GLOW);
  g.paste(leaf, 0, 0, true);
});
const POST_YELLOW = [242, 196, 48];
const ENVELOPE = [246, 240, 224];
/** A small envelope with a flap line and a stamp. */
function envelope(o, x, y, w = 7, h = 5) {
  o.box(x, y, w, h, ENVELOPE, 1, 0.85);
  o.set(x + 1, y + 1, [190, 184, 170]);
  o.set(x + w - 2, y + 1, [190, 184, 170]);
  o.rect(x + 2, y + 2, w - 4, 1, [200, 194, 180]);
  o.set(x + w - 2, y + h - 2, [200, 60, 56]);
}
// 107 Iris, the letter reader: a grey-green cabinet with a round lens, a screen and a belt of letters
drawTile(107, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    const body = [104, 128, 118];
    o.box(2, 2, 28, 22, body, 1.2);
    o.rect(2, 2, 28, 3, POST_YELLOW);
    o.rect(2, 4, 28, 1, sh(POST_YELLOW, 0.8));
    o.ellipse(10, 13, 5, 5, [44, 48, 56]);
    o.ellipse(10, 13, 3.5, 3.5, [60, 150, 200]);
    o.ellipse(10, 13, 1.5, 1.5, [20, 30, 50]);
    o.set(9, 11, [220, 240, 255]);
    o.box(17, 8, 10, 7, [30, 40, 36], 1.4);
    for (let i = 0; i < 3; i++) o.rect(19 + i * 3, 11, 2, 2, SCREEN);
    o.rect(18, 17, 9, 2, [44, 48, 56]);
    o.box(0, 24, T, 5, [70, 74, 84], 1.3);
    for (let x = 2; x < T; x += 4) o.set(x, 26, [40, 42, 48]);
    envelope(o, 3, 21, 8, 4);
    envelope(o, 20, 21, 8, 4);
  });
});
// 108 pigeonhole rack: wooden sorting shelves on the wall, some holes holding letters
drawTile(108, (g, { obj }) => {
  wallFront(g, 108);
  obj((o) => {
    o.box(2, 2, 28, 24, WOOD, 1.2);
    const r = rng(108);
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 4; i++) {
        const x = 4 + i * 6.5;
        const y = 4 + j * 7;
        o.rect(Math.round(x), y, 5, 6, [60, 40, 26]);
        if (r() < 0.6) o.rect(Math.round(x), y + 2, 5, 4, r() < 0.3 ? [214, 196, 150] : ENVELOPE);
      }
  });
});
// 109 envelope scanner on a desk: a flat grey scanner with a red scan line and a letter going in
drawTile(109, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    deskBase(o);
    o.box(3, 6, 26, 8, [176, 182, 192], 1.15);
    o.rect(5, 8, 22, 3, [40, 44, 52]);
    o.rect(5, 9, 22, 1, [240, 60, 60]);
    o.rect(5, 10, 22, 1, alpha([240, 60, 60], 100));
    envelope(o, 12, 2, 9, 6);
    o.rect(24, 12, 3, 1, SCREEN);
  });
});
// 110 blueprint on the wall: a blue sheet with a network of circles and lines
drawTile(110, (g, { obj }) => {
  wallFront(g, 110);
  obj((o) => {
    const blue = [44, 86, 160];
    o.box(3, 2, 26, 22, blue, 1.15);
    const ink = [214, 230, 250];
    const cols = [[7, [6, 10, 14, 18]], [16, [8, 13, 18]], [25, [10, 16]]];
    for (let c = 0; c < cols.length - 1; c++)
      for (const y1 of cols[c][1])
        for (const y2 of cols[c + 1][1]) {
          const [x1, x2] = [cols[c][0], cols[c + 1][0]];
          for (let x = x1; x <= x2; x++) o.set(x, Math.round(y1 + ((y2 - y1) * (x - x1)) / (x2 - x1)), alpha(ink, 90));
        }
    for (const [x, ys] of cols) for (const y of ys) o.ellipse(x, y, 1.6, 1.6, ink);
    o.rect(5, 21, 10, 1, ink);
    o.rect(3, 2, 26, 1, [250, 250, 250]);
  });
});
// 111 departure board: a black board with yellow lines of departures and a small clock
drawTile(111, (g, { obj }) => {
  wallFront(g, 111);
  obj((o) => {
    o.box(2, 4, 28, 18, [30, 32, 38], 1.3);
    o.rect(2, 4, 28, 3, [60, 64, 74]);
    for (let j = 0; j < 4; j++) {
      const y = 9 + j * 3;
      o.rect(4, y, 5, 1, j === 0 ? [255, 214, 80] : [214, 176, 70]);
      o.rect(11, y, 12 - ((j * 5) % 7), 1, j === 0 ? [255, 214, 80] : [214, 176, 70]);
      o.rect(25, y, 3, 1, [214, 176, 70]);
    }
    o.ellipse(16, 3, 3, 3, [240, 240, 236]);
    o.rect(16, 1, 1, 2, [30, 32, 38]);
    o.rect(16, 3, 2, 1, [30, 32, 38]);
  });
});

// --- Lobby side walls ---------------------------------------------------------------
/** Draws `draw` on its own tile, then turns it a quarter: 'ccw' puts its bottom edge on the right, 'cw' on the left. */
function turned(draw, dir) {
  return (g) => {
    const src = canvas(T, T);
    draw(src);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const p = src.get(x, y);
        if (dir === 'ccw') g.set(y, T - 1 - x, p);
        else g.set(T - 1 - y, x, p);
      }
  };
}
// The lobby's side walls are its top wall turned a quarter, the room side always towards the floor.
// 112 wall top in a left wall, 113 in a right wall; 114 wall front in a left wall, 115 in a right wall
drawTile(112, turned(wallTop, 'ccw'));
drawTile(113, turned(wallTop, 'cw'));
drawTile(114, turned(wallFront, 'ccw'));
drawTile(115, turned(wallFront, 'cw'));

// --- Lobby lounge and bar ------------------------------------------------------------
/**
 * Draws a piece several tiles big on one canvas and slices it into the tiles of `grid`
 * (rows of tile indices), so outlines and shading run across the seams.
 */
function drawPiece(grid, draw) {
  const W = grid[0].length * T;
  const H = grid.length * T;
  const ground = canvas(W, H);
  const obj = (fn, outline = true) => {
    const layer = canvas(W, H);
    fn(layer);
    if (outline) layer.outline();
    ground.paste(layer);
  };
  const shadow = (cx, cy, rx, ry) => ground.ellipse(cx, cy, rx, ry, [0, 0, 0, 60]);
  draw(ground, { obj, shadow });
  grid.forEach((row, r) =>
    row.forEach((index, c) => {
      const tile = canvas(T, T);
      tile.paste(ground, -c * T, -r * T);
      tiles.paste(tile, (index % TILESET_COLUMNS) * T, Math.floor(index / TILESET_COLUMNS) * T);
    }),
  );
}
const SOFA = [178, 92, 62];
const CUSHION = [236, 200, 112];
const BRASS = [212, 170, 80];
const BAR_WOOD = [92, 54, 34];

// 116-117 sofa facing down (left, right half): back at the top, two seat cushions, a pillow
drawPiece([[116, 117]], (g, { obj, shadow }) => {
  shadow(32, 29, 30, 3);
  obj((o) => {
    o.box(3, 3, 58, 12, sh(SOFA, 0.85), 1.2);
    o.rect(32, 5, 1, 9, sh(SOFA, 0.65));
    o.box(8, 13, 24, 10, SOFA, 1.2);
    o.box(32, 13, 24, 10, SOFA, 1.2);
    o.rect(3, 22, 58, 5, sh(SOFA, 0.7));
    o.box(1, 8, 8, 19, sh(SOFA, 0.95), 1.25);
    o.box(55, 8, 8, 19, sh(SOFA, 0.95), 1.25);
    o.box(11, 7, 8, 8, CUSHION, 1.15);
    o.rect(4, 27, 2, 2, WOOD_DARK);
    o.rect(58, 27, 2, 2, WOOD_DARK);
  });
});
// 118-119 sofa facing up, seen from behind: the backrest in front, the seat behind it
drawPiece([[118, 119]], (g, { obj, shadow }) => {
  shadow(32, 29, 30, 3);
  obj((o) => {
    o.box(1, 4, 8, 20, sh(SOFA, 0.95), 1.25);
    o.box(55, 4, 8, 20, sh(SOFA, 0.95), 1.25);
    o.box(9, 5, 46, 9, SOFA, 1.2);
    o.rect(32, 6, 1, 7, sh(SOFA, 0.7));
    o.box(45, 3, 7, 6, CUSHION, 1.15);
    o.box(2, 12, 60, 15, sh(SOFA, 0.82), 1.3);
    o.rect(2, 16, 60, 1, sh(SOFA, 0.7));
    o.rect(4, 27, 2, 2, WOOD_DARK);
    o.rect(58, 27, 2, 2, WOOD_DARK);
  });
});
/** An armchair facing right: backrest on the left, armrests above and below the seat. */
function armchairSide(g) {
  g.ellipse(16, 29, 13, 3, [0, 0, 0, 60]);
  const o = canvas(T, T);
  o.box(6, 4, 22, 7, sh(SOFA, 0.95), 1.25);
  o.box(9, 9, 18, 13, SOFA, 1.2);
  o.box(3, 3, 8, 23, sh(SOFA, 0.82), 1.25);
  o.box(6, 19, 22, 8, sh(SOFA, 0.95), 1.25);
  o.rect(7, 27, 2, 2, WOOD_DARK);
  o.rect(24, 27, 2, 2, WOOD_DARK);
  o.outline();
  g.paste(o);
}
// 120 armchair facing right, 121 facing left
drawTile(120, armchairSide);
drawTile(121, (g) => {
  const c = canvas(T, T);
  armchairSide(c);
  g.paste(c, 0, 0, true);
});
// 122-123 coffee table: a low wooden table with two mugs, a magazine and a small plant
drawPiece([[122, 123]], (g, { obj, shadow }) => {
  shadow(32, 28, 28, 3);
  obj((o) => {
    o.box(4, 9, 56, 13, WOOD, 1.25);
    o.rect(4, 21, 56, 3, WOOD_DARK);
    o.rect(7, 24, 3, 4, WOOD_DARK);
    o.rect(54, 24, 3, 4, WOOD_DARK);
  });
  obj((o) => {
    o.box(11, 11, 5, 6, [240, 236, 228], 1, 0.85);
    o.rect(12, 11, 3, 1, [90, 56, 36]);
    o.rect(16, 13, 1, 2, [240, 236, 228]);
    o.box(47, 13, 5, 6, [70, 150, 160], 1.2);
    o.rect(48, 13, 3, 1, [90, 56, 36]);
    o.box(35, 10, 6, 5, [190, 110, 70]);
    o.ellipse(38, 9, 4, 3, [70, 150, 80]);
    o.set(37, 8, [120, 200, 120]);
  });
  paper(g, 22, 12, 10, 8, [236, 222, 200]);
  g.rect(22, 12, 10, 2, [200, 70, 70]);
});
// 124-127 back bar: a tall cabinet of bottles on two shelves, a neon BAR sign in the third tile
drawPiece([[124, 125, 126, 127]], (g, { obj, shadow }) => {
  shadow(64, 30, 62, 2);
  const r = rng(124);
  const glass = [[90, 160, 90], [170, 110, 50], [200, 200, 210], [140, 50, 60], [70, 110, 170], [220, 180, 90]];
  obj((o) => {
    o.box(0, 1, 128, 28, WOOD_DARK, 1.3);
    o.rect(3, 4, 122, 22, [64, 56, 70]);
    for (const y of [14, 25]) {
      o.rect(3, y, 122, 2, WOOD);
      o.rect(3, y, 122, 1, sh(WOOD, 1.25));
    }
    for (let tile = 0; tile < 4; tile++)
      for (const bottom of [14, 25]) {
        if (tile === 2 && bottom === 14) continue;
        for (const dx of [4, 9, 14, 19, 24]) {
          const x = tile * T + dx;
          if (x < 4 || x > 121) continue;
          const h = 6 + Math.floor(r() * 3);
          const col = glass[Math.floor(r() * glass.length)];
          o.rect(x, bottom - h + 2, 3, h - 2, col);
          o.rect(x + 1, bottom - h, 1, 2, sh(col, 0.7));
          o.set(x, bottom - h + 2, sh(col, 1.4));
          o.rect(x, bottom - 3, 3, 1, [240, 236, 220]);
        }
      }
    // neon sign
    o.rect(67, 5, 26, 8, [30, 20, 36]);
    const neon = [255, 110, 190];
    const letters = { B: ['110', '101', '110', '101', '110'], A: ['010', '101', '111', '101', '101'], R: ['110', '101', '110', '101', '101'] };
    ['B', 'A', 'R'].forEach((ch, i) =>
      letters[ch].forEach((row, y) => [...row].forEach((bit, x) => bit === '1' && o.set(71 + i * 7 + x, 6 + y + 1, neon))),
    );
  });
  g.ellipse(80, 10, 16, 6, [255, 110, 190, 40]);
});
// 128-131 bar counter: a polished top over a panelled front with a brass foot rail;
// taps on the second tile, glasses and a bowl of lemons on the third
drawPiece([[128, 129, 130, 131]], (g, { obj, shadow }) => {
  shadow(64, 30, 63, 2);
  obj((o) => {
    o.box(0, 9, 128, 6, BAR_WOOD, 1.4);
    o.box(1, 15, 126, 13, WOOD_DARK, 1.1);
    for (let x = 9; x < 128; x += 16) o.rect(x, 16, 1, 9, sh(WOOD_DARK, 0.75));
    o.rect(1, 24, 126, 2, BRASS);
    o.rect(1, 24, 126, 1, sh(BRASS, 1.3));
    o.rect(1, 27, 126, 2, sh(WOOD_DARK, 0.6));
  });
  obj((o) => {
    // taps
    o.box(41, 3, 14, 3, METAL, 1.3);
    o.rect(43, 6, 2, 5, METAL);
    o.rect(47, 6, 2, 5, METAL);
    o.rect(51, 6, 2, 5, METAL);
    o.rect(43, 0, 2, 3, [200, 60, 60]);
    o.rect(47, 0, 2, 3, [240, 200, 80]);
    o.rect(51, 0, 2, 3, [60, 120, 200]);
    o.box(57, 4, 5, 8, [230, 170, 60], 1.3);
    o.rect(57, 4, 5, 2, [250, 246, 236]);
    // glasses and lemons
    for (const x of [70, 76]) {
      o.rect(x, 4, 5, 3, alpha([220, 236, 240], 220));
      o.rect(x + 2, 7, 1, 3, [220, 236, 240]);
      o.rect(x + 1, 10, 3, 1, [220, 236, 240]);
      o.rect(x + 1, 5, 3, 1, [240, 120, 150]);
    }
    o.ellipse(88, 9, 6, 3, [230, 230, 236]);
    for (const [x, y] of [[85, 7], [89, 6], [91, 8]]) o.ellipse(x, y, 2, 1.5, [250, 220, 60]);
    // menu card and a bowl of nuts
    o.box(10, 2, 7, 9, [250, 246, 230], 1, 0.85);
    o.rect(11, 4, 5, 1, [150, 60, 60]);
    o.rect(11, 6, 4, 1, [130, 130, 145]);
    o.rect(11, 8, 5, 1, [130, 130, 145]);
    o.ellipse(112, 10, 5, 2.5, [200, 200, 210]);
    o.ellipse(112, 9, 3.5, 1.5, [190, 140, 80]);
  });
});
// 132 bar stool: a red leather seat on a chrome pole
drawTile(132, (g, { obj, shadow }) => {
  shadow(16, 29, 7, 2);
  obj((o) => {
    o.ellipse(16, 27, 6, 2, sh(METAL, 0.7));
    o.rect(15, 15, 2, 12, METAL);
    o.rect(11, 22, 10, 1, METAL);
    o.ellipse(16, 13, 8, 4.5, [178, 48, 56]);
    o.ellipse(14, 12, 4, 2, [214, 90, 96]);
  });
});
// 133 bistro table: a round marble top on a black stand, with a cup and a little vase
drawTile(133, (g, { obj, shadow }) => {
  shadow(16, 29, 10, 2.5);
  obj((o) => {
    o.ellipse(16, 27, 7, 2, [50, 50, 56]);
    o.rect(15, 16, 2, 11, [50, 50, 56]);
    o.ellipse(16, 13, 13, 7, [232, 228, 220]);
    o.ellipse(13, 11, 6, 3, [244, 242, 236]);
    o.box(9, 10, 4, 4, [240, 236, 228], 1, 0.85);
    o.rect(10, 10, 2, 1, [90, 56, 36]);
    o.rect(20, 6, 3, 6, [120, 170, 200]);
    o.ellipse(21.5, 5, 2.5, 2, [240, 90, 120]);
  });
});
// 134 floor lamp: a cream shade on a black pole, with a warm glow
drawTile(134, (g, { obj, shadow }) => {
  g.ellipse(16, 11, 15, 11, [255, 220, 140, 45]);
  shadow(16, 29, 6, 2);
  obj((o) => {
    o.ellipse(16, 27, 5, 2, [50, 50, 56]);
    o.rect(15, 12, 2, 15, [50, 50, 56]);
    for (let j = 0; j < 9; j++) o.rect(11 - Math.floor(j / 2), 3 + j, 10 + 2 * Math.floor(j / 2), 1, sh([244, 226, 180], 1.05 - j * 0.03));
  });
});
/** A wall lamp: a brass backplate with an arm holding a frosted glass shade, washing the wall in warm light. */
function wallLamp(g) {
  wallFront(g, 135);
  for (let j = 0; j < 13; j++) {
    const w = 8 + j * 1.6;
    g.rect(Math.round(16 - w / 2), 13 - j, Math.round(w), 1, [255, 206, 110, Math.round(150 - j * 10)]);
  }
  for (let j = 0; j < 4; j++) g.rect(12 - j, 20 + j, 8 + 2 * j, 1, [255, 206, 110, 90 - j * 20]);
  const o = canvas(T, T);
  o.box(13, 16, 6, 9, BRASS, 1.3);
  o.rect(15, 19, 2, 2, sh(BRASS, 0.7));
  o.rect(15, 14, 2, 3, BRASS);
  o.box(10, 9, 12, 6, [252, 240, 206], 1.05, 0.85);
  o.rect(10, 9, 12, 1, [255, 252, 236]);
  o.rect(11, 14, 10, 1, BRASS);
  o.outline();
  g.paste(o);
}
// 135 wall lamp
drawTile(135, wallLamp);
// 136-137 entrance in the bottom wall: glass sliding doors seen from above, between wall posts
drawPiece([[136, 137]], (g) => {
  g.rect(0, 0, 64, T, [84, 88, 98]);
  for (let y = 2; y < T; y += 3) g.rect(4, y, 56, 1, [70, 72, 82]);
  const post = canvas(T, T);
  wallTop(post);
  g.paste(post, -26, 0);
  g.paste(post, 58, 0);
  g.rect(6, 13, 52, 5, METAL);
  g.rect(7, 14, 24, 3, [170, 220, 236]);
  g.rect(33, 14, 24, 3, [170, 220, 236]);
  g.rect(9, 14, 6, 1, [230, 250, 255]);
  g.rect(35, 14, 6, 1, [230, 250, 255]);
});
// 138-139 doormat: a coir mat with a red border, laid over the floor (an overlay, not collidable)
drawPiece([[138, 139]], (g) => {
  const coir = [176, 128, 78];
  g.rect(2, 5, 60, 22, [150, 44, 58]);
  g.rect(5, 8, 54, 16, coir);
  g.noise(5, 8, 54, 16, 0.18, 138);
  for (let x = 9; x < 56; x += 6) g.rect(x, 12, 3, 8, sh(coir, 0.85));
});
// 140 wall lamp in a left wall, 141 in a right wall (turned like the side walls)
drawTile(140, turned(wallLamp, 'ccw'));
drawTile(141, turned(wallLamp, 'cw'));
/** An inner wall running down the room, seen from above: a wall top with an edge on both sides. */
function dividerTop(g) {
  g.rect(0, 0, T, T, WALL_TOP);
  g.noise(0, 0, T, T, 0.08, 142);
  g.rect(0, 0, 2, T, sh(WALL_TOP, 0.75));
  g.rect(T - 2, 0, 2, T, sh(WALL_TOP, 0.75));
  g.rect(2, 0, 1, T, sh(WALL_TOP, 1.2));
}
// 142 inner wall running down the room
drawTile(142, dividerTop);
// 143 the end of such a wall above an opening: its front face shows at the bottom
drawTile(143, (g) => {
  dividerTop(g);
  const face = canvas(T, T);
  wallFront(face, 143);
  for (let y = 18; y < T; y++) for (let x = 0; x < T; x++) g.set(x, y, face.get(x, y - 18 + 16));
  g.rect(0, 18, T, 1, sh(WALL, 0.72));
});
/**
 * One rug tile. `sides` lists the edges ('n', 'e', 's', 'w') where the rug ends and gets a border:
 * a dark rim, a band of `border` and a thin inner line. `corners` lists inside corners ('nw', ...)
 * where two strips of rug meet, so the borders of a rug of any shape join up.
 */
function rugTile(index, base, border, sides, corners = []) {
  drawTile(index, (g) => {
    g.rect(0, 0, T, T, base);
    g.noise(0, 0, T, T, 0.07, 140);
    for (let y = 0; y < T; y += 2) g.rect(0, y, T, 1, alpha(sh(base, 0.9), 70));
    const has = (side) => sides.includes(side);
    const bands = [[0, 2, sh(base, 0.7)], [5, 2, border], [9, 1, alpha(border, 120)]];
    for (const [i, w, col] of bands) {
      const from = (side) => (has(side) ? i : 0);
      if (has('n')) g.rect(from('w'), i, T - from('w') - from('e'), w, col);
      if (has('s')) g.rect(from('w'), T - i - w, T - from('w') - from('e'), w, col);
      if (has('w')) g.rect(i, from('n'), w, T - from('n') - from('s'), col);
      if (has('e')) g.rect(T - i - w, from('n'), w, T - from('n') - from('s'), col);
      for (const c of corners) {
        const x = c.includes('w') ? i : T - i - w;
        const y = c.includes('n') ? i : T - i - w;
        g.rect(x, c.includes('n') ? 0 : y, w, c.includes('n') ? i + w : T - y, col);
        g.rect(c.includes('w') ? 0 : x, y, c.includes('w') ? i + w : T - x, w, col);
      }
    }
  });
}
const RUNNER = [124, 38, 50];
const RUNNER_BORDER = [206, 166, 84];
const LOUNGE = [66, 68, 76];
const LOUNGE_BORDER = [160, 146, 120];
const SIDES = ['n', 'e', 's', 'w'];
// 144-159 runner, one tile per set of bordered sides (bit 1 n, 2 e, 4 s, 8 w);
// 160-163 runner with no border and an inside corner nw, ne, sw, se
for (let mask = 0; mask < 16; mask++) rugTile(144 + mask, RUNNER, RUNNER_BORDER, SIDES.filter((_, b) => mask & (1 << b)));
['nw', 'ne', 'sw', 'se'].forEach((c, i) => rugTile(160 + i, RUNNER, RUNNER_BORDER, [], [c]));
// 164-172 lounge rug, nine tiles row by row: corners, edges and centre
[['n', 'w'], ['n'], ['n', 'e'], ['w'], [], ['e'], ['s', 'w'], ['s'], ['s', 'e']].forEach((sides, i) =>
  rugTile(164 + i, LOUNGE, LOUNGE_BORDER, sides),
);

// --- Museum restoration lab (nn-tablets) ---------------------------------------------
const CLAY = [182, 116, 74];
const INK_BROWN = [92, 56, 34];
/** A small clay tablet seen from above, with a few pressed signs. */
function tablet(o, x, y, w, h, seed) {
  o.box(x, y, w, h, CLAY, 1.15, 0.75);
  const r = rng(seed);
  for (let j = y + 2; j < y + h - 1; j += 3)
    for (let i = x + 2; i < x + w - 2; i += 3) if (r() < 0.6) o.rect(i, j, 2, 1, sh(CLAY, 0.7));
}
// 173 light table: a lit white table top with a clay tablet, and a lamp on an arm shining at it from the side
drawTile(173, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    const glow = [238, 244, 236];
    o.box(1, 13, T - 2, 10, glow, 1.05, 0.85);
    o.rect(1, 15, T - 2, 1, [214, 222, 214]);
    o.rect(3, 23, 3, 7, METAL);
    o.rect(T - 6, 23, 3, 7, METAL);
    tablet(o, 10, 8, 13, 9, 173);
    o.rect(3, 2, 2, 13, METAL);
    o.rect(3, 2, 8, 2, METAL);
    o.box(9, 2, 5, 4, [60, 64, 74], 1.3);
  });
  for (let j = 0; j < 7; j++) g.rect(11 + j, 6 + j, 6 - Math.floor(j / 2), 1, [255, 236, 170, 70]);
});
// 174 seal case: a glass case on a pedestal, holding a stone cylinder seal and the clay strip it rolled out
drawTile(174, (g, { obj, shadow }) => {
  shadow(16, 29, 11, 2);
  obj((o) => {
    o.box(7, 17, 18, 12, WOOD, 1.2);
    o.rect(9, 20, 14, 1, sh(WOOD, 0.8));
    o.box(4, 3, 24, 15, [200, 226, 236], 1.2, 0.8);
    o.rect(5, 4, 22, 13, [170, 206, 220]);
    o.rect(5, 4, 22, 1, [236, 248, 252]);
    o.box(8, 9, 7, 5, [128, 132, 138], 1.3);
    o.rect(9, 10, 5, 1, [100, 104, 110]);
    o.box(16, 10, 9, 4, CLAY, 1.15);
    for (let i = 17; i < 24; i += 2) o.set(i, 11, sh(CLAY, 0.65));
    o.rect(6, 5, 2, 6, [236, 248, 252, 140]);
  });
});
// 175 jar cabinet: a tall locked display case of dark wood and glass with a terracotta jar inside and a keypad
drawTile(175, (g, { obj, shadow }) => {
  shadow(16, 30, 12, 2);
  obj((o) => {
    o.box(5, 1, 22, 29, WOOD_DARK, 1.3);
    o.rect(7, 3, 18, 22, [150, 186, 196]);
    o.rect(7, 3, 18, 1, [214, 236, 242]);
    o.ellipse(16, 17, 6, 6.5, [176, 98, 56]);
    o.ellipse(15, 15, 3, 3, [204, 128, 80]);
    o.rect(13, 8, 6, 4, [160, 88, 50]);
    o.box(12, 6, 8, 3, [190, 120, 76], 1.2);
    for (let i = 12; i < 21; i += 3) o.rect(i, 18, 2, 1, [110, 60, 36]);
    o.rect(7, 25, 18, 3, sh(WOOD_DARK, 1.2));
    o.box(22, 14, 4, 5, [44, 48, 56], 1.3);
    o.set(23, 15, SCREEN);
    o.rect(8, 4, 2, 9, [236, 248, 252, 120]);
  });
});
// 176 tablet shelf on the wall: two wooden boards with clay tablets standing and lying on them
drawTile(176, (g, { obj }) => {
  wallFront(g, 176);
  obj((o) => {
    const r = rng(176);
    for (const y of [11, 22]) {
      o.box(2, y, 28, 3, WOOD, 1.25);
      for (let x = 4; x < 27; ) {
        const w = 3 + Math.floor(r() * 4);
        const h = 4 + Math.floor(r() * 4);
        if (x + w > 28) break;
        o.box(x, y - h, w, h, sh(CLAY, 0.85 + r() * 0.3), 1.2, 0.75);
        x += w + 1;
      }
    }
  });
});
// 177 laser scanner on a bench: a steel gantry over a clay tablet, drawing a red line across it, and a small screen
drawTile(177, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    benchBase(o);
    tablet(o, 9, 8, 12, 7, 177);
    o.rect(5, 1, 2, 13, METAL);
    o.rect(23, 1, 2, 13, METAL);
    o.box(4, 1, 22, 3, [120, 128, 142], 1.3);
    o.box(13, 3, 4, 3, [60, 64, 74], 1.3);
    o.rect(15, 6, 1, 4, [255, 70, 60, 150]);
    o.rect(9, 10, 12, 1, [255, 70, 60]);
    o.box(26, 6, 5, 6, [40, 44, 52], 1.3);
    o.rect(27, 8, 3, 2, SCREEN);
  });
});
// 178 packing crate: a pale wooden crate with slats, a stencilled arrow and a white shipping label
drawTile(178, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    const pine = [196, 158, 104];
    o.box(2, 6, 28, 22, pine, 1.15, 0.75);
    o.noise(2, 6, 28, 22, 0.1, 178);
    for (const y of [12, 19]) o.rect(3, y, 26, 1, sh(pine, 0.8));
    o.rect(2, 6, 3, 22, sh(pine, 0.88));
    o.rect(27, 6, 3, 22, sh(pine, 0.88));
    o.box(8, 14, 12, 8, [246, 244, 236], 1, 0.85);
    for (let j = 16; j < 21; j += 2) o.rect(10, j, 8 - ((j * 3) % 4), 1, [130, 130, 145]);
    o.rect(23, 9, 1, 4, [60, 52, 44]);
    o.rect(22, 10, 3, 1, [60, 52, 44]);
  });
});
// 179 numeral chart: a parchment poster on the wall with tall bars, circles and wedges in brown ink
drawTile(179, (g, { obj }) => {
  wallFront(g, 179);
  obj((o) => {
    o.box(4, 2, 24, 21, [234, 216, 172], 1.05, 0.85);
    o.rect(6, 4, 20, 1, INK_BROWN);
    o.rect(8, 7, 2, 8, INK_BROWN);
    o.rect(12, 7, 2, 8, INK_BROWN);
    for (const [x, y] of [[18, 9], [23, 9]]) {
      o.ellipse(x, y, 2.2, 2.2, INK_BROWN);
      o.ellipse(x, y, 1, 1, [234, 216, 172]);
    }
    for (const x of [8, 13, 18, 23]) for (let j = 0; j < 3; j++) o.rect(x - 2 + j, 17 + j, 5 - 2 * j, 1, INK_BROWN);
  });
});
// 180 museum label: a dark plaque with lines of white text, slanted on a short steel post
drawTile(180, (g, { obj, shadow }) => {
  shadow(16, 29, 7, 2);
  obj((o) => {
    o.rect(15, 15, 2, 13, METAL);
    o.box(11, 27, 10, 2, sh(METAL, 0.8));
    o.box(6, 6, 20, 10, [44, 48, 58], 1.4);
    o.rect(8, 8, 9, 1, [236, 236, 230]);
    for (let j = 10; j < 15; j += 2) o.rect(8, j, 16 - ((j * 5) % 6), 1, [170, 174, 186]);
  });
});

// --- Seed bank in the old salt mine (ml-seeds) --------------------------------------------
const ML_FRAME = [176, 52, 74];
const ML_GLOW = [255, 170, 186];
/** A side door in a map's left wall, and the same door mirrored for a right wall. */
function sideDoorPair(left, right, frame, glow) {
  drawTile(left, (g) => sideDoor(g, frame, glow));
  drawTile(right, (g) => {
    const leaf = canvas(T, T);
    sideDoor(leaf, frame, glow);
    g.paste(leaf, 0, 0, true);
  });
}
// 181 door in a left wall: SQL (amber, like tile 6), 182 the same door in a right wall
sideDoorPair(181, 182, [168, 108, 36], [255, 200, 100]);
const STEEL = [168, 176, 186];
const KRAFT = [204, 170, 120];
const SEED_COLOURS = [[196, 160, 92], [120, 84, 52], [222, 206, 150], [96, 128, 70], [178, 110, 70]];
/** A heap of small seeds in an oval, each seed two pixels in one of the seed colours. */
function seeds(o, cx, cy, rx, ry, seed) {
  const r = rng(seed);
  for (let i = 0; i < rx * ry * 1.6; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r());
    const c = SEED_COLOURS[Math.floor(r() * SEED_COLOURS.length)];
    o.rect(Math.round(cx + Math.cos(a) * d * rx), Math.round(cy + Math.sin(a) * d * ry), 2, 1, c);
  }
}
// 183 seed cabinet: a tall steel cabinet of small drawers, some pulled out with brown envelopes, one soaked label
drawTile(183, (g, { obj, shadow }) => {
  shadow(16, 30, 13, 2);
  obj((o) => {
    o.box(3, 1, 26, 29, STEEL, 1.15, 0.8);
    const r = rng(183);
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 3; col++) {
        const x = 5 + col * 8;
        const y = 3 + row * 4;
        o.box(x, y, 7, 3, sh(STEEL, 0.92), 1.1);
        o.rect(x + 2, y + 1, 3, 1, r() < 0.2 ? [150, 170, 200] : [246, 244, 236]);
      }
    o.box(13, 11, 7, 4, sh(STEEL, 1.05), 1.2);
    o.rect(14, 9, 2, 3, KRAFT);
    o.rect(17, 9, 2, 3, sh(KRAFT, 0.9));
    o.rect(3, 27, 26, 3, sh(STEEL, 0.7));
  });
});
// 184 sorting machine: a funnel over a belt that feeds a row of little drawers, with a camera and a green screen
drawTile(184, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) => {
    const body = [92, 112, 128];
    o.box(2, 12, 28, 17, body, 1.2);
    o.rect(2, 12, 28, 2, ML_FRAME);
    for (let i = 0; i < 4; i++) o.box(4 + i * 6, 21, 5, 6, sh(body, 1.25), 1.1);
    for (let i = 0; i < 4; i++) o.rect(5 + i * 6, 23, 3, 1, KRAFT);
    for (let j = 0; j < 8; j++) o.rect(4 + j, 2 + j, 14 - 2 * j, 1, STEEL);
    seeds(o, 11, 3, 5, 1.5, 184);
    o.rect(10, 10, 2, 3, sh(STEEL, 0.8));
    o.rect(4, 15, 15, 2, [44, 44, 50]);
    seeds(o, 11, 15, 6, 0.6, 1840);
    o.box(21, 4, 8, 7, [40, 44, 52], 1.3);
    o.rect(22, 5, 6, 4, SCREEN);
    o.rect(23, 6, 1, 2, [20, 90, 60]);
    o.rect(25, 7, 2, 1, [20, 90, 60]);
    o.ellipse(19, 15, 1.6, 1.6, [255, 80, 80]);
  });
});
// 185 seed counter: a white bench with a lit tray of sorted seeds, a small balance and a tagged envelope
drawTile(185, (g, { obj, shadow }) => {
  shadow(16, 29, 14, 2);
  obj((o) => {
    benchBase(o);
    o.box(3, 6, 15, 9, [236, 240, 232], 1.05, 0.85);
    for (let i = 0; i < 3; i++) o.rect(4 + i * 5, 7, 4, 7, sh([236, 240, 232], 0.93));
    const r = rng(185);
    [[120, 84, 52], [222, 206, 150], [96, 128, 70]].forEach((c, i) => {
      for (let n = 0; n < 7; n++) o.rect(5 + i * 5 + Math.floor(r() * 2), 8 + Math.floor(r() * 5), 2, 1, c);
    });
    o.box(20, 9, 9, 5, [60, 64, 74], 1.3);
    o.rect(21, 7, 7, 2, STEEL);
    o.rect(22, 10, 5, 2, SCREEN);
    o.box(21, 2, 7, 5, KRAFT, 1.15, 0.8);
    o.rect(26, 3, 3, 2, [246, 244, 236]);
  });
});
const SALT = [184, 170, 168];
// 186 salt-mine floor: pale pinkish rock with dark seams and glints
drawTile(186, (g) => {
  g.rect(0, 0, T, T, SALT);
  g.noise(0, 0, T, T, 0.1, 186);
  const r = rng(186);
  for (let i = 0; i < 3; i++) {
    let x = Math.floor(r() * T);
    for (let y = 0; y < T; y++) {
      if (r() < 0.3) x += r() < 0.5 ? -1 : 1;
      if (r() < 0.7) g.set(((x % T) + T) % T, y, sh(SALT, 0.86));
    }
  }
  for (let i = 0; i < 8; i++) g.set(Math.floor(r() * T), Math.floor(r() * T), [236, 230, 228]);
});
// 187 salt-mine floor with a puddle of flood water
drawTile(187, (g) => {
  g.rect(0, 0, T, T, SALT);
  g.noise(0, 0, T, T, 0.1, 187);
  g.ellipse(16, 17, 13, 9, sh(SALT, 0.8));
  g.ellipse(16, 16, 12, 8, [92, 116, 138, 220]);
  g.ellipse(13, 13, 5, 2, [150, 178, 200, 200]);
  g.rect(19, 19, 4, 1, [150, 178, 200, 180]);
});
// 188 cold store: a heavy steel door in the wall with a frosted window, a wheel handle and a keypad
drawTile(188, (g, { obj }) => {
  wallFront(g, 188);
  obj((o) => {
    o.box(4, 1, 24, 26, [150, 166, 182], 1.2, 0.8);
    o.box(9, 4, 14, 7, [214, 236, 246], 1.05);
    for (let i = 0; i < 6; i++) o.set(10 + i * 2, 5 + (i % 3), [255, 255, 255]);
    o.ellipse(16, 18, 4.5, 4.5, [96, 104, 116]);
    o.ellipse(16, 18, 2.5, 2.5, [150, 166, 182]);
    o.rect(11, 18, 10, 1, [96, 104, 116]);
    o.rect(16, 13, 1, 10, [96, 104, 116]);
    o.box(24, 13, 3, 5, [44, 48, 56], 1.3);
    o.set(25, 14, SCREEN);
  });
  for (let x = 4; x < 28; x += 3) g.set(x, 27, [226, 240, 250]);
});
// 189 shelf of seed jars on the wall: glass jars with seeds of different colours and paper labels
drawTile(189, (g, { obj }) => {
  wallFront(g, 189);
  obj((o) => {
    for (const y of [12, 23]) {
      o.box(2, y, 28, 3, WOOD, 1.25);
      for (let i = 0; i < 4; i++) {
        const c = SEED_COLOURS[(i + (y > 12 ? 2 : 0)) % SEED_COLOURS.length];
        o.box(4 + i * 7, y - 8, 5, 8, [200, 222, 228], 1.1, 0.8);
        o.rect(5 + i * 7, y - 5, 3, 4, c);
        o.rect(4 + i * 7, y - 9, 5, 1, sh(METAL, 0.9));
        o.rect(5 + i * 7, y - 6, 3, 1, [246, 244, 236]);
      }
    }
  });
});
// 190 field map on the wall: a farmers' map with six coloured fields and red pins
drawTile(190, (g, { obj }) => {
  wallFront(g, 190);
  obj((o) => {
    o.box(3, 3, 26, 19, [236, 230, 204], 1.05, 0.85);
    const fields = [[120, 160, 80], [206, 184, 96], [150, 124, 84], [98, 140, 96], [214, 200, 140], [132, 168, 110]];
    fields.forEach((c, i) => o.rect(5 + (i % 3) * 8, 5 + Math.floor(i / 3) * 8, 7, 7, c));
    for (let i = 0; i < 6; i++) o.set(7 + (i % 3) * 8, 7 + Math.floor(i / 3) * 8, [214, 48, 48]);
  });
});

// --- Doors after the lobby's reorder: SQL and time series in the side walls, machine learning and neural networks in the top wall
// 191 door in a left wall: time series (ice blue, like tile 43), 192 the same door in a right wall
sideDoorPair(191, 192, [120, 172, 204], [196, 242, 255]);
// 193 door: machine learning (crimson), 194 door: neural networks (green)
drawTile(193, (g) => door(g, ML_FRAME, ML_GLOW));
drawTile(194, (g) => door(g, NEURAL_FRAME, NEURAL_GLOW));

// --- Customs office on Pier 9 at night (ml-customs) -----------------------------------------
const CONTAINER = [178, 64, 50];
const HAZARD = [236, 190, 40];
// 195 shipping container: a rust-red corrugated box with its doors, locking bars and a white number
drawTile(195, (g, { obj, shadow }) => {
  shadow(16, 30, 15, 2);
  obj((o) => {
    o.box(1, 3, 30, 26, CONTAINER, 1.2, 0.7);
    for (let x = 3; x < 30; x += 3) o.rect(x, 5, 1, 22, sh(CONTAINER, 0.82));
    o.rect(15, 4, 1, 24, sh(CONTAINER, 0.6));
    for (const x of [8, 22]) {
      o.rect(x, 4, 2, 24, sh(METAL, 0.85));
      o.rect(x - 1, 15, 4, 2, sh(METAL, 0.7));
    }
    o.rect(3, 6, 4, 2, [240, 240, 236]);
    o.rect(3, 9, 3, 1, [240, 240, 236]);
    o.rect(1, 3, 30, 1, sh(CONTAINER, 1.35));
  });
});
// 196 X-ray gate: a grey arch striped yellow and black, with a dead screen and a red light
drawTile(196, (g, { obj, shadow }) => {
  shadow(16, 30, 15, 2);
  obj((o) => {
    const grey = [112, 118, 130];
    o.box(1, 2, 7, 27, grey, 1.2);
    o.box(24, 2, 7, 27, grey, 1.2);
    o.box(1, 2, 30, 7, grey, 1.2);
    for (let x = 1; x < 31; x += 4) o.rect(x, 7, 2, 2, HAZARD);
    for (let x = 3; x < 31; x += 4) o.rect(x, 7, 2, 2, [30, 30, 34]);
    o.rect(8, 9, 16, 20, [36, 40, 50, 180]);
    o.box(10, 3, 12, 4, [30, 34, 40], 1.3);
    o.rect(11, 4, 10, 2, [54, 60, 72]);
    o.ellipse(4.5, 12, 1.6, 1.6, [230, 60, 50]);
  });
});
// 197 harbour window at night: a pane with a dark sea, a crane against the sky and the lights of a ship
drawTile(197, (g, { obj }) => {
  wallFront(g, 197);
  obj((o) => {
    o.box(3, 3, 26, 20, [70, 78, 96], 1.2);
    o.rect(5, 5, 22, 16, [22, 30, 54]);
    o.rect(5, 15, 22, 6, [16, 36, 56]);
    for (let x = 6; x < 27; x += 3) o.set(x, 17 + (x % 2), [70, 110, 150]);
    o.rect(9, 7, 1, 9, [240, 150, 40]);
    o.rect(9, 7, 13, 1, [240, 150, 40]);
    o.rect(19, 8, 1, 3, [200, 200, 210]);
    o.rect(14, 13, 12, 2, [44, 48, 60]);
    [16, 19, 22].forEach((x) => o.set(x, 13, [255, 230, 140]));
    o.set(24, 6, [255, 255, 255]);
    o.set(7, 8, [255, 255, 255]);
    o.rect(15, 5, 1, 16, [70, 78, 96]);
  });
});
// 198 odds board on the wall: a black board of glowing percentages and a big dial with a red needle
drawTile(198, (g, { obj }) => {
  wallFront(g, 198);
  obj((o) => {
    o.box(2, 2, 28, 22, [34, 36, 44], 1.4);
    const r = rng(198);
    for (let j = 0; j < 5; j++) {
      const w = 3 + Math.floor(r() * 6);
      o.rect(4, 4 + j * 4, 3, 2, [200, 200, 210]);
      o.rect(8, 4 + j * 4, w, 2, j === 1 ? [240, 80, 70] : HAZARD);
    }
    o.ellipse(23, 13, 5.5, 5.5, [226, 222, 210]);
    o.ellipse(23, 13, 4.5, 4.5, [246, 244, 236]);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.9 + i * 0.3);
      o.set(Math.round(23 + Math.cos(a) * 4), Math.round(13 + Math.sin(a) * 4), [60, 60, 70]);
    }
    for (let k = 0; k < 4; k++) o.set(23 - k, 13 - Math.round(k * 0.6), [210, 40, 40]);
    o.set(23, 13, [40, 40, 50]);
  });
});
// 199 XR-90 poster: a glossy advert with a big "93 %" in a starburst over a stylised scanner
drawTile(199, (g, { obj }) => {
  wallFront(g, 199);
  obj((o) => {
    o.box(5, 2, 22, 23, [240, 240, 246], 1.05, 0.85);
    o.rect(5, 2, 22, 4, [40, 96, 180]);
    o.rect(7, 3, 10, 1, [230, 236, 250]);
    o.ellipse(16, 12, 7, 5, HAZARD);
    // "93" in pixel digits
    const nine = ['111', '101', '111', '001', '111'];
    const three = ['111', '001', '111', '001', '111'];
    [nine, three].forEach((d, n) => d.forEach((row, y) => [...row].forEach((c, x) => c === '1' && o.set(11 + n * 4 + x, 10 + y, [180, 40, 40]))));
    [[19, 10], [22, 10], [21, 11], [21, 12], [20, 13], [20, 14], [22, 14]].forEach(([x, y]) => o.set(x, y, [180, 40, 40]));
    o.box(9, 18, 14, 5, [112, 118, 130], 1.2);
    o.rect(13, 19, 6, 3, [36, 40, 50]);
  });
});

// --- Auction house Vossberg & Daughters at night (ml-auction) ----------------------------------
const BAIZE = [40, 70, 60];
const MAHOGANY = [112, 52, 36];
/** A small wristwatch seen from above: a round case on a strap. */
function watch(o, x, y, face = [240, 236, 222], strap = [70, 44, 30]) {
  o.rect(x - 1, y - 4, 3, 9, strap);
  o.ellipse(x + 0.5, y + 0.5, 2.5, 2.5, BRASS);
  o.ellipse(x + 0.5, y + 0.5, 1.6, 1.6, face);
  o.set(x, y, [40, 40, 50]);
}
// 200 watch display case: a glass counter on a mahogany base with watches on green velvet
drawTile(200, (g, { obj, shadow }) => {
  shadow(16, 30, 15, 2);
  obj((o) => {
    o.box(1, 16, 30, 13, MAHOGANY, 1.3);
    o.rect(3, 19, 26, 1, sh(MAHOGANY, 0.8));
    o.box(2, 6, 28, 11, BAIZE, 1.2);
    watch(o, 7, 11);
    watch(o, 16, 11, [24, 30, 44]);
    watch(o, 25, 11, [240, 236, 222], [30, 30, 36]);
    o.rect(2, 4, 28, 13, [200, 230, 240, 70]);
    o.rect(2, 4, 28, 1, [230, 246, 252]);
    o.rect(4, 6, 1, 9, [255, 255, 255, 150]);
    o.rect(14, 23, 4, 2, BRASS);
  });
});
// 201 auction rostrum: a carved mahogany lectern with a brass plate, a gavel on its block and a microphone
drawTile(201, (g, { obj, shadow }) => {
  shadow(16, 30, 13, 2);
  obj((o) => {
    o.box(3, 10, 26, 19, MAHOGANY, 1.3);
    o.rect(3, 13, 26, 1, sh(MAHOGANY, 0.75));
    o.box(10, 17, 12, 5, BRASS, 1.3);
    o.rect(12, 19, 8, 1, sh(BRASS, 0.6));
    o.box(1, 7, 30, 4, sh(MAHOGANY, 1.2), 1.3);
    o.box(19, 4, 6, 3, sh(WOOD_DARK, 0.9), 1.3);
    o.box(17, 1, 4, 4, WOOD, 1.3);
    o.rect(21, 2, 6, 1, WOOD);
    o.rect(8, 2, 1, 6, [50, 50, 56]);
    o.ellipse(8.5, 2, 1.5, 1.5, [30, 30, 34]);
  });
});
// 202 Albers's graph paper on the wall: a clip frame of pale squared paper with crosses and a ruled line
drawTile(202, (g, { obj }) => {
  wallFront(g, 202);
  obj((o) => {
    o.box(4, 3, 24, 21, [236, 230, 196], 1.02, 0.85);
    for (let x = 6; x < 27; x += 3) o.rect(x, 4, 1, 19, [190, 214, 200]);
    for (let y = 5; y < 23; y += 3) o.rect(5, y, 22, 1, [190, 214, 200]);
    o.rect(6, 5, 1, 17, [60, 60, 70]);
    o.rect(6, 21, 20, 1, [60, 60, 70]);
    for (let i = 0; i < 18; i++) o.set(7 + i, Math.round(19 - i * 0.7), [50, 50, 120]);
    [[9, 16], [12, 17], [14, 13], [17, 14], [20, 10], [22, 12], [24, 8]].forEach(([x, y]) => {
      o.set(x, y, [140, 50, 50]);
      o.set(x - 1, y - 1, [140, 50, 50]);
      o.set(x + 1, y + 1, [140, 50, 50]);
      o.set(x + 1, y - 1, [140, 50, 50]);
      o.set(x - 1, y + 1, [140, 50, 50]);
    });
    o.ellipse(22, 6, 3, 1.5, [150, 140, 120, 150]);
    o.rect(14, 2, 4, 2, METAL);
  });
});
// 203 price histogram on the wall: a white sheet with a tall hump of blue bars on the left and a thin tail to the right
drawTile(203, (g, { obj }) => {
  wallFront(g, 203);
  obj((o) => {
    o.box(3, 3, 26, 21, [246, 246, 240], 1.02, 0.85);
    const bars = [6, 14, 16, 12, 9, 6, 4, 3, 2, 2, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1];
    bars.forEach((h, i) => h && o.rect(5 + i, 20 - h, 1, h, i % 2 ? [70, 110, 180] : [90, 130, 200]));
    o.rect(5, 20, 22, 1, [60, 60, 70]);
    o.rect(5, 5, 8, 1, [130, 130, 145]);
    o.rect(16, 22, 9, 1, [60, 90, 150]);
  });
});
// 204 watchmaker's bench: a green-topped workbench with a loupe on a stand, an open watch, tweezers and a lamp
drawTile(204, (g, { obj, shadow }) => {
  shadow(16, 30, 14, 2);
  obj((o) => {
    o.box(1, 13, 30, 10, WOOD, 1.25);
    o.rect(2, 13, 28, 3, [70, 110, 90]);
    o.rect(3, 23, 3, 7, sh(WOOD, 0.7));
    o.rect(26, 23, 3, 7, sh(WOOD, 0.7));
    o.box(10, 17, 12, 4, sh(WOOD, 0.85), 1.2);
    o.rect(15, 18, 2, 1, BRASS);
    o.rect(5, 4, 1, 10, [50, 50, 56]);
    o.rect(5, 4, 8, 1, [50, 50, 56]);
    o.box(10, 4, 6, 3, [60, 110, 80], 1.3);
    o.rect(11, 7, 4, 2, [255, 240, 170, 120]);
    o.ellipse(20, 12, 3, 2, BRASS);
    o.ellipse(20, 12, 2, 1.2, [180, 160, 110]);
    o.set(19, 12, [120, 90, 50]);
    o.set(21, 11, [120, 90, 50]);
    o.rect(24, 11, 4, 1, METAL);
    o.ellipse(27, 8, 2.5, 2.5, [30, 30, 34]);
    o.ellipse(27, 8, 1.5, 1.5, [150, 190, 210]);
    o.rect(27, 10, 1, 4, [30, 30, 34]);
  });
});
// 205 proof press: a dark green printing press with a big wheel, a sheet on its bed and a stack of catalogues
drawTile(205, (g, { obj, shadow }) => {
  shadow(16, 30, 15, 2);
  obj((o) => {
    const green = [44, 76, 64];
    o.box(2, 12, 28, 16, green, 1.3);
    o.rect(4, 28, 3, 2, sh(green, 0.6));
    o.rect(25, 28, 3, 2, sh(green, 0.6));
    o.box(4, 9, 18, 4, [180, 180, 186], 1.2);
    o.rect(6, 9, 13, 3, [250, 248, 238]);
    for (let x = 7; x < 18; x += 2) o.rect(x, 10, 1, 1, [130, 130, 145]);
    o.ellipse(25, 8, 5, 5, sh(METAL, 0.7));
    o.ellipse(25, 8, 3.5, 3.5, green);
    o.rect(24, 3, 2, 10, sh(METAL, 0.6));
    o.rect(20, 7, 10, 2, sh(METAL, 0.6));
    o.box(6, 17, 10, 6, [170, 40, 44], 1.2);
    o.rect(6, 19, 10, 1, [240, 230, 210]);
    o.rect(8, 18, 6, 1, BRASS);
  });
});
// 206 bidder's chair: a gilt saleroom chair with a red seat and a numbered paddle on it (a seat, not collidable)
drawTile(206, (g, { obj, shadow }) => {
  shadow(16, 29, 9, 2);
  obj((o) => {
    o.box(9, 4, 14, 10, BRASS, 1.3);
    o.box(11, 6, 10, 6, [168, 40, 50], 1.2);
    o.box(8, 14, 16, 8, [178, 48, 56], 1.25);
    o.rect(9, 22, 2, 7, BRASS);
    o.rect(21, 22, 2, 7, BRASS);
    o.ellipse(17, 17, 3.5, 2.5, [246, 244, 236]);
    o.rect(17, 19, 1, 4, WOOD);
    o.rect(16, 16, 2, 2, [40, 40, 50]);
  });
});
// 207 case clock: a tall mahogany longcase clock with a white face near six o'clock and a brass pendulum
drawTile(207, (g, { obj, shadow }) => {
  shadow(16, 30, 9, 2);
  obj((o) => {
    o.box(9, 1, 14, 29, MAHOGANY, 1.3);
    o.box(8, 1, 16, 3, sh(MAHOGANY, 1.2), 1.3);
    o.ellipse(16, 9, 5, 5, BRASS);
    o.ellipse(16, 9, 4, 4, [246, 242, 228]);
    o.rect(16, 6, 1, 4, [30, 30, 34]);
    o.rect(16, 9, 1, 4, [30, 30, 34]);
    o.rect(11, 16, 10, 11, sh(MAHOGANY, 0.6));
    o.rect(16, 16, 1, 7, sh(BRASS, 0.8));
    o.ellipse(16.5, 23.5, 2.5, 2.5, BRASS);
    o.rect(12, 17, 1, 9, [255, 255, 255, 60]);
    o.rect(20, 7, 5, 4, [250, 248, 238]);
  });
});

// Solid tiles among 0-207: walls and furniture. Floors, doors, rugs and seats stay walkable.
// Tiles from 208 on call solid() next to their own drawing.
solid(
  ...range(2, 3), ...range(7, 13), ...range(15, 35), 37, ...range(39, 41), ...range(45, 53), ...range(57, 65),
  ...range(67, 81), ...range(83, 86), ...range(88, 94), ...range(96, 104), ...range(107, 115), ...range(122, 131),
  ...range(133, 137), ...range(140, 143), ...range(173, 180), ...range(183, 185), ...range(188, 190), ...range(195, 205), 207,
);

// --- Room restyles ---------------------------------------------------------------------------
// One block of 32 tiles per room, so rooms can be restyled side by side without clashing indices.
const ROOM_BLOCKS = [
  'python-lab', 'sql-hotel', 'sql-cinema', 'sql-train', 'pandas-market', 'ts-nordlys', 'ts-festival', 'python-docs',
  'python-debug', 'stats-fair', 'stats-ab', 'nn-post', 'nn-tablets', 'ml-seeds', 'ml-customs', 'ml-auction',
];
/** The first tile index of a room's block. */
const blockOf = (roomId) => 208 + 32 * ROOM_BLOCKS.indexOf(roomId);

/** Copies tile `src` (already drawn) onto a fresh canvas, for reuse in new tiles. */
function tileCanvas(src) {
  const c = canvas(T, T);
  c.paste(tiles, -(src % TILESET_COLUMNS) * T, -Math.floor(src / TILESET_COLUMNS) * T);
  return c;
}
/**
 * Draws tile `index` as wall-mounted tile `src` hung on a different wall: every pixel of `src` that is
 * still the plain plaster of wallFront(seed) becomes the matching pixel of `wall`.
 */
function onWall(index, src, wall, seed = 3) {
  drawTile(index, (g) => {
    const from = tileCanvas(src);
    const plaster = canvas(T, T);
    wallFront(plaster, seed);
    const bg = canvas(T, T);
    wall(bg);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const p = from.get(x, y);
        const q = plaster.get(x, y);
        g.set(x, y, p.every((v, i) => v === q[i]) ? bg.get(x, y) : p);
      }
  });
  solid(index);
}

// --- python-lab restyle (tiles 208-239) ---
// Quarantine: a mycology lab sealed by its own alarm. A hazard-striped airlock with the exit, Ida's
// wood-floored office, a dark grow room of glowing mushroom beds with her escape vent, the white
// wet lab and a frosted cold room.
{
  const B = blockOf('python-lab');
  const TILE_WHITE = [226, 232, 234];
  const TEAL = [72, 150, 146];
  const GLOW = [120, 255, 170];
  const RUBBER = [44, 50, 54];
  const FROST = [206, 224, 238];
  const STEEL = [176, 184, 196];
  /** The lab's wall face: white ceramic tiles above a teal skirting band. */
  const labWall = (g) => {
    g.rect(0, 0, T, T, TILE_WHITE);
    g.noise(0, 0, T, T, 0.04, B);
    g.rect(0, 0, T, 2, sh(TILE_WHITE, 0.7));
    for (let y = 2; y < T - 6; y += 8) g.rect(0, y, T, 1, sh(TILE_WHITE, 0.86));
    for (let y = 2, r = 0; y < T - 6; y += 8, r++) for (let x = r % 2 ? 4 : 12; x < T; x += 16) g.rect(x, y, 1, 8, sh(TILE_WHITE, 0.86));
    g.rect(0, T - 6, T, 6, TEAL);
    g.rect(0, T - 6, T, 1, sh(TEAL, 1.3));
    g.rect(0, T - 1, T, 1, sh(TEAL, 0.7));
  };
  // B+0 lab wall front
  drawTile(B, labWall);
  // B+1 grow-room floor: dark rubber matting with a raised dot pattern
  drawTile(B + 1, (g) => {
    g.rect(0, 0, T, T, RUBBER);
    g.noise(0, 0, T, T, 0.1, B + 1);
    for (let y = 2; y < T; y += 6) for (let x = (y / 6) % 2 ? 5 : 2; x < T; x += 6) { g.set(x, y, sh(RUBBER, 1.35)); g.set(x + 1, y + 1, sh(RUBBER, 0.7)); }
    g.rect(0, 0, T, 1, sh(RUBBER, 0.75));
  });
  // B+2 cold-room floor: frosted diamond plate
  drawTile(B + 2, (g) => {
    g.rect(0, 0, T, T, FROST);
    g.noise(0, 0, T, T, 0.05, B + 2);
    for (let y = 0; y < T; y += 8)
      for (let x = (y / 8) % 2 ? 4 : 0; x < T; x += 8) {
        g.rect(x + 1, y + 3, 4, 1, sh(FROST, 0.82));
        g.rect(x + 2, y + 2, 2, 1, sh(FROST, 1.1));
      }
    for (const [x, y] of [[6, 5], [21, 12], [13, 25], [27, 28], [3, 19]]) g.set(x, y, [255, 255, 255]);
    g.rect(0, 0, T, 1, sh(FROST, 0.85));
    g.rect(0, 0, 1, T, sh(FROST, 0.85));
  });
  // B+3 hazard stripes on the floor (decor): yellow and black, a little worn
  drawTile(B + 3, (g) => {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) g.set(x, y, (x + y) % 12 < 6 ? [232, 190, 40, 235] : [36, 34, 38, 235]);
    g.noise(0, 0, T, T, 0.12, B + 3);
    const r = rng(B + 3);
    for (let i = 0; i < 22; i++) g.set(Math.floor(r() * T), Math.floor(r() * T), [190, 196, 200, 120]);
  });
  // B+4 vent grille lying on the floor where Ida dropped it (decor)
  drawTile(B + 4, (g) => {
    g.ellipse(17, 24, 12, 4, [0, 0, 0, 50]);
    const o = canvas(T, T);
    o.box(5, 10, 22, 14, [92, 98, 112]);
    for (let y = 12; y < 23; y += 3) o.rect(7, y, 18, 1, [52, 56, 66]);
    for (const [x, y] of [[6, 11], [25, 11], [6, 22], [25, 22]]) o.set(x, y, [190, 196, 206]);
    o.outline();
    // turned a little, as if it fell
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const p = o.get(x, y); if (p[3]) g.set(x + Math.round((y - 16) * 0.15), y, p); }
  });
  // B+5 red alarm beacon on the lab wall, flashing
  drawTile(B + 5, (g) => {
    labWall(g);
    for (let j = 0; j < 11; j++) g.rect(Math.round(16 - (6 + j * 1.4)), 12 - j, Math.round(12 + j * 2.8), 1, [255, 60, 50, Math.round(120 - j * 10)]);
    for (let j = 0; j < 6; j++) g.rect(10 - j, 20 + j, 12 + 2 * j, 1, [255, 60, 50, 80 - j * 12]);
    const o = canvas(T, T);
    o.box(11, 17, 10, 4, [70, 74, 84]);
    o.ellipse(16, 13, 5, 5.5, [220, 40, 36]);
    o.rect(12, 10, 8, 1, [255, 140, 120]);
    o.rect(13, 11, 2, 4, [255, 200, 180]);
    o.outline();
    g.paste(o);
  });
  // B+6 the open vent Ida climbed out of: a dark shaft in the lab wall, screw holes and scuffs
  drawTile(B + 6, (g) => {
    labWall(g);
    const o = canvas(T, T);
    o.box(4, 4, 24, 20, [70, 74, 88]);
    o.rect(6, 6, 20, 16, [14, 16, 20]);
    for (let j = 0; j < 8; j++) o.rect(6, 6 + j, 20, 1, [40, 44, 52, 255 - j * 28]);
    o.rect(6, 18, 20, 4, [22, 24, 30]);
    for (const [x, y] of [[5, 5], [26, 5], [5, 22], [26, 22]]) o.set(x, y, [24, 24, 28]);
    o.outline();
    g.paste(o);
    for (const [x, y] of [[9, 25], [12, 24], [20, 25], [23, 24], [15, 26]]) g.rect(x, y, 2, 1, alpha(GLOW, 200));
  });
  // B+7 ventilation control: a steel panel with three fan dials and a CO2 readout
  drawTile(B + 7, (g) => {
    labWall(g);
    const o = canvas(T, T);
    o.box(3, 3, 26, 21, STEEL, 1.15);
    o.rect(5, 5, 22, 6, [20, 30, 34]);
    o.rect(6, 7, 9, 2, [255, 120, 80]);
    o.rect(17, 7, 4, 2, [120, 230, 160]);
    for (let i = 0; i < 3; i++) {
      const cx = 9 + i * 7;
      o.ellipse(cx, 17, 3, 3, [60, 64, 76]);
      o.ellipse(cx, 17, 2, 2, [210, 214, 222]);
      o.rect(cx, 15, 1, 2, [220, 50, 50]);
    }
    o.rect(5, 21, 22, 1, [232, 190, 40]);
    o.outline();
    g.paste(o);
  });
  solid(B, B + 5, B + 6, B + 7);
  // B+8, B+9 mushroom grow bed: a soil tray on legs, crowded with glowing caps
  drawPiece([[B + 8, B + 9]], (g, { obj, shadow }) => {
    shadow(32, 29, 30, 3);
    for (let j = 0; j < 6; j++) g.ellipse(32, 14, 30 + j, 11 + j, alpha(GLOW, 14));
    obj((o) => {
      o.box(2, 7, 60, 17, [96, 100, 112], 1.2);
      o.rect(4, 9, 56, 13, [52, 36, 26]);
      o.noise(4, 9, 56, 13, 0.3, B + 8);
      o.rect(5, 24, 3, 6, [96, 100, 112]);
      o.rect(56, 24, 3, 6, [96, 100, 112]);
    });
    // caps in two rows, back row first so the front ones overlap it
    const r = rng(B + 9);
    for (const row of [12, 18])
      for (let x = 8; x < 58; x += 7) {
        const cx = x + Math.floor(r() * 3);
        const cap = r() < 0.7 ? [140, 250, 180] : [120, 214, 255];
        const big = r() < 0.5;
        g.ellipse(cx + 0.5, row, 6, 4, alpha(cap, 45));
        g.rect(cx, row, 2, 4, [226, 228, 206]);
        g.ellipse(cx + 1, row, big ? 3.5 : 2.5, big ? 2.5 : 2, sh(cap, 0.7));
        g.ellipse(cx + 1, row - 0.5, big ? 3 : 2, big ? 1.8 : 1.4, cap);
        g.set(cx, row - 1, [240, 255, 245]);
      }
  });
  // B+10 glow on the floor next to the beds (decor)
  drawTile(B + 10, (g) => {
    for (let j = 0; j < 8; j++) g.ellipse(16, 16, 16 - j * 2, 14 - j * 1.6, alpha(GLOW, 10));
  });
  // B+11 fume hood: a steel cabinet with a raised glass sash and a lit interior
  drawTile(B + 11, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(2, 0, 28, 30, STEEL, 1.15);
      o.rect(4, 3, 24, 14, [250, 236, 170]);
      for (let j = 0; j < 14; j++) o.rect(4, 3 + j, 24, 1, alpha([255, 250, 220], 60 + j * 8));
      o.rect(4, 3, 24, 1, [255, 255, 240]);
      o.box(9, 11, 5, 6, [196, 232, 240], 1.05);
      o.rect(10, 13, 3, 3, [230, 130, 200]);
      o.rect(4, 16, 24, 2, [140, 148, 160]);
      o.rect(5, 18, 22, 1, [200, 230, 240]);
      o.rect(4, 20, 24, 8, sh(STEEL, 0.9));
      o.rect(14, 23, 4, 1, [90, 96, 108]);
      o.rect(24, 21, 3, 2, [120, 230, 160]);
    });
  });
  // B+12 emergency shower and eyewash: a green sign, a pull handle and a grated basin
  drawTile(B + 12, (g, { obj }) => {
    obj((o) => {
      o.rect(15, 2, 2, 22, [200, 206, 214]);
      o.ellipse(16, 4, 7, 3, [62, 170, 96]);
      o.ellipse(16, 3, 5, 1.5, [120, 220, 150]);
      o.rect(22, 6, 1, 10, [232, 190, 40]);
      o.box(20, 15, 5, 3, [232, 190, 40]);
      o.box(5, 18, 22, 10, [62, 170, 96], 1.2);
      o.rect(8, 20, 16, 6, [200, 206, 214]);
      for (let x = 10; x < 23; x += 3) o.rect(x, 21, 1, 4, [130, 136, 148]);
    });
  });
  // B+13 biohazard bin: a yellow pedal bin with the trefoil and a red bag peeking out
  drawTile(B + 13, (g, { obj, shadow }) => {
    shadow(16, 29, 9, 2);
    obj((o) => {
      o.box(8, 10, 16, 18, [232, 190, 40], 1.2);
      o.box(7, 7, 18, 4, [214, 170, 30], 1.2);
      o.rect(10, 6, 5, 2, [200, 50, 50]);
      o.ellipse(16, 19, 4, 4, [36, 34, 38]);
      o.ellipse(16, 19, 2, 2, [232, 190, 40]);
      o.set(16, 15, [232, 190, 40]);
      o.set(13, 21, [232, 190, 40]);
      o.set(19, 21, [232, 190, 40]);
      o.rect(10, 28, 4, 1, [60, 60, 66]);
    });
  });
  // B+14 spill (decor): a broken jar and a puddle of glowing spores
  drawTile(B + 14, (g) => {
    g.ellipse(16, 19, 12, 6, alpha(GLOW, 70));
    g.ellipse(14, 18, 8, 4, alpha(GLOW, 120));
    g.ellipse(13, 17, 3, 1.5, alpha([230, 255, 240], 160));
    const o = canvas(T, T);
    o.rect(20, 12, 4, 3, [200, 228, 236]);
    o.rect(9, 22, 3, 2, [200, 228, 236]);
    o.rect(24, 21, 2, 2, [200, 228, 236]);
    o.rect(17, 14, 3, 2, [150, 110, 80]);
    o.outline([60, 80, 70]);
    g.paste(o);
    for (const [x, y] of [[6, 14], [27, 17], [19, 25], [8, 24]]) g.set(x, y, GLOW);
  });
  // B+15 lab stool (a seat, not solid)
  drawTile(B + 15, (g, { obj, shadow }) => {
    shadow(16, 28, 7, 2);
    obj((o) => {
      o.rect(15, 18, 2, 9, [130, 136, 148]);
      o.rect(11, 26, 10, 1, [130, 136, 148]);
      o.ellipse(16, 16, 7, 4, [60, 64, 76]);
      o.ellipse(16, 15, 6, 2.5, [84, 90, 104]);
    });
  });
  // B+16 office chair (a seat, not solid): a black swivel chair seen from behind
  drawTile(B + 16, (g, { obj, shadow }) => {
    shadow(16, 28, 9, 2);
    obj((o) => {
      for (const dx of [-7, 0, 7]) o.rect(16 + dx, 26, 2, 2, [40, 40, 46]);
      o.rect(15, 20, 2, 6, [90, 94, 104]);
      o.box(8, 14, 16, 7, [52, 54, 64], 1.25);
      o.box(9, 3, 14, 12, [60, 62, 74], 1.25);
      o.rect(11, 5, 10, 1, [86, 90, 104]);
    });
  });
  // B+17 biohazard sign on the lab wall
  drawTile(B + 17, (g) => {
    labWall(g);
    const o = canvas(T, T);
    for (let j = 0; j < 17; j++) o.rect(16 - Math.floor(j * 0.62), 4 + j, 1 + 2 * Math.floor(j * 0.62), 1, [232, 190, 40]);
    o.ellipse(16, 14.5, 3.5, 3.5, [36, 34, 38]);
    o.ellipse(16, 14.5, 1.5, 1.5, [232, 190, 40]);
    o.rect(15, 9, 2, 3, [36, 34, 38]);
    o.rect(11, 17, 3, 2, [36, 34, 38]);
    o.rect(18, 17, 3, 2, [36, 34, 38]);
    o.outline();
    g.paste(o);
  });
  // B+18 cold-room sign on the lab wall: a blue plate with a snowflake and -20 °C
  drawTile(B + 18, (g) => {
    labWall(g);
    const o = canvas(T, T);
    o.box(5, 5, 22, 16, [52, 110, 190], 1.2);
    for (let i = -4; i <= 4; i++) {
      o.set(11 + i, 12, [255, 255, 255]);
      o.set(11, 12 + i, [255, 255, 255]);
      if (Math.abs(i) < 4) { o.set(11 + i, 12 + i, [255, 255, 255]); o.set(11 + i, 12 - i, [255, 255, 255]); }
    }
    o.rect(17, 10, 2, 1, [255, 255, 255]);
    o.rect(20, 8, 4, 1, [255, 255, 255]);
    o.rect(20, 8, 1, 7, [255, 255, 255]);
    o.rect(17, 15, 7, 1, [200, 220, 255]);
    o.outline();
    g.paste(o);
  });
  // B+19 cryo rack: a steel shelf of frosted sample boxes
  drawTile(B + 19, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(2, 0, 28, 30, [150, 160, 176], 1.15);
      for (let s = 0; s < 3; s++) {
        const y = 2 + s * 9;
        o.rect(4, y, 24, 7, [60, 70, 86]);
        for (let i = 0; i < 3; i++) {
          const col = [[230, 120, 120], [120, 170, 240], [240, 220, 120]][(i + s) % 3];
          o.box(5 + i * 8, y + 2, 6, 5, col);
          o.rect(5 + i * 8, y + 2, 6, 1, [245, 250, 255]);
        }
        o.rect(4, y + 7, 24, 2, [190, 200, 214]);
      }
      for (const [x, y] of [[7, 3], [22, 12], [14, 21], [26, 4]]) o.set(x, y, [255, 255, 255]);
    });
  });
  // B+20 liquid nitrogen dewar: a squat steel flask with a vapour wisp
  drawTile(B + 20, (g, { obj, shadow }) => {
    shadow(16, 29, 10, 2);
    obj((o) => {
      o.ellipse(16, 20, 9, 9, STEEL);
      o.ellipse(14, 17, 4, 5, sh(STEEL, 1.25));
      o.rect(12, 6, 8, 6, sh(STEEL, 0.85));
      o.box(11, 4, 10, 3, [52, 110, 190]);
      o.rect(9, 22, 14, 2, [52, 110, 190]);
    });
    for (let j = 0; j < 5; j++) g.ellipse(18 + j, 2 - j * 0.3, 3, 1.5, [240, 248, 255, 70]);
  });
  // B+21 hanging lamp (above the avatars): a white enamel shade and a soft cone of light
  drawTile(B + 21, (g) => {
    for (let j = 0; j < 14; j++) g.rect(Math.round(16 - (5 + j)), 9 + j, 10 + 2 * j, 1, [255, 250, 220, Math.round(46 - j * 3)]);
    const o = canvas(T, T);
    o.rect(15, 0, 2, 3, [60, 64, 76]);
    o.ellipse(16, 7, 7, 4, [236, 240, 244]);
    o.rect(9, 7, 14, 1, [200, 206, 214]);
    o.ellipse(16, 8, 3, 1, [255, 252, 220]);
    o.outline();
    g.paste(o);
  });
  // B+22 sink bench: a white bench with a steel basin, a swan-neck tap and a soap bottle
  drawTile(B + 22, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      benchBase(o);
      o.box(7, 12, 16, 4, STEEL, 1.2);
      o.rect(9, 13, 12, 2, [110, 120, 134]);
      o.rect(19, 4, 2, 9, [200, 206, 214]);
      o.rect(15, 4, 5, 2, [200, 206, 214]);
      o.box(25, 6, 4, 7, [120, 200, 230]);
    });
  });
  // B+23 glowing footprints (decor): Ida walked through the spores on her way to the vent
  drawTile(B + 23, (g) => {
    const step = (x, y) => {
      g.ellipse(x, y, 2.5, 3.5, alpha(GLOW, 170));
      g.ellipse(x, y + 5.5, 2, 1.6, alpha(GLOW, 170));
      g.ellipse(x, y + 2, 4.5, 6, alpha(GLOW, 30));
    };
    step(10, 20);
    step(20, 8);
  });
  // B+24 stepladder below the vent
  drawTile(B + 24, (g, { obj, shadow }) => {
    shadow(16, 29, 10, 2);
    obj((o) => {
      o.rect(8, 2, 3, 27, [220, 170, 40]);
      o.rect(21, 2, 3, 27, [220, 170, 40]);
      for (let y = 7; y < 28; y += 6) o.box(9, y, 14, 3, [200, 206, 214]);
      o.box(7, 0, 18, 4, [200, 150, 30]);
    });
  });
  // B+25 window from the lab into the office: a glass pane with a desk lamp's warm light behind
  drawTile(B + 25, (g) => {
    labWall(g);
    const o = canvas(T, T);
    o.box(3, 3, 26, 20, [200, 206, 214], 1.15);
    o.rect(5, 5, 22, 16, [96, 74, 56]);
    for (let j = 0; j < 16; j++) o.rect(5, 5 + j, 22, 1, alpha([255, 214, 150], 30 + j * 5));
    o.rect(5, 16, 22, 5, [130, 92, 58]);
    o.rect(16, 5, 1, 16, [200, 206, 214]);
    for (let i = 0; i < 5; i++) o.set(7 + i, 11 - i, [255, 255, 255, 150]);
    o.outline();
    g.paste(o);
  });
  // B+26 sample trolley: a steel cart with racks of test tubes
  drawTile(B + 26, (g, { obj, shadow }) => {
    shadow(16, 29, 12, 2);
    obj((o) => {
      o.box(4, 10, 24, 4, STEEL, 1.2);
      o.box(4, 20, 24, 3, STEEL, 1.2);
      o.rect(5, 14, 2, 13, [130, 136, 148]);
      o.rect(25, 14, 2, 13, [130, 136, 148]);
      for (let i = 0; i < 6; i++) {
        o.rect(7 + i * 3, 3, 2, 8, [200, 228, 236]);
        o.rect(7 + i * 3, 7, 2, 3, [[230, 130, 200], [120, 220, 160], [255, 200, 120]][i % 3]);
      }
      o.box(6, 8, 20, 3, [60, 64, 76]);
      for (const x of [6, 25]) o.ellipse(x, 28, 2, 2, [40, 40, 46]);
    });
  });
  solid(B + 11, B + 12, B + 13, B + 17, B + 18, B + 19, B + 20, B + 22, B + 24, B + 25, B + 26);
  // B+27, B+28 lab wall front in a left wall and a right wall (turned like the lobby's side walls)
  drawTile(B + 27, turned(labWall, 'ccw'));
  drawTile(B + 28, turned(labWall, 'cw'));
  solid(B + 27, B + 28);
  // B+29 manual clipboard, B+30 air-quality poster and B+31 keypad, hung on the lab wall
  onWall(B + 29, 26, labWall);
  onWall(B + 30, 25, labWall);
  onWall(B + 31, 13, labWall);
}
// --- end python-lab ---

// --- sql-hotel restyle (tiles 240-271) ---
// --- end sql-hotel ---

// --- sql-cinema restyle (tiles 272-303) ---
// --- end sql-cinema ---

// --- sql-train restyle (tiles 304-335) ---
// --- end sql-train ---

// --- pandas-market restyle (tiles 336-367) ---
// --- end pandas-market ---

// --- ts-nordlys restyle (tiles 368-399) ---
// --- end ts-nordlys ---

// --- ts-festival restyle (tiles 400-431) ---
// --- end ts-festival ---

// --- python-docs restyle (tiles 432-463) ---
// --- end python-docs ---

// --- python-debug restyle (tiles 464-495) ---
// --- end python-debug ---

// --- stats-fair restyle (tiles 496-527) ---
// --- end stats-fair ---

// --- stats-ab restyle (tiles 528-559) ---
// --- end stats-ab ---

// --- nn-post restyle (tiles 560-591) ---
// --- end nn-post ---

// --- nn-tablets restyle (tiles 592-623) ---
// --- end nn-tablets ---

// --- ml-seeds restyle (tiles 624-655) ---
// The Seed Bank: a seed bank 80 m down in an old salt mine, flooded on level -2. A lift landing with
// the exit and a mine cart on its rails, the curator's plastered office, the sorting hall, the
// flooded archive among rock pillars with a burst pipe and a boardwalk, and the sealed cold store.
{
  const B = blockOf('ml-seeds');
  const ROCK = [204, 170, 160];
  const ROCK_BANDS = [ROCK, [226, 204, 192], [182, 148, 142], [212, 186, 178], [164, 140, 144]];
  const TIMBER = [124, 86, 52];
  const WATER = [70, 112, 140];
  const RIPPLE = [150, 192, 214];
  const IRON = [96, 92, 96];
  const BURLAP = [176, 146, 98];
  /** The mine's wall face: banded rock salt in rose, cream and grey, damp and dark at the foot. */
  const saltWall = (g) => {
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const t = y + 2.2 * Math.sin((2 * Math.PI * x) / 16) + 1.2 * Math.sin((2 * Math.PI * x) / 32 + 1);
        g.set(x, y, ROCK_BANDS[((Math.floor(t / 4) % 5) + 5) % 5]);
      }
    g.noise(0, 0, T, T, 0.1, B);
    const r = rng(B + 100);
    for (let i = 0; i < 9; i++) g.set(Math.floor(r() * T), 3 + Math.floor(r() * 20), [250, 244, 240]);
    g.rect(0, 0, T, 2, sh(ROCK, 0.6));
    g.rect(0, T - 5, T, 5, [118, 98, 100]);
    g.noise(0, T - 5, T, 5, 0.15, B + 1);
    g.rect(0, T - 5, T, 1, [146, 124, 124]);
    g.rect(0, T - 1, T, 1, [86, 70, 74]);
  };
  // B+0 salt wall front
  drawTile(B, saltWall);
  // B+1 salt wall with a timber mine set: a crossbeam along the top and a post with iron straps
  drawTile(B + 1, (g) => {
    saltWall(g);
    const o = canvas(T, T);
    o.box(0, 2, T, 6, TIMBER, 1.25, 0.7);
    o.box(11, 7, 10, 20, TIMBER, 1.2, 0.7);
    o.rect(14, 9, 1, 16, sh(TIMBER, 0.8));
    for (const y of [10, 21]) o.rect(11, y, 10, 2, IRON);
    o.noise(0, 2, T, 25, 0.12, B + 2);
    o.outline();
    g.paste(o);
  });
  // B+2, B+3 the salt wall in a left and a right wall
  drawTile(B + 2, turned(saltWall, 'ccw'));
  drawTile(B + 3, turned(saltWall, 'cw'));
  // B+4 wet salt floor: the rock floor darkened by the flood, with glossy streaks
  drawTile(B + 4, (g) => {
    const wet = [150, 132, 136];
    g.rect(0, 0, T, T, wet);
    g.noise(0, 0, T, T, 0.12, B + 4);
    const r = rng(B + 4);
    for (let i = 0; i < 4; i++) {
      const x = Math.floor(r() * 26);
      const y = Math.floor(r() * 30);
      g.rect(x, y, 4 + Math.floor(r() * 5), 1, [196, 206, 216, 150]);
    }
    for (let i = 0; i < 3; i++) {
      let x = Math.floor(r() * T);
      for (let y = 0; y < T; y++) {
        if (r() < 0.3) x += r() < 0.5 ? -1 : 1;
        if (r() < 0.7) g.set(((x % T) + T) % T, y, sh(wet, 0.82));
      }
    }
  });
  // B+5 boardwalk: planks laid across, gaps showing the water below, a nail at each end
  drawTile(B + 5, (g) => {
    g.rect(0, 0, T, T, sh(WATER, 0.6));
    for (let y = 0; y < T; y += 8) {
      const c = sh(TIMBER, 1.15 + ((y / 8) % 2) * 0.1);
      g.rect(0, y + 1, T, 6, c);
      g.rect(0, y + 1, T, 1, sh(c, 1.2));
      g.rect(0, y + 6, T, 1, sh(c, 0.75));
      for (const x of [3, 28]) g.set(x, y + 3, [70, 66, 70]);
    }
    g.noise(0, 0, T, T, 0.12, B + 5);
  });
  /** Flood water: a few ripples on a flat colour. */
  const water = (g, base, seed) => {
    g.rect(0, 0, T, T, base);
    g.noise(0, 0, T, T, 0.06, seed);
    const r = rng(seed);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(r() * 26);
      const y = 2 + Math.floor(r() * 28);
      g.rect(x, y, 5, 1, alpha(RIPPLE, 170));
      g.rect(x + 1, y - 1, 3, 1, alpha(RIPPLE, 90));
    }
  };
  // B+6 shallow flood water over the salt floor (walkable), B+7 deep water (solid)
  drawTile(B + 6, (g) => {
    water(g, [112, 140, 156], B + 6);
    const r = rng(B + 60);
    for (let i = 0; i < 10; i++) g.set(Math.floor(r() * T), Math.floor(r() * T), [172, 160, 160]);
  });
  drawTile(B + 7, (g) => water(g, WATER, B + 7));
  // B+8 mine-cart rails running down the room (decor): two steel rails on timber sleepers
  drawTile(B + 8, (g) => {
    for (let y = 2; y < T; y += 8) {
      g.rect(4, y, 24, 4, alpha(sh(TIMBER, 0.85), 235));
      g.rect(4, y, 24, 1, alpha(sh(TIMBER, 1.15), 235));
      g.rect(4, y + 4, 24, 1, [0, 0, 0, 60]);
    }
    for (const x of [8, 22]) {
      g.rect(x, 0, 3, T, [120, 122, 130]);
      g.rect(x, 0, 1, T, [196, 200, 208]);
      g.rect(x + 2, 0, 1, T, [70, 70, 78]);
    }
  });
  // B+9 mine cart on the rails, loaded with sacks of seed
  drawTile(B + 9, (g, { obj, shadow }) => {
    shadow(16, 29, 14, 2);
    obj((o) => {
      for (const x of [6, 22]) o.ellipse(x + 2, 26, 3.5, 3.5, [52, 50, 56]);
      for (const [x, y] of [[9, 9], [16, 7], [22, 10]]) {
        o.ellipse(x, y, 6, 5, BURLAP);
        o.ellipse(x - 1, y - 2, 3, 1.5, sh(BURLAP, 1.2));
        o.rect(x - 1, y - 5, 2, 2, sh(BURLAP, 0.7));
      }
      o.box(2, 12, 28, 13, [150, 84, 56], 1.2, 0.7);
      o.rect(2, 12, 28, 2, sh(IRON, 1.2));
      for (const x of [3, 15, 27]) o.rect(x, 14, 2, 10, sh([150, 84, 56], 0.75));
      o.rect(5, 18, 22, 1, sh([150, 84, 56], 0.8));
      o.rect(12, 16, 8, 3, [236, 228, 210]);
      o.rect(13, 17, 6, 1, [150, 84, 56]);
    });
  });
  // B+10 the burst pipe: a pipe down the salt wall, split open, spraying water
  drawTile(B + 10, (g) => {
    saltWall(g);
    for (let y = 4; y < T; y++) g.rect(10, y, 12, 1, [70, 90, 110, 70]);
    const o = canvas(T, T);
    o.box(13, 0, 6, 14, [150, 156, 166], 1.25, 0.75);
    o.box(13, 19, 6, 13, [150, 156, 166], 1.25, 0.75);
    o.box(11, 3, 10, 3, [120, 124, 134]);
    o.rect(13, 14, 2, 3, [150, 156, 166]);
    o.rect(17, 15, 2, 4, [150, 156, 166]);
    o.outline();
    g.paste(o);
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.36;
      for (let d = 2; d < 14; d++) g.set(16 + Math.cos(a) * d * 0.9, 16 - Math.sin(a) * d * 0.55 + (d * d) / 18, [200, 230, 250, 230 - d * 12]);
    }
    g.ellipse(16, 17, 3, 2, [240, 250, 255, 220]);
  });
  // B+11 water gushing across the floor from the pipe (decor)
  drawTile(B + 11, (g) => {
    for (let y = 0; y < T; y++) {
      const cx = 16 + Math.round(2 * Math.sin(y / 5));
      const w = 6 + Math.floor(y / 5);
      g.rect(cx - w, y, 2 * w, 1, alpha(WATER, 200));
      g.rect(cx - w + 2, y, 2, 1, alpha(RIPPLE, 200));
      if (y % 4 === 0) g.rect(cx - 2, y, 4, 1, [230, 244, 255, 220]);
    }
  });
  // B+12 archive shelving: a steel rack of seed envelopes, the bottom shelf stained by the water
  drawTile(B + 12, (g, { obj, shadow }) => {
    shadow(16, 30, 14, 2);
    obj((o) => {
      o.box(2, 0, 28, 30, [138, 146, 156], 1.15);
      const r = rng(B + 12);
      for (let s = 0; s < 3; s++) {
        const y = 2 + s * 9;
        o.rect(4, y, 24, 7, [62, 66, 76]);
        for (let x = 5; x < 27; x += 3) {
          const h = 4 + Math.floor(r() * 3);
          const c = s === 2 ? sh(KRAFT, 0.72) : r() < 0.2 ? [236, 230, 214] : KRAFT;
          o.rect(x, y + 7 - h, 2, h, c);
          o.set(x, y + 7 - h, sh(c, 1.2));
        }
        o.rect(4, y + 7, 24, 2, [176, 184, 194]);
      }
      o.rect(3, 26, 26, 4, [70, 100, 120, 120]);
    });
  });
  // B+13 a rack toppled into the deep water, envelopes spilling out of it (solid)
  drawTile(B + 13, (g, { obj }) => {
    water(g, WATER, B + 13);
    g.ellipse(16, 18, 15, 11, alpha(RIPPLE, 60));
    obj((o) => {
      o.box(1, 9, 30, 13, [138, 146, 156], 1.15);
      for (let x = 3; x < 29; x += 9) o.rect(x, 11, 7, 9, [62, 66, 76]);
      for (let x = 4; x < 28; x += 3) o.rect(x, 13 + (x % 2), 2, 5, KRAFT);
    });
    for (const [x, y] of [[4, 25], [21, 26], [26, 5], [9, 4]]) {
      const o = canvas(T, T);
      o.box(x, y, 6, 4, sh(KRAFT, 1.1), 1.1, 0.8);
      o.outline([60, 70, 80]);
      g.paste(o);
    }
  });
  // B+14 envelopes floating on the deep water, their labels washed off (solid)
  drawTile(B + 14, (g) => {
    water(g, WATER, B + 14);
    for (const [x, y, c] of [[5, 6, KRAFT], [19, 12, [236, 230, 214]], [9, 22, KRAFT], [23, 25, sh(KRAFT, 0.85)]]) {
      g.ellipse(x + 3, y + 2, 6, 4, alpha(RIPPLE, 90));
      const o = canvas(T, T);
      o.box(x, y, 7, 5, c, 1.1, 0.8);
      o.rect(x + 1, y + 1, 5, 1, sh(c, 0.85));
      o.outline([50, 66, 80]);
      g.paste(o);
    }
  });
  // B+15 sandbags: burlap sacks stacked two high against the water
  drawTile(B + 15, (g, { obj, shadow }) => {
    shadow(16, 29, 16, 2);
    obj((o) => {
      for (const [x, y] of [[0, 21], [11, 21], [22, 21], [-5, 12], [6, 12], [17, 12], [28, 12]]) {
        o.box(x, y, 10, 8, BURLAP, 1.2, 0.75);
        o.rect(x + 1, y + 3, 8, 1, sh(BURLAP, 0.85));
        o.set(x + 1, y + 1, sh(BURLAP, 1.3));
      }
    });
  });
  // B+16 a portable pump, its hose running off into the water
  drawTile(B + 16, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      o.box(4, 10, 20, 15, [214, 64, 48], 1.25, 0.7);
      o.box(6, 6, 9, 5, [60, 60, 66], 1.3);
      o.rect(17, 13, 5, 9, [60, 60, 66]);
      for (let y = 14; y < 22; y += 2) o.rect(17, y, 5, 1, [100, 100, 108]);
      o.rect(4, 25, 3, 3, [40, 40, 46]);
      o.rect(21, 25, 3, 3, [40, 40, 46]);
      o.box(24, 18, 7, 5, [36, 40, 44], 1.4);
      o.rect(7, 15, 6, 2, [240, 220, 80]);
    });
  });
  // B+17 a caged miner's lamp on the salt wall, warming the rock around it
  drawTile(B + 17, (g) => {
    saltWall(g);
    for (let j = 0; j < 12; j++) g.ellipse(16, 13, 15 - j, 13 - j, [255, 200, 120, 12]);
    const o = canvas(T, T);
    o.rect(15, 3, 2, 4, IRON);
    o.box(11, 6, 10, 3, IRON, 1.3);
    o.ellipse(16, 14, 5, 6, [255, 220, 140]);
    o.ellipse(15, 12, 2, 3, [255, 250, 220]);
    for (const x of [12, 16, 20]) o.rect(x, 8, 1, 12, sh(IRON, 0.9));
    o.rect(11, 14, 10, 1, sh(IRON, 0.9));
    o.box(11, 19, 10, 3, IRON, 1.3);
    o.outline();
    g.paste(o);
  });
  // B+18 a bare bulb on its cable, in a wire guard, with a wide pool of light (above the avatars)
  drawTile(B + 18, (g) => {
    for (let j = 0; j < 10; j++) g.ellipse(16, 20, 15 - j * 1.2, 10 - j * 0.8, [255, 214, 130, 16]);
    const o = canvas(T, T);
    o.rect(15, 0, 2, 7, [40, 38, 42]);
    o.box(13, 6, 6, 3, [60, 58, 62]);
    o.ellipse(16, 12, 4, 4.5, [255, 236, 160]);
    o.ellipse(15, 11, 1.5, 2, [255, 255, 240]);
    o.rect(12, 12, 9, 1, [70, 70, 76]);
    o.rect(16, 8, 1, 9, [70, 70, 76]);
    o.outline();
    g.paste(o);
  });
  solid(B, B + 1, B + 2, B + 3, B + 7, B + 9, B + 10, B + 12, B + 13, B + 14, B + 15, B + 16, B + 17);
  // B+19..B+21 the new sorting line: a seed hopper, a belt of envelopes under a camera arch, and a stacker
  drawPiece([[B + 19, B + 20, B + 21]], (g, { obj, shadow }) => {
    shadow(48, 29, 46, 3);
    obj((o) => {
      const body = [92, 112, 128];
      o.box(2, 16, 92, 10, body, 1.2, 0.75);
      o.rect(2, 16, 92, 2, ML_FRAME);
      for (const x of [6, 46, 86]) o.rect(x, 26, 4, 4, sh(body, 0.7));
      o.rect(20, 18, 54, 5, [44, 44, 50]);
      for (let x = 22; x < 72; x += 9) {
        o.box(x, 17, 6, 5, KRAFT, 1.15, 0.8);
        o.rect(x + 1, 18, 4, 1, [246, 244, 236]);
      }
      for (let j = 0; j < 12; j++) o.rect(4 + j, 2 + j, 18 - 2 * j, 1, STEEL);
      o.rect(12, 14, 3, 3, sh(STEEL, 0.8));
      o.box(40, 2, 3, 15, STEEL, 1.2);
      o.box(56, 2, 3, 15, STEEL, 1.2);
      o.box(38, 1, 23, 5, [40, 44, 52], 1.3);
      o.rect(48, 6, 3, 3, [40, 44, 52]);
      o.ellipse(49.5, 9, 1.5, 1.5, [255, 80, 80]);
      o.rect(41, 3, 6, 1, SCREEN);
      o.box(76, 4, 16, 12, sh(body, 1.2), 1.15);
      for (let i = 0; i < 3; i++) o.rect(78, 6 + i * 3, 12, 2, KRAFT);
    });
    seeds(g, 13, 4, 7, 1.5, B + 19);
  });
  // B+22 a cluster of salt crystals growing out of the floor
  drawTile(B + 22, (g, { obj, shadow }) => {
    shadow(16, 28, 12, 3);
    obj((o) => {
      for (const [x, y, s, c] of [[6, 14, 9, [236, 206, 206]], [16, 6, 11, [250, 232, 230]], [19, 16, 8, [222, 180, 186]], [11, 19, 7, [244, 222, 218]]]) {
        o.box(x, y, s, s, c, 1.12, 0.8);
        o.rect(x + 1, y + 1, Math.floor(s / 2), 1, [255, 255, 255]);
        o.rect(x, y + s - 3, s, 1, sh(c, 0.9));
      }
    });
  });
  // B+23..B+26 a salt pillar left standing by the miners: a column of banded rock, numbered in paint
  drawPiece([[B + 23, B + 24], [B + 25, B + 26]], (g, { obj, shadow }) => {
    shadow(32, 60, 30, 4);
    obj((o) => {
      for (let y = 6; y < 58; y++)
        for (let x = 3; x < 61; x++) {
          const t = y + 2.5 * Math.sin(x / 5) + 1.5 * Math.sin(x / 11);
          o.set(x, y, ROCK_BANDS[((Math.floor(t / 4) % 5) + 5) % 5]);
        }
      o.noise(3, 6, 58, 52, 0.12, B + 23);
      o.rect(3, 0, 58, 8, sh(ROCK, 0.45));
      o.noise(3, 0, 58, 8, 0.2, B + 24);
      o.rect(3, 8, 58, 2, sh(ROCK, 0.7));
      o.rect(3, 52, 58, 6, [118, 98, 100]);
      o.rect(58, 8, 3, 46, sh(ROCK, 0.8));
      o.rect(3, 8, 2, 46, sh(ROCK, 1.1));
      o.box(18, 24, 28, 12, [236, 232, 220], 1.05, 0.85);
      // "P 7" in red paint
      o.rect(22, 27, 2, 7, [190, 40, 40]);
      o.rect(24, 27, 4, 2, [190, 40, 40]);
      o.rect(26, 29, 2, 1, [190, 40, 40]);
      o.rect(24, 30, 3, 1, [190, 40, 40]);
      o.rect(33, 27, 8, 2, [190, 40, 40]);
      o.rect(38, 29, 2, 5, [190, 40, 40]);
      const r = rng(B + 25);
      for (let i = 0; i < 14; i++) o.set(5 + Math.floor(r() * 54), 12 + Math.floor(r() * 38), [252, 248, 244]);
    });
  });
  solid(B + 19, B + 20, B + 21, B + 22, B + 23, B + 24, B + 25, B + 26);
  // B+27 a drying line with salvaged envelopes pegged on it (above the avatars)
  drawTile(B + 27, (g) => {
    for (let x = 0; x < T; x++) g.set(x, 4 + Math.round(3 * Math.sin((Math.PI * x) / T)), [70, 60, 50]);
    const o = canvas(T, T);
    for (const [x, c] of [[3, KRAFT], [13, [236, 230, 214]], [23, sh(KRAFT, 1.08)]]) {
      const y = 5 + Math.round(3 * Math.sin((Math.PI * (x + 3)) / T));
      o.box(x, y + 1, 7, 9, c, 1.1, 0.8);
      o.rect(x + 1, y + 3, 5, 1, sh(c, 0.85));
      o.rect(x + 1, y + 8, 5, 1, [90, 120, 150, 140]);
      o.rect(x + 3, y - 1, 1, 3, [200, 60, 50]);
    }
    o.outline();
    g.paste(o);
  });
  // B+28 the cold store door, B+29 the field map, B+30 the inspection notice and B+31 the service sheet, on the salt wall
  onWall(B + 28, 188, saltWall, 188);
  onWall(B + 29, 190, saltWall, 190);
  onWall(B + 30, 9, saltWall);
  onWall(B + 31, 26, saltWall);
}
// --- end ml-seeds ---

// --- ml-customs restyle (tiles 656-687) ---
// --- end ml-customs ---

// --- ml-auction restyle (tiles 688-719) ---
// --- end ml-auction ---

// --- Avatar parts: one template row per hair style x shirt style, then one overlay row per accessory
// Columns = direction x 3 frames (idle, step, step), directions in order down, left, right, up.
// Recolourable parts are drawn in marker colours that encode a shade factor f as v = f * 100:
// hair [v, 0, 0], shirt [0, v, 0], trousers [0, 0, v], skin [v, 0, v]. The game swaps them for the
// player's colours (recolorParts in src/game/avatars.ts). Every fixed colour has all three channels
// above zero, so it can't be taken for a marker. The order of the styles must match avatars.ts.
const HAIR_STYLES = ['short', 'long', 'curly', 'ponytail', 'bun'];
const SHIRT_STYLES = ['tshirt', 'longsleeve', 'striped', 'hoodie', 'jacket'];
/** Overlays drawn over the body; 'none' needs no row. */
const ACCESSORIES = ['glasses', 'cap', 'headphones', 'goggles'];
const marker = (channels) => (f = 1) => channels.map((c) => c * Math.round(f * 100));
const hair = marker([1, 0, 0]);
const shirt = marker([0, 1, 0]);
const pants = marker([0, 0, 1]);
const skin = marker([1, 0, 1]);
const DIRS = ['down', 'left', 'right', 'up'];
const GLASSES = [90, 130, 200];
const WHITE = [236, 236, 230];
const STRAP = [62, 62, 74];
const BAND = [128, 132, 148];
const CUP = [214, 72, 84];
const LENS = [170, 220, 236];
const GOGGLE_FRAME = [226, 232, 238];
const EYE = [34, 30, 40];
const FRAMES = 3;

/** Draws one avatar frame facing down, left or up (right is left mirrored). */
function drawAvatar(o, a, dir, frame) {
  const bob = frame === 0 ? 0 : -1;
  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  const shoe = [44, 38, 40];
  const side = dir === 'left';
  const y0 = bob;

  // legs and shoes
  if (side) {
    o.rect(14 - step * 2, 23 + y0, 3, 6, pants(0.85));
    o.rect(15 + step * 2, 23 + y0, 3, 6, pants());
    o.rect(13 - step * 2, 28 + y0, 4, 2, shoe);
    o.rect(14 + step * 2, 28 + y0, 4, 2, shoe);
  } else {
    const lift = (l) => (step === l ? 1 : 0);
    o.rect(12, 23 + y0, 3, 6 - lift(1), pants());
    o.rect(17, 23 + y0, 3, 6 - lift(-1), pants(0.9));
    o.rect(12, 28 + y0 - lift(1), 3, 2, shoe);
    o.rect(17, 28 + y0 - lift(-1), 3, 2, shoe);
  }
  // torso
  const tx = side ? 12 : 10;
  const tw = side ? 9 : 12;
  o.rect(tx, 15 + y0, tw, 9, shirt());
  o.rect(tx, 15 + y0, tw, 1, shirt(1.2));
  o.rect(tx + tw - 2, 16 + y0, 2, 8, shirt(0.82));
  o.rect(tx, 23 + y0, tw, 1, shirt(0.75));
  if (a.shirt === 'striped') for (const y of [17, 19, 21]) o.rect(tx, y + y0, tw, 1, WHITE);
  if (a.shirt === 'hoodie') {
    if (dir === 'down') {
      o.rect(13, 20 + y0, 6, 3, shirt(0.8));
      o.set(14, 16 + y0, WHITE);
      o.set(14, 17 + y0, WHITE);
      o.set(17, 16 + y0, WHITE);
      o.set(17, 17 + y0, WHITE);
    } else if (side) o.rect(tx + 1, 20 + y0, 4, 3, shirt(0.8));
  }
  if (a.shirt === 'jacket') {
    if (dir === 'down') {
      o.rect(14, 15 + y0, 4, 8, WHITE);
      o.rect(13, 15 + y0, 1, 5, shirt(0.7));
      o.rect(18, 15 + y0, 1, 5, shirt(0.7));
    } else if (side) o.rect(tx, 15 + y0, 2, 8, WHITE);
  }
  if (dir === 'down') o.rect(15, 15 + y0, 2, 2, skin());
  // arms: short sleeves show the skin below them
  const sleeve = a.shirt === 'tshirt' ? 2 : 6;
  const arm = (x, y, w, f) => {
    o.rect(x, y, w, 6, skin(f));
    o.rect(x, y, w, sleeve, shirt(0.9 * f));
    if (a.shirt === 'striped') o.rect(x, y + 2, w, 1, WHITE);
  };
  if (side) {
    arm(15 + step * 2, 16 + y0, 3, 1);
    o.rect(15 + step * 2, 22 + y0, 3, 2, skin());
  } else {
    arm(8, 16 + y0 + (step === 1 ? 1 : 0), 2, 1);
    arm(22, 16 + y0 + (step === -1 ? 1 : 0), 2, 0.9);
    o.rect(8, 22 + y0 + (step === 1 ? 1 : 0), 2, 2, skin());
    o.rect(22, 22 + y0 + (step === -1 ? 1 : 0), 2, 2, skin(0.9));
  }

  // head
  const hx = side ? 15 : 16;
  const hy = 9 + y0;
  o.ellipse(hx, hy, 7.5, 7, skin());
  // shade the far edge (seen from the side, that edge is hair)
  if (!side) for (let j = -4; j < 6; j++) o.set(hx + 6, hy + j, skin(0.88));
  // a hoodie's hood lies on the back of the neck
  if (a.shirt === 'hoodie' && dir === 'up') o.ellipse(hx, hy + 6, 6.5, 2.5, shirt(0.85));
  if (a.shirt === 'hoodie' && side) o.ellipse(hx + 6, hy + 6, 3, 2.5, shirt(0.85));

  if (a.hair === 'long') {
    if (dir === 'up') o.rect(hx - 7, hy, 15, 9, hair());
    else if (side) o.rect(hx + 1, hy - 2, 7, 11, hair());
    else {
      o.rect(hx - 8, hy - 2, 3, 11, hair());
      o.rect(hx + 5, hy - 2, 3, 11, hair());
    }
  }
  // hair cap over the head
  if (dir === 'up') {
    o.ellipse(hx, hy - 0.5, 7.5, 7.5, hair());
    o.ellipse(hx - 2, hy - 4, 3, 1.5, hair(1.35));
  } else if (side) {
    o.ellipse(hx + 1, hy - 4, 7, 4, hair());
    o.rect(hx + 1, hy - 4, 7, 7, hair());
    o.rect(hx - 6, hy - 4, 4, 2, hair());
    o.rect(hx - 1, hy - 6, 4, 1, hair(1.35));
  } else {
    o.ellipse(hx, hy - 4, 7.5, 4, hair());
    o.rect(hx - 7, hy - 4, 2, 5, hair());
    o.rect(hx + 5, hy - 4, 2, 5, hair());
    o.rect(hx - 3, hy - 3, 5, 1, hair());
    o.rect(hx - 3, hy - 6, 4, 1, hair(1.35));
  }
  if (a.hair === 'curly') {
    const pts = dir === 'up' ? [[-7, 2], [6, 2], [-5, 5], [4, 5], [-1, 6]] : side ? [[6, 2], [5, 5], [-6, -4]] : [[-8, 0], [7, 0], [-8, 3], [7, 3]];
    for (const [dx, dy] of pts) o.ellipse(hx + dx + 0.5, hy + dy, 2.2, 2.2, hair());
    o.ellipse(hx, hy - 6, 6, 2.5, hair());
  }
  if (a.hair === 'ponytail') {
    if (dir === 'up') o.rect(hx - 1, hy + 3, 3, 8, hair(0.85));
    else if (side) o.rect(hx + 7, hy - 1, 3, 8, hair());
  }
  if (a.hair === 'bun') {
    if (dir === 'down') o.ellipse(hx, hy - 7, 3, 2.5, hair());
    else if (dir === 'up') o.ellipse(hx, hy - 5, 3.5, 3, hair(0.85));
    else o.ellipse(hx + 6, hy - 5, 3, 3, hair());
  }

  // face
  if (dir === 'up') return;
  if (side) {
    o.rect(hx - 4, hy + 1, 1, 2, EYE);
    o.set(hx - 6, hy + 4, skin(0.8));
    o.set(hx - 3, hy + 4, [236, 140, 140]);
  } else {
    o.rect(hx - 3, hy + 1, 1, 2, EYE);
    o.rect(hx + 2, hy + 1, 1, 2, EYE);
    o.set(hx - 5, hy + 3, [240, 150, 150]);
    o.set(hx + 4, hy + 3, [240, 150, 150]);
    o.rect(hx - 1, hy + 4, 2, 1, skin(0.7));
  }
}


/** Draws an accessory for one frame, positioned like drawAvatar's head. The cap takes the top's colour. */
function drawAccessory(o, kind, dir, frame) {
  const side = dir === 'left';
  const hx = side ? 15 : 16;
  const hy = 9 + (frame === 0 ? 0 : -1);
  if (kind === 'glasses') {
    if (dir === 'up') return;
    if (side) {
      o.rect(hx - 6, hy, 4, 1, GLASSES);
      o.rect(hx - 2, hy, 4, 1, GLASSES);
    } else {
      o.rect(hx - 5, hy, 4, 1, GLASSES);
      o.rect(hx + 1, hy, 4, 1, GLASSES);
      o.rect(hx - 1, hy, 2, 1, GLASSES);
      o.set(hx - 5, hy + 1, GLASSES);
      o.set(hx + 4, hy + 1, GLASSES);
    }
  }
  if (kind === 'cap') {
    if (dir === 'up') o.ellipse(hx, hy - 2, 7.5, 5.5, shirt());
    else if (side) {
      o.ellipse(hx + 1, hy - 3, 7, 4.5, shirt());
      o.rect(hx - 9, hy - 2, 6, 2, shirt(0.8));
    } else {
      o.ellipse(hx, hy - 3, 7.5, 4.5, shirt());
      o.rect(hx - 6, hy - 1, 12, 2, shirt(0.8));
    }
    o.set(hx - 2, hy - 6, shirt(1.3));
  }
  if (kind === 'headphones') {
    if (side) {
      o.rect(hx, hy - 9, 2, 8, BAND);
      o.ellipse(hx + 1, hy + 1, 2.5, 3, CUP);
      o.set(hx, hy, sh(CUP, 1.3));
    } else {
      // the band arcs over the head from ear to ear: the top half of a ring
      for (let y = hy - 10; y < hy; y++)
        for (let x = hx - 9; x <= hx + 9; x++) {
          const d = Math.hypot(x + 0.5 - hx, y + 0.5 - (hy - 0.5));
          if (d > 7.6 && d <= 8.8) o.set(x, y, BAND);
        }
      o.rect(hx - 10, hy - 1, 3, 5, CUP);
      o.rect(hx + 8, hy - 1, 3, 5, sh(CUP, 0.85));
    }
  }
  if (kind === 'goggles') {
    if (dir === 'up') o.rect(hx - 7, hy + 1, 15, 2, STRAP);
    else if (side) {
      o.rect(hx - 2, hy + 1, 9, 1, STRAP);
      o.rect(hx - 7, hy - 1, 5, 5, GOGGLE_FRAME);
      o.rect(hx - 6, hy, 3, 3, LENS);
      o.rect(hx - 4, hy + 1, 1, 2, EYE);
    } else {
      o.rect(hx - 8, hy + 1, 16, 1, STRAP);
      o.rect(hx - 6, hy - 1, 13, 5, GOGGLE_FRAME);
      o.rect(hx - 5, hy, 11, 3, LENS);
      o.rect(hx - 4, hy, 3, 1, sh(LENS, 1.4));
      o.rect(hx - 3, hy + 1, 1, 2, EYE);
      o.rect(hx + 2, hy + 1, 1, 2, EYE);
    }
  }
}

const BODIES = HAIR_STYLES.flatMap((hair) => SHIRT_STYLES.map((shirt) => ({ hair, shirt })));
const sheet = canvas(DIRS.length * FRAMES * T, (BODIES.length + ACCESSORIES.length) * T);
/** Fills one sheet row; `draw(o, dir, frame)` draws a frame facing down, left or up. */
function sheetRow(row, draw, { shadow = false, outline = true } = {}) {
  DIRS.forEach((dir, d) => {
    for (let f = 0; f < FRAMES; f++) {
      const frame = canvas(T, T);
      const part = canvas(T, T);
      draw(part, dir === 'right' ? 'left' : dir, f);
      if (outline) part.outline();
      if (shadow) frame.ellipse(16, 29.5, 7, 2, [0, 0, 0, 70]);
      frame.paste(part, 0, 0, dir === 'right');
      sheet.paste(frame, (d * FRAMES + f) * T, row * T);
    }
  });
}
BODIES.forEach((a, row) => sheetRow(row, (o, dir, f) => drawAvatar(o, a, dir, f), { shadow: true }));
// glasses and goggles sit on the face, where an outline would smudge it
ACCESSORIES.forEach((kind, i) => sheetRow(BODIES.length + i, (o, dir, f) => drawAccessory(o, kind, dir, f), { outline: kind === 'cap' || kind === 'headphones' }));

mkdirSync('content/tilesets', { recursive: true });
mkdirSync('content/sprites', { recursive: true });
writeFileSync('content/tilesets/tiles.png', png(tiles));
writeFileSync('content/sprites/avatar-parts.png', png(sheet));
const tilecount = TILESET_COLUMNS * TILESET_ROWS;
writeFileSync('content/tilesets/tiles.json', JSON.stringify({ tilecount, solid: [...SOLID].sort((a, b) => a - b) }) + '\n');

// Keep every map's embedded tileset in step with the image (Tiled and Phaser read its size from there).
const mapFiles = ['content/lobby/map.json', ...readdirSync('content/rooms').map((r) => `content/rooms/${r}/map.json`)];
for (const file of mapFiles) {
  const map = JSON.parse(readFileSync(file, 'utf8'));
  const ts = map.tilesets[0];
  Object.assign(ts, { imagewidth: TILESET_COLUMNS * T, imageheight: TILESET_ROWS * T, columns: TILESET_COLUMNS, tilecount });
  delete ts.tiles;
  writeFileSync(file, JSON.stringify(map, null, 1) + '\n');
}
console.log('wrote content/tilesets/tiles.png, tiles.json, content/sprites/avatar-parts.png and synced the maps');
