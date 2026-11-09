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
// The Blue Index: Hotel Tabula on a storm night. A marble lobby with the reception counter, the key
// board and the lift, the staff's back office with the door-lock server, and the bar with its card table.
{
  const B = blockOf('sql-hotel');
  const PAPER_GREEN = [58, 92, 80];
  const DAMASK = [176, 150, 88];
  const WAINSCOT = [104, 54, 40];
  const MARBLE = [226, 220, 206];
  const FELT = [44, 112, 72];
  const CHAIR_WOOD = [120, 66, 42];
  const SNOW = [236, 244, 252];
  /** The hotel's wall face: green damask wallpaper over a mahogany wainscot with a brass-capped rail. */
  const hotelWall = (g) => {
    g.rect(0, 0, T, T, PAPER_GREEN);
    g.noise(0, 0, T, T, 0.05, B);
    for (let x = 0; x < T; x += 4) g.rect(x, 2, 1, 17, sh(PAPER_GREEN, 0.92));
    // damask motifs: little gold lilies in a half-drop repeat
    for (const [cx, cy] of [[8, 7], [24, 7], [16, 15], [0, 15], [32, 15]]) {
      g.set(cx, cy - 2, DAMASK);
      g.rect(cx - 1, cy - 1, 3, 1, alpha(DAMASK, 200));
      g.rect(cx - 2, cy, 5, 1, alpha(DAMASK, 150));
      g.set(cx, cy + 1, DAMASK);
      g.set(cx - 2, cy + 1, alpha(DAMASK, 120));
      g.set(cx + 2, cy + 1, alpha(DAMASK, 120));
    }
    g.rect(0, 0, T, 2, sh(PAPER_GREEN, 0.6));
    g.rect(0, 2, T, 1, sh(PAPER_GREEN, 1.15));
    g.rect(0, 19, T, 13, WAINSCOT);
    g.noise(0, 19, T, 13, 0.08, B + 100);
    g.rect(0, 19, T, 2, BRASS);
    g.rect(0, 19, T, 1, sh(BRASS, 1.3));
    g.rect(0, 21, T, 1, sh(WAINSCOT, 0.6));
    for (const x of [3, 19]) {
      g.rect(x, 23, 11, 6, sh(WAINSCOT, 1.12));
      g.rect(x + 1, 24, 9, 4, WAINSCOT);
      g.rect(x, 28, 11, 1, sh(WAINSCOT, 0.7));
    }
    g.rect(0, T - 2, T, 2, sh(WAINSCOT, 0.65));
  };
  // B+0 hotel wall front, B+1 in a left wall, B+2 in a right wall
  drawTile(B, hotelWall);
  drawTile(B + 1, turned(hotelWall, 'ccw'));
  drawTile(B + 2, turned(hotelWall, 'cw'));
  solid(B, B + 1, B + 2);
  // B+3 lobby floor: cream and grey marble in big squares, with veins
  drawTile(B + 3, (g) => {
    const dark = [212, 206, 196];
    for (const [x, y, c] of [[0, 0, MARBLE], [16, 0, dark], [0, 16, dark], [16, 16, MARBLE]]) g.rect(x, y, 16, 16, c);
    g.noise(0, 0, T, T, 0.05, B + 3);
    const r = rng(B + 3);
    for (let v = 0; v < 3; v++) {
      let x = r() * T;
      for (let y = 0; y < T; y++) {
        x += (r() - 0.45) * 1.6;
        g.set(((Math.floor(x) % T) + T) % T, y, [168, 160, 150, 110]);
      }
    }
    for (const o of [0, 16]) {
      g.rect(0, o, T, 1, [176, 168, 156]);
      g.rect(o, 0, 1, T, [176, 168, 156]);
    }
    g.set(1, 1, [255, 255, 250]);
    g.set(17, 17, [255, 255, 250]);
  });
  // B+4 back-office floor: worn grey-blue carpet tiles, laid with the pile turned
  drawTile(B + 4, (g) => {
    const c = [92, 102, 118];
    g.rect(0, 0, T, T, c);
    g.noise(0, 0, T, T, 0.12, B + 4);
    for (let y = 0; y < 16; y += 2) g.rect(0, y, 16, 1, alpha(sh(c, 0.88), 140));
    for (let x = 16; x < T; x += 2) g.rect(x, 0, 1, 16, alpha(sh(c, 0.88), 140));
    for (let x = 0; x < 16; x += 2) g.rect(x, 16, 1, 16, alpha(sh(c, 0.88), 140));
    for (let y = 16; y < T; y += 2) g.rect(16, y, 16, 1, alpha(sh(c, 0.88), 140));
    g.rect(0, 0, T, 1, sh(c, 0.75));
    g.rect(0, 0, 1, T, sh(c, 0.75));
    g.rect(0, 16, T, 1, sh(c, 0.82));
    g.rect(16, 0, 1, T, sh(c, 0.82));
  });
  // B+5 bar floor: dark herringbone parquet
  drawTile(B + 5, (g) => {
    const wood = [116, 70, 44];
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const k = Math.floor(x / 8);
        const s = k % 2 ? -1 : 1;
        const u = y + s * (x % 8) + 64;
        const plank = Math.floor(u / 8) * 7 + k * 3;
        const f = 0.86 + ((plank * 37) % 11) / 40;
        let col = sh(wood, f);
        if (u % 8 === 0) col = sh(wood, 0.62);
        else if (u % 8 === 1) col = sh(col, 1.12);
        if (x % 8 === 0) col = sh(wood, 0.66);
        g.set(x, y, col);
      }
    g.noise(0, 0, T, T, 0.06, B + 5);
  });
  // B+6..B+9 reception counter: mahogany panels and a brass rail under a marble top, with a banker's
  // lamp and key cards, the reception computer, the bell and logbook, and a vase of edelweiss
  drawPiece([[B + 6, B + 7, B + 8, B + 9]], (g, { obj, shadow }) => {
    shadow(64, 30, 63, 2);
    obj((o) => {
      o.box(0, 11, 128, 5, MARBLE, 1.1, 0.8);
      o.noise(0, 12, 128, 3, 0.06, B + 6);
      o.box(1, 16, 126, 13, MAHOGANY, 1.15);
      for (let x = 4; x < 124; x += 16) {
        o.rect(x, 18, 12, 7, sh(MAHOGANY, 1.15));
        o.rect(x + 1, 19, 10, 5, MAHOGANY);
      }
      o.rect(1, 26, 126, 1, BRASS);
      o.rect(1, 28, 126, 1, sh(MAHOGANY, 0.55));
      // brass name plate across the middle
      o.box(52, 19, 24, 5, BRASS, 1.3);
      for (let x = 55; x < 73; x += 3) o.rect(x, 21, 2, 1, sh(BRASS, 0.6));
    });
    obj((o) => {
      // banker's lamp and a fan of key cards
      o.rect(8, 9, 10, 2, BRASS);
      o.rect(12, 5, 2, 4, BRASS);
      o.box(6, 2, 14, 4, [40, 120, 80], 1.35);
      o.rect(21, 8, 6, 4, [244, 204, 72]);
      o.rect(22, 7, 6, 4, [250, 250, 244]);
      o.rect(23, 8, 3, 1, [200, 60, 60]);
      // the reception computer: a beige monitor with green text, and a keyboard
      o.box(38, 0, 20, 11, [214, 206, 186], 1.15);
      o.rect(40, 2, 16, 7, [24, 44, 36]);
      for (let j = 0; j < 3; j++) o.rect(41, 3 + j * 2, 6 + ((j * 5) % 8), 1, SCREEN);
      o.rect(46, 11, 4, 1, [180, 172, 150]);
      o.box(36, 12, 22, 3, [226, 220, 204], 1.1);
      // the bell and the open logbook
      o.box(68, 4, 20, 9, [36, 52, 104], 1.2);
      o.rect(69, 5, 8, 7, [250, 246, 230]);
      o.rect(79, 5, 8, 7, [250, 246, 230]);
      for (let j = 6; j < 11; j += 2) {
        o.rect(70, j, 6, 1, [130, 130, 145]);
        o.rect(80, j, 5 - (j % 3), 1, [130, 130, 145]);
      }
      o.rect(77, 5, 2, 7, [120, 40, 50]);
      o.rect(78, 11, 1, 3, [200, 50, 60]);
      o.ellipse(96, 10, 5, 3.5, [230, 196, 90]);
      o.ellipse(95, 9, 2, 1.5, [255, 240, 190]);
      o.rect(96, 5, 1, 2, [180, 140, 50]);
      o.rect(91, 12, 11, 1, [150, 120, 50]);
      // vase of edelweiss
      o.box(113, 5, 7, 8, [70, 110, 160], 1.3);
      for (const [x, y] of [[111, 2], [116, 0], [121, 2], [114, 4], [119, 4]]) {
        o.rect(x + 1, y + 2, 1, 3, [70, 130, 70]);
        o.ellipse(x + 1.5, y + 1.5, 2, 2, [244, 244, 236]);
        o.set(x + 1, y + 1, [240, 214, 90]);
      }
    });
  });
  // B+10, B+11 key board on the wall: a mahogany board of numbered brass hooks, keys hanging with
  // red tassels, a few hooks empty
  drawPiece([[B + 10, B + 11]], (g, { obj }) => {
    hotelWall(g);
    const right = canvas(T, T);
    hotelWall(right);
    g.paste(right, T, 0);
    obj((o) => {
      o.box(3, 2, 58, 19, MAHOGANY, 1.3);
      o.rect(5, 4, 54, 15, sh(MAHOGANY, 0.8));
      const r = rng(B + 10);
      for (let row = 0; row < 2; row++)
        for (let i = 0; i < 9; i++) {
          const x = 7 + i * 6;
          const y = 5 + row * 7;
          o.rect(x, y, 3, 1, [236, 230, 210]);
          o.set(x + 1, y + 1, BRASS);
          if (r() < 0.72) {
            o.rect(x + 1, y + 2, 1, 2, BRASS);
            o.rect(x, y + 3, 3, 1, sh(BRASS, 1.2));
            o.rect(x + 1, y + 4, 1, 2, [196, 40, 50]);
          }
        }
    });
  });
  // B+12 door-lock server: a black rack of blinking units, a patch panel and a keycard logo
  drawTile(B + 12, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(3, 0, 26, 30, [44, 46, 56], 1.3);
      for (let u = 0; u < 5; u++) {
        const y = 3 + u * 5;
        o.box(5, y, 22, 4, [64, 68, 82], 1.2);
        for (let i = 0; i < 5; i++) o.set(7 + i * 2, y + 1, [[90, 230, 120], [90, 230, 120], [255, 190, 60], [90, 230, 120], [240, 70, 60]][(i + u * 2) % 5]);
        o.rect(19, y + 1, 6, 2, [30, 32, 40]);
      }
      o.rect(20, 4, 4, 2, [244, 204, 72]);
      o.rect(5, 27, 22, 2, [30, 32, 40]);
    });
    // cables trailing out of the bottom
    g.rect(24, 29, 6, 1, [40, 120, 200]);
    g.rect(8, 30, 9, 1, [220, 180, 40]);
  });
  // B+13, B+14 the manager's desk: a mahogany desk with a green leather top, a ringing telephone,
  // a banker's lamp, a cigar box and a pile of invoices
  drawPiece([[B + 13, B + 14]], (g, { obj, shadow }) => {
    shadow(32, 29, 30, 3);
    obj((o) => {
      o.box(1, 11, 62, 12, MAHOGANY, 1.25);
      o.rect(4, 13, 56, 6, [50, 96, 66]);
      o.rect(4, 13, 56, 1, [74, 130, 90]);
      o.rect(1, 23, 62, 6, sh(MAHOGANY, 0.75));
      o.rect(26, 24, 12, 1, BRASS);
      o.rect(3, 29, 3, 2, sh(MAHOGANY, 0.6));
      o.rect(58, 29, 3, 2, sh(MAHOGANY, 0.6));
    });
    obj((o) => {
      // telephone: black body, brass dial, the handset on its cradle
      o.box(7, 6, 16, 9, [34, 34, 40], 1.4);
      o.ellipse(15, 11, 3.5, 3, BRASS);
      o.ellipse(15, 11, 1.5, 1.2, [34, 34, 40]);
      o.box(5, 3, 20, 4, [34, 34, 40], 1.5);
      o.rect(4, 2, 4, 3, [34, 34, 40]);
      o.rect(22, 2, 4, 3, [34, 34, 40]);
      // lamp, cigar box, invoices
      o.rect(38, 13, 10, 2, BRASS);
      o.rect(42, 7, 2, 6, BRASS);
      o.box(36, 3, 14, 5, [40, 120, 80], 1.35);
      paper(o, 51, 6, 10, 9);
      o.box(26, 11, 9, 5, [150, 84, 50], 1.3);
      o.rect(28, 12, 5, 1, [230, 200, 120]);
    });
    // ringing lines
    for (const [x, y] of [[2, 1], [1, 4], [27, 1], [28, 4]]) g.rect(x, y, 2, 1, [255, 230, 120]);
  });
  // B+15..B+17 the card table: an oval of green felt in a wooden rim, cards, chips, a whisky glass,
  // and on the right Victor's signed statement with a pen
  drawPiece([[B + 15, B + 16, B + 17]], (g, { obj, shadow }) => {
    shadow(48, 28, 46, 4);
    obj((o) => {
      o.ellipse(48, 15, 46, 12, CHAIR_WOOD);
      o.ellipse(48, 14, 46, 11, sh(CHAIR_WOOD, 1.2));
      o.ellipse(48, 15, 42, 9, FELT);
      o.ellipse(48, 13, 38, 6, sh(FELT, 1.08));
      o.rect(12, 25, 3, 5, sh(CHAIR_WOOD, 0.7));
      o.rect(81, 25, 3, 5, sh(CHAIR_WOOD, 0.7));
    });
    obj((o) => {
      // a fanned hand and the deck
      for (let i = 0; i < 4; i++) o.box(14 + i * 3, 9 + (i % 2), 5, 7, [250, 248, 240], 1, 0.85);
      o.set(15, 11, [200, 40, 40]);
      o.set(24, 12, [30, 30, 40]);
      o.box(40, 9, 6, 8, [176, 40, 50], 1.2);
      o.rect(41, 10, 4, 6, [210, 70, 80]);
      // chip stacks
      for (const [x, col] of [[30, [220, 60, 60]], [34, [60, 100, 200]], [52, [240, 240, 236]], [56, [30, 30, 36]]])
        for (let j = 0; j < 3; j++) o.box(x, 13 - j * 2, 4, 3, col, 1.25);
      // whisky glass
      o.box(61, 8, 5, 6, [220, 236, 240], 1.1);
      o.rect(62, 10, 3, 3, [210, 140, 50]);
      // the statement, with a pen
      paper(o, 72, 6, 13, 11);
      o.rect(74, 14, 6, 1, [40, 64, 170]);
      o.rect(86, 7, 1, 8, [40, 40, 50]);
      o.set(86, 6, BRASS);
    });
  });
  /** A card-room chair seen from the front: a carved back above a green seat. */
  const cardChair = (o) => {
    o.box(9, 2, 14, 11, CHAIR_WOOD, 1.3);
    o.rect(12, 4, 8, 7, sh(CHAIR_WOOD, 0.8));
    o.box(8, 13, 16, 8, FELT, 1.25);
    o.rect(9, 21, 2, 8, sh(CHAIR_WOOD, 0.8));
    o.rect(21, 21, 2, 8, sh(CHAIR_WOOD, 0.8));
  };
  // B+18 card chair facing down (a seat, not solid)
  drawTile(B + 18, (g, { obj, shadow }) => {
    shadow(16, 29, 9, 2);
    obj(cardChair);
  });
  // B+28 card chair facing up, seen from behind (a seat, not solid)
  drawTile(B + 28, (g, { obj, shadow }) => {
    shadow(16, 29, 9, 2);
    obj((o) => {
      o.box(8, 8, 16, 7, FELT, 1.25);
      o.rect(9, 21, 2, 8, sh(CHAIR_WOOD, 0.8));
      o.rect(21, 21, 2, 8, sh(CHAIR_WOOD, 0.8));
      o.box(9, 12, 14, 12, CHAIR_WOOD, 1.3);
      for (const x of [12, 15, 18]) o.rect(x, 14, 2, 8, sh(CHAIR_WOOD, 0.75));
    });
  });
  /** A marble pillar's shaft, drawn on a canvas two tiles tall: capital at the top, plinth at the bottom. */
  const pillar = (g, { obj, shadow }) => {
    shadow(16, 61, 13, 3);
    obj((o) => {
      o.box(4, 54, 24, 7, sh(MARBLE, 0.9), 1.2);
      o.rect(4, 54, 24, 2, BRASS);
      o.rect(7, 10, 18, 44, MARBLE);
      for (const x of [9, 13, 17, 21]) o.rect(x, 10, 1, 44, sh(MARBLE, 0.86));
      o.rect(8, 10, 1, 44, sh(MARBLE, 1.1));
      o.rect(23, 10, 2, 44, sh(MARBLE, 0.8));
      o.box(4, 4, 24, 7, sh(MARBLE, 0.95), 1.2);
      o.rect(4, 9, 24, 2, BRASS);
      o.box(2, 1, 28, 4, MARBLE, 1.15);
    });
  };
  // B+19 a pillar's capital (above the avatars), B+26 its shaft and plinth (on the walls layer, solid)
  drawPiece([[B + 19], [B + 26]], pillar);
  solid(B + 26);
  // B+20, B+21 the lift: brass doors in a stepped art-deco frame, a dial over them with its needle on 4,
  // and the call button
  drawPiece([[B + 20, B + 21]], (g, { obj }) => {
    hotelWall(g);
    const right = canvas(T, T);
    hotelWall(right);
    g.paste(right, T, 0);
    obj((o) => {
      o.box(6, 7, 52, 25, sh(BRASS, 0.8), 1.25);
      o.rect(9, 10, 46, 22, [40, 34, 30]);
      for (const x of [10, 33]) {
        o.box(x, 11, 21, 21, [198, 158, 80], 1.2);
        for (let k = 0; k < 4; k++) o.rect(x + 3 + k * 5, 13, 1, 17, sh(BRASS, 0.7));
        o.rect(x + 2, 20, 17, 1, sh(BRASS, 1.3));
      }
      o.rect(31, 11, 2, 21, [40, 34, 30]);
      // dial
      o.ellipse(32, 4, 9, 5, BRASS);
      o.ellipse(32, 5, 7, 4, [246, 240, 220]);
      for (let i = 0; i < 5; i++) o.set(26 + i * 3, 4 - (i === 2 ? 1 : 0), [60, 50, 40]);
      o.rect(32, 5, 1, 1, [40, 30, 30]);
      o.set(33, 4, [180, 40, 40]);
      o.set(35, 3, [180, 40, 40]);
      // call button
      o.box(59, 15, 4, 7, BRASS, 1.3);
      o.ellipse(61, 18, 1, 1.5, [255, 120, 80]);
    });
  });
  solid(B + 20, B + 21);
  // B+22 the night guard's stand: a small desk with a torch, a walkie-talkie and his open notebook
  drawTile(B + 22, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      deskBase(o, MAHOGANY);
      paper(o, 4, 5, 12, 10, [246, 240, 214]);
      o.rect(10, 5, 1, 10, [200, 60, 60]);
      o.box(18, 9, 10, 4, [40, 40, 48], 1.4);
      o.rect(26, 9, 3, 4, [250, 236, 160]);
      o.box(20, 2, 5, 8, [40, 40, 48], 1.3);
      o.rect(21, 0, 1, 3, [40, 40, 48]);
      o.set(23, 4, [90, 230, 120]);
    });
    // the torch is on
    for (let j = 0; j < 4; j++) g.rect(29, 9 - j, 3, 4 + 2 * j, [255, 240, 170, 60 - j * 12]);
  });
  // B+23 storm window: a tall pane of night and driving snow over the mountains, between heavy curtains
  drawTile(B + 23, (g) => {
    hotelWall(g);
    const o = canvas(T, T);
    o.box(5, 3, 22, 23, [220, 214, 196], 1.15);
    o.rect(7, 5, 18, 19, [26, 34, 60]);
    for (let j = 0; j < 19; j++) o.rect(7, 5 + j, 18, 1, [60, 76, 120, Math.round(j * 6)]);
    for (let x = 7; x < 25; x++) {
      const h = Math.round(5 + Math.abs(((x * 7) % 13) - 6) * 0.9 + (x > 15 ? 4 - (x - 15) * 0.4 : 0));
      o.rect(x, 24 - h, 1, h, [70, 82, 110]);
      o.set(x, 24 - h, [220, 230, 246]);
    }
    const r = rng(B + 23);
    for (let i = 0; i < 20; i++) {
      const x = 7 + Math.floor(r() * 17);
      const y = 5 + Math.floor(r() * 17);
      o.set(x, y, SNOW);
      o.set(x - 1, y - 1, alpha(SNOW, 120));
    }
    o.rect(15, 5, 2, 19, [220, 214, 196]);
    o.rect(7, 14, 18, 1, [220, 214, 196]);
    o.outline();
    g.paste(o);
    const curtain = canvas(T, T);
    curtain.box(1, 1, 7, 28, [146, 40, 52], 1.2);
    curtain.box(24, 1, 7, 28, [146, 40, 52], 1.2);
    for (const x of [3, 5, 26, 28]) curtain.rect(x, 2, 1, 26, sh([146, 40, 52], 0.75));
    curtain.rect(0, 0, T, 2, BRASS);
    curtain.outline();
    g.paste(curtain);
    // snow piled on the sill
    g.rect(6, 25, 20, 2, SNOW);
    g.rect(8, 24, 6, 1, SNOW);
  });
  solid(B + 23);
  // B+24 chandelier (above the avatars): a brass ring of candle bulbs hung with crystal drops, in a warm halo
  drawTile(B + 24, (g) => {
    for (let j = 0; j < 8; j++) g.ellipse(16, 16, 16 - j, 13 - j, [255, 214, 130, 14]);
    const o = canvas(T, T);
    o.rect(15, 0, 2, 12, [120, 92, 40]);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const d = ((x + 0.5 - 16) / 12) ** 2 + ((y + 0.5 - 16) / 5) ** 2;
        const e = ((x + 0.5 - 16) / 9) ** 2 + ((y + 0.5 - 15.5) / 2.6) ** 2;
        if (d <= 1 && e > 1) o.set(x, y, y < 16 ? sh(BRASS, 1.15) : sh(BRASS, 0.85));
      }
    o.ellipse(16, 15, 3, 2, BRASS);
    o.outline();
    g.paste(o);
    for (const [x, y] of [[5, 15], [10, 12], [22, 12], [27, 15], [9, 19], [16, 21], [23, 19]]) {
      g.rect(x - 1, y - 4, 2, 4, [250, 246, 230]);
      g.rect(x - 1, y - 6, 2, 2, [255, 214, 100]);
      g.set(x - 1, y - 7, [255, 250, 210]);
    }
    for (const [x, y] of [[7, 20], [12, 22], [20, 22], [25, 20], [16, 24]]) {
      g.rect(x, y, 1, 3, [190, 226, 255]);
      g.set(x, y + 3, [255, 255, 255]);
    }
  });
  // B+25 snowy footprints (decor): Mr Ruiz came in through the storm at 02:45, leaving wet prints and slush
  drawTile(B + 25, (g) => {
    const step = (x, y, flip) => {
      g.ellipse(x + (flip ? -1 : 1), y + 3, 5, 7.5, [110, 140, 170, 70]);
      g.ellipse(x, y, 3.2, 4.2, [120, 146, 172, 230]);
      g.ellipse(x, y + 6.5, 2.6, 2.2, [120, 146, 172, 230]);
      g.ellipse(x - 0.5, y - 0.5, 2, 2.8, SNOW);
      g.ellipse(x - 0.5, y + 6, 1.4, 1.2, SNOW);
    };
    step(10, 18, false);
    step(22, 6, true);
    g.set(5, 28, alpha(SNOW, 200));
    g.set(27, 16, alpha(SNOW, 200));
  });
  // B+27 bar counter with the till (fits between tiles 128 and 131): a brass till with a paper receipt
  drawTile(B + 27, (g) => {
    // the counter part, drawn three tiles wide so its outline runs off both sides
    const wide = canvas(3 * T, T);
    wide.ellipse(48, 30, 47, 2, [0, 0, 0, 60]);
    const o = canvas(3 * T, T);
    o.box(0, 9, 96, 6, BAR_WOOD, 1.4);
    o.box(1, 15, 94, 13, WOOD_DARK, 1.1);
    for (let x = 9; x < 96; x += 16) o.rect(x, 16, 1, 9, sh(WOOD_DARK, 0.75));
    o.rect(1, 24, 94, 2, BRASS);
    o.rect(1, 24, 94, 1, sh(BRASS, 1.3));
    o.rect(1, 27, 94, 2, sh(WOOD_DARK, 0.6));
    o.outline();
    wide.paste(o);
    g.paste(wide, -T, 0);
    const till = canvas(T, T);
    till.box(6, 3, 20, 9, sh(BRASS, 0.9), 1.3);
    till.rect(8, 5, 16, 2, sh(BRASS, 0.6));
    for (let i = 0; i < 4; i++) till.rect(8 + i * 4, 8, 3, 2, [246, 240, 220]);
    till.box(11, 0, 10, 4, [40, 40, 46], 1.3);
    till.rect(12, 1, 8, 2, [120, 230, 160]);
    till.rect(22, 9, 6, 4, [250, 248, 240]);
    till.outline();
    g.paste(till);
  });
  // B+29 Edwina Tabula's portrait, hung on the hotel wall; B+30 a wall lamp on it
  onWall(B + 29, 30, hotelWall);
  drawTile(B + 30, (g) => {
    hotelWall(g);
    for (let j = 0; j < 13; j++) {
      const w = 8 + j * 1.6;
      g.rect(Math.round(16 - w / 2), 13 - j, Math.round(w), 1, [255, 206, 110, Math.round(150 - j * 10)]);
    }
    const o = canvas(T, T);
    o.box(13, 16, 6, 9, BRASS, 1.3);
    o.rect(15, 19, 2, 2, sh(BRASS, 0.7));
    o.rect(15, 14, 2, 3, BRASS);
    o.box(10, 9, 12, 6, [252, 240, 206], 1.05, 0.85);
    o.rect(10, 9, 12, 1, [255, 252, 236]);
    o.rect(11, 14, 10, 1, BRASS);
    o.outline();
    g.paste(o);
  });
  solid(B + 30);
  // B+31 the porter's luggage trolley: a brass birdcage cart with suitcases and a hatbox
  drawTile(B + 31, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      o.box(3, 22, 26, 4, [200, 64, 60], 1.3);
      o.box(5, 12, 20, 10, [150, 96, 60], 1.25);
      o.rect(5, 16, 20, 1, sh([150, 96, 60], 0.7));
      o.rect(13, 11, 4, 2, [60, 40, 30]);
      o.box(7, 5, 15, 7, [70, 100, 150], 1.25);
      o.ellipse(22, 9, 4, 3, [236, 210, 180]);
      o.rect(19, 9, 6, 1, [180, 60, 60]);
    });
    obj((o) => {
      o.rect(3, 2, 2, 24, BRASS);
      o.rect(27, 2, 2, 24, BRASS);
      for (let x = 2; x < 30; x++) o.set(x, 2 - Math.round(Math.sin(((x - 2) / 27) * Math.PI) * 2) + 1, BRASS);
      for (const x of [6, 26]) o.ellipse(x, 28, 2, 2, [40, 40, 46]);
    });
  });
  solid(B + 6, B + 7, B + 8, B + 9, B + 10, B + 11, B + 12, B + 13, B + 14, B + 15, B + 16, B + 17, B + 22, B + 27, B + 31);
}
// --- end sql-hotel ---

// --- sql-cinema restyle (tiles 272-303) ---
// The Last Show: Kino Lumen after the last show. The dark Studio (hall 2) with its screen, stage and
// rows of red seats, the art-deco foyer with the box office, the snack bar and the usher's post at the
// Studio door, and the staff room behind the box office with Edith's office door.
{
  const B = blockOf('sql-cinema');
  const DADO = [70, 36, 34];
  const SEAT = [176, 36, 52];
  const TEAL = [28, 70, 78];
  const SCREEN_LIGHT = [236, 236, 246];
  /** The cinema's wall face: pleated red velvet above a gold art-deco band and a dark wood dado. */
  const cinemaWall = (g) => {
    g.rect(0, 0, T, T, VELVET);
    for (let x = 0; x < T; x++) {
      const f = 0.82 + 0.3 * Math.abs(Math.sin((x / 8) * Math.PI));
      g.rect(x, 2, 1, 16, sh(VELVET, f));
    }
    g.noise(0, 2, T, 16, 0.05, B);
    g.rect(0, 0, T, 2, sh(VELVET, 0.55));
    g.rect(0, 18, T, 3, GOLD);
    g.rect(0, 18, T, 1, sh(GOLD, 1.25));
    g.rect(0, 20, T, 1, sh(GOLD, 0.7));
    // little stepped deco fans on the band
    for (const x of [8, 24]) {
      g.rect(x - 1, 17, 3, 1, GOLD);
      g.set(x, 16, GOLD);
    }
    g.rect(0, 21, T, 11, DADO);
    g.noise(0, 21, T, 11, 0.08, B + 50);
    for (let x = 0; x < T; x += 8) g.rect(x, 22, 1, 9, sh(DADO, 0.75));
    g.rect(0, T - 2, T, 2, sh(DADO, 0.6));
  };
  // B+0 cinema wall front, B+1 in a left wall, B+2 in a right wall
  drawTile(B, cinemaWall);
  drawTile(B + 1, turned(cinemaWall, 'ccw'));
  drawTile(B + 2, turned(cinemaWall, 'cw'));
  solid(B, B + 1, B + 2);
  // B+3 Studio floor: a near-black carpet with a scatter of coloured confetti, the classic cinema pattern
  drawTile(B + 3, (g) => {
    const base = [38, 32, 48];
    g.rect(0, 0, T, T, base);
    g.noise(0, 0, T, T, 0.12, B + 3);
    const r = rng(B + 3);
    const cols = [[200, 60, 90], [70, 150, 200], [230, 190, 80], [120, 90, 190]];
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(r() * 30);
      const y = Math.floor(r() * 31);
      const c = alpha(cols[i % 4], 150);
      if (r() < 0.5) g.rect(x, y, 3, 1, c);
      else g.rect(x, y, 1, 2, c);
    }
  });
  // B+4 foyer floor: a deep teal carpet with gold art-deco fans in a half-drop repeat
  drawTile(B + 4, (g) => {
    g.rect(0, 0, T, T, TEAL);
    g.noise(0, 0, T, T, 0.08, B + 4);
    const fan = (cx, cy) => {
      for (let a = 0; a < 5; a++) {
        const ang = Math.PI + (a / 4) * Math.PI;
        for (let d = 2; d < 7; d++) g.set(Math.round(cx + Math.cos(ang) * d), Math.round(cy + Math.sin(ang) * d), alpha(GOLD, 80));
      }
      for (let x = -7; x <= 7; x++) g.set(cx + x, cy, alpha(GOLD, 100));
      g.rect(cx - 1, cy - 2, 3, 2, alpha(sh(GOLD, 1.2), 150));
    };
    fan(8, 12);
    fan(24, 28);
    fan(-8, 28);
    fan(40, 28);
    for (const [x, y] of [[24, 6], [8, 22]]) g.set(x, y, alpha(GOLD, 90));
  });
  // B+5..B+8 the Studio screen on the wall: a glowing white screen between drawn-back red curtains
  drawPiece([[B + 5, B + 6, B + 7, B + 8]], (g, { obj }) => {
    for (let i = 0; i < 4; i++) {
      const w = canvas(T, T);
      cinemaWall(w);
      g.paste(w, i * T, 0);
    }
    obj((o) => {
      o.box(10, 1, 108, 24, [30, 28, 34], 1.3);
      o.rect(13, 3, 102, 20, SCREEN_LIGHT);
      for (let j = 0; j < 20; j++) o.rect(13, 3 + j, 102, 1, alpha([170, 190, 230], Math.round(j * 4)));
      // a frozen frame of the last film: a moon over hills
      o.ellipse(84, 9, 4, 4, [255, 250, 220]);
      for (let x = 13; x < 115; x++) {
        const h = Math.round(4 + 2.5 * Math.sin(x / 9) + 1.5 * Math.sin(x / 4));
        o.rect(x, 23 - h, 1, h, [150, 160, 190]);
      }
    });
    obj((o) => {
      // curtains, gathered at the sides
      for (const [x, dir] of [[0, 1], [128, -1]]) {
        for (let j = 0; j < 30; j++) {
          const w = Math.round(14 - Math.abs(j - 18) * 0.35);
          o.rect(dir > 0 ? x : x - w, j, w, 1, VELVET);
        }
        for (let k = 3; k < 13; k += 3) o.rect(dir > 0 ? x + k : x - k - 1, 0, 1, 28, sh(VELVET, 0.7));
        o.rect(dir > 0 ? x : x - 14, 17, 14, 2, GOLD);
      }
      o.rect(0, 0, 128, 2, sh(VELVET, 0.8));
    });
  });
  solid(B + 5, B + 6, B + 7, B + 8);
  // B+9 the stage below the screen: a black wooden lip with a row of warm footlights
  drawTile(B + 9, (g, { obj }) => {
    obj((o) => {
      o.rect(0, 0, T, 18, [52, 40, 40]);
      for (let y = 2; y < 18; y += 5) o.rect(0, y, T, 1, [40, 30, 30]);
      o.rect(0, 18, T, 3, GOLD);
      o.rect(0, 21, T, 6, [30, 24, 26]);
    }, false);
    for (const x of [4, 12, 20, 28]) {
      g.ellipse(x, 19, 4, 3, [255, 220, 140, 80]);
      g.rect(x - 1, 19, 3, 2, [255, 236, 170]);
    }
    g.rect(0, 27, T, 2, [0, 0, 0, 70]);
  });
  solid(B + 9);
  /** Cinema seats in a row, seen from behind as the audience faces the screen: `ends` adds armrests at the row's ends. */
  const seatRow = (left, right) => (g) => {
    g.rect(0, 26, T, 3, [0, 0, 0, 60]);
    const o = canvas(T, T);
    for (const x of [1, 17]) {
      o.box(x + 1, 6, 13, 8, sh(SEAT, 0.85), 1.25);
      o.box(x, 12, 15, 13, SEAT, 1.2);
      o.rect(x + 2, 15, 11, 1, sh(SEAT, 0.75));
      o.rect(x + 7, 25, 2, 3, [40, 36, 40]);
    }
    if (left) o.box(0, 9, 3, 17, [60, 46, 46], 1.3);
    if (right) o.box(29, 9, 3, 17, [60, 46, 46], 1.3);
    o.outline();
    g.paste(o);
  };
  // B+10 seat row, left end; B+11 middle; B+12 right end (seats: walkable)
  drawTile(B + 10, seatRow(true, false));
  drawTile(B + 11, seatRow(false, false));
  drawTile(B + 12, seatRow(false, true));
  // B+13 art-deco wall light on the cinema wall: a gold shell throwing light up the velvet
  drawTile(B + 13, (g) => {
    cinemaWall(g);
    for (let j = 0; j < 14; j++) g.rect(Math.round(16 - (4 + j)), 14 - j, 8 + 2 * j, 1, [255, 214, 140, Math.round(130 - j * 9)]);
    const o = canvas(T, T);
    for (let j = 0; j < 7; j++) o.rect(16 - (7 - j), 9 + j, 2 * (7 - j), 1, j % 2 ? sh(GOLD, 0.85) : GOLD);
    o.rect(10, 9, 12, 1, [255, 244, 200]);
    o.rect(15, 16, 2, 3, sh(GOLD, 0.7));
    o.outline();
    g.paste(o);
  });
  solid(B + 13);
  // B+14 aisle lights (decor): two small amber lamps set in the floor at the ends of a seat row
  drawTile(B + 14, (g) => {
    for (const y of [9, 25]) {
      g.ellipse(16, y, 7, 3, [255, 190, 90, 50]);
      g.rect(14, y - 1, 5, 2, [255, 210, 120]);
      g.rect(14, y + 1, 5, 1, [120, 80, 40]);
    }
  });
  // B+15, B+16 projector beam (above the avatars): a pale cone of light with dust in it, left and right half
  drawPiece([[B + 15, B + 16]], (g) => {
    const r = rng(B + 15);
    for (let x = 0; x < 64; x++) {
      const d = Math.abs(x - 31.5) / 32;
      const a = Math.round(70 * (1 - d * d));
      g.rect(x, 0, 1, T, [210, 220, 255, a]);
    }
    for (let i = 0; i < 16; i++) g.set(8 + Math.floor(r() * 48), Math.floor(r() * T), [255, 255, 255, 170]);
  });
  // B+17..B+20 the box office: a booth with two glass windows over the counter, till 1 and till 2,
  // a cash tray, ticket rolls and a lit TICKETS sign
  drawPiece([[B + 17, B + 18, B + 19, B + 20]], (g, { obj, shadow }) => {
    shadow(64, 30, 63, 2);
    obj((o) => {
      o.box(0, 13, 128, 17, [110, 30, 40], 1.2);
      o.rect(0, 13, 128, 3, GOLD);
      for (let x = 4; x < 124; x += 15) o.box(x, 19, 11, 8, sh(VELVET, 0.85), 1.15);
      o.rect(0, 28, 128, 2, [60, 20, 26]);
    });
    obj((o) => {
      // glass front with a frame and speaking holes
      o.rect(2, 0, 124, 2, [60, 30, 30]);
      for (const x of [2, 42, 84, 124]) o.rect(x, 0, 2, 14, GOLD);
      for (const x of [4, 86]) {
        o.rect(x, 2, 38, 11, alpha([180, 220, 236], 120));
        o.rect(x + 2, 3, 2, 8, alpha([255, 255, 255], 150));
        o.ellipse(x + 19, 10, 3, 1.5, [40, 40, 50]);
      }
      // TICKETS sign in the middle
      o.box(46, 1, 36, 8, [30, 20, 30], 1.4);
      for (let i = 0; i < 7; i++) o.rect(50 + i * 4, 3, 2, 4, [255, 214, 120]);
      // till 1 (left) and till 2 (right), each with a ticket printer
      for (const x of [14, 96]) {
        o.box(x, 7, 14, 7, [52, 56, 70], 1.3);
        o.rect(x + 2, 8, 9, 2, [120, 230, 160]);
        o.box(x + 15, 9, 8, 5, [214, 216, 222], 1.1);
        o.rect(x + 16, 5, 6, 5, [252, 236, 170]);
        o.rect(x + 16, 7, 6, 1, [200, 150, 80]);
      }
      // cash tray and ticket rolls
      o.box(52, 10, 14, 4, [60, 60, 70], 1.2);
      o.rect(54, 11, 4, 2, [140, 190, 120]);
      o.rect(59, 11, 5, 2, [200, 180, 120]);
      o.ellipse(72, 11, 3, 2.5, [252, 236, 170]);
      o.ellipse(72, 11, 1, 1, [200, 150, 80]);
    });
  });
  solid(B + 17, B + 18, B + 19, B + 20);
  // B+21..B+23 snack bar: the popcorn machine, the snack till with cups and a menu, and the end with a
  // glass sweets display and Tobias's note taped to it
  drawPiece([[B + 21, B + 22, B + 23]], (g, { obj, shadow }) => {
    shadow(48, 30, 47, 2);
    obj((o) => {
      o.box(0, 14, 96, 16, [110, 30, 40], 1.2);
      o.rect(0, 14, 96, 2, GOLD);
      for (let x = 4; x < 92; x += 15) o.box(x, 19, 11, 8, sh(VELVET, 0.85), 1.15);
      o.rect(0, 28, 96, 2, [60, 20, 26]);
    });
    obj((o) => {
      // popcorn machine
      o.box(5, 0, 22, 4, [214, 46, 46], 1.25);
      o.rect(5, 3, 22, 1, GOLD);
      o.box(6, 4, 20, 11, [200, 220, 230], 1.1);
      const r = rng(B + 21);
      for (let i = 0; i < 50; i++) o.set(7 + Math.floor(r() * 18), 8 + Math.floor(r() * 6), r() < 0.5 ? [255, 246, 214] : [246, 214, 120]);
      o.rect(7, 5, 2, 9, alpha([255, 255, 255], 90));
      // snack till with a signed-in badge reader, cups
      o.box(38, 6, 15, 9, [52, 56, 70], 1.3);
      o.rect(40, 7, 10, 3, [120, 230, 160]);
      o.rect(40, 11, 10, 2, [206, 210, 220]);
      o.box(53, 9, 4, 5, [240, 200, 60], 1.2);
      for (const x of [33, 58]) {
        o.box(x, 7, 5, 8, [250, 250, 250]);
        o.rect(x, 10, 5, 2, [214, 46, 46]);
        o.rect(x + 2, 4, 1, 3, [240, 200, 60]);
      }
      // sweets display and the note
      o.box(66, 3, 26, 12, [190, 220, 230], 1.1);
      for (let i = 0; i < 4; i++) o.ellipse(71 + i * 6, 10, 2.5, 3, [[230, 80, 120], [250, 200, 60], [100, 200, 120], [120, 140, 230]][i]);
      o.rect(67, 4, 2, 10, alpha([255, 255, 255], 120));
      o.box(80, 1, 11, 9, [255, 236, 140], 1.05, 0.85);
      for (let y = 3; y < 9; y += 2) o.rect(82, y, 7, 1, [130, 110, 80]);
      o.rect(84, 0, 3, 2, alpha([220, 220, 230], 200));
    });
  });
  solid(B + 21, B + 22, B + 23);
  // B+24 menu board over the snack bar: a lit black board with prices in white and a red popcorn box
  drawTile(B + 24, (g) => {
    cinemaWall(g);
    const o = canvas(T, T);
    o.box(2, 3, 28, 18, [24, 22, 28], 1.4);
    for (let j = 0; j < 4; j++) {
      o.rect(5, 6 + j * 3, 11 - ((j * 3) % 5), 1, [240, 240, 236]);
      o.rect(19, 6 + j * 3, 3, 1, [255, 214, 120]);
    }
    o.box(23, 5, 5, 8, [250, 250, 250]);
    o.rect(23, 7, 5, 1, [214, 46, 46]);
    o.rect(23, 10, 5, 1, [214, 46, 46]);
    o.ellipse(25.5, 4.5, 3, 2, [255, 244, 210]);
    o.outline();
    g.paste(o);
  });
  // B+25 soda fountain on the back counter: a steel dispenser with three coloured taps
  drawTile(B + 25, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(1, 14, 30, 15, [80, 36, 40], 1.2);
      o.box(5, 1, 22, 15, [180, 186, 196], 1.2);
      o.rect(7, 3, 18, 5, [40, 120, 200]);
      o.rect(9, 4, 10, 1, [250, 250, 250]);
      for (let i = 0; i < 3; i++) {
        o.rect(8 + i * 6, 9, 4, 3, [[214, 46, 46], [250, 200, 60], [60, 170, 90]][i]);
        o.rect(9 + i * 6, 12, 2, 2, [90, 96, 108]);
      }
      o.rect(5, 15, 22, 1, [120, 124, 134]);
    });
  });
  // B+26 an old 35 mm projector on a plinth in the foyer: two big reels, a lens and a brass plaque
  drawTile(B + 26, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(5, 22, 22, 8, [60, 46, 46], 1.25);
      o.rect(12, 25, 8, 2, GOLD);
      o.box(7, 12, 18, 10, [44, 50, 60], 1.3);
      o.box(22, 14, 6, 5, [70, 76, 90], 1.3);
      o.ellipse(28, 16.5, 2, 2, [200, 220, 240]);
      for (const [cx, cy] of [[10, 6], [21, 7]]) {
        o.ellipse(cx, cy, 6, 6, [150, 158, 172]);
        o.ellipse(cx, cy, 4.5, 4.5, [60, 64, 76]);
        o.ellipse(cx, cy, 1.5, 1.5, [190, 196, 206]);
        for (let a = 0; a < 3; a++) o.set(Math.round(cx + Math.cos(a * 2.1) * 3), Math.round(cy + Math.sin(a * 2.1) * 3), [150, 158, 172]);
      }
      o.rect(13, 11, 6, 1, [30, 30, 36]);
    });
  });
  // B+27 film standee: a cardboard cut-out of a hero in a trench coat holding the title card
  drawTile(B + 27, (g, { obj, shadow }) => {
    shadow(16, 30, 11, 2);
    obj((o) => {
      o.rect(8, 27, 16, 3, [150, 120, 90]);
      o.ellipse(16, 5, 4, 4.5, [232, 196, 160]);
      o.rect(12, 1, 8, 3, [50, 40, 36]);
      o.rect(10, 0, 12, 2, [50, 40, 36]);
      o.box(10, 9, 12, 17, [176, 150, 110], 1.2);
      o.rect(15, 9, 2, 17, sh([176, 150, 110], 0.8));
      o.box(4, 14, 24, 8, [36, 40, 86], 1.3);
      o.rect(6, 16, 20, 2, [240, 220, 140]);
      o.rect(8, 19, 16, 1, [200, 120, 110]);
    });
  });
  // B+28 film poster, B+29 Ben's clipboard and B+31 a padded hall door, hung on the cinema wall
  onWall(B + 28, 96, cinemaWall, 96);
  onWall(B + 29, 26, cinemaWall);
  onWall(B + 31, 102, cinemaWall, 102);
  // B+30 the fire marshal's notice: a white sign with a red border, a flame and a "max." people count
  drawTile(B + 30, (g) => {
    cinemaWall(g);
    const o = canvas(T, T);
    o.box(6, 3, 20, 22, [246, 244, 236], 1, 0.88);
    o.rect(6, 3, 20, 2, [214, 40, 40]);
    o.rect(6, 23, 20, 2, [214, 40, 40]);
    o.ellipse(11, 12, 3, 4, [240, 120, 40]);
    o.ellipse(11, 13, 1.5, 2.2, [255, 220, 100]);
    o.rect(16, 9, 8, 1, [60, 60, 70]);
    o.rect(16, 12, 6, 1, [60, 60, 70]);
    o.rect(9, 18, 14, 1, [60, 60, 70]);
    o.rect(9, 20, 10, 1, [60, 60, 70]);
    o.outline();
    g.paste(o);
  });
  solid(B + 24, B + 25, B + 26, B + 27, B + 30);
}
// --- end sql-cinema ---

// --- sql-train restyle (tiles 304-335) ---
// Night Train: EN 471 "Aurora", three carriages rolling through the night, seen side by side and
// joined by gangways over the track: the sleeping car with compartment 34, the dining car and the
// service car with the onboard computers, where the team boards.
{
  const B = blockOf('sql-train');
  const TEAK = [150, 96, 58];
  const CREAM = [226, 214, 186];
  const BALLAST = [58, 58, 66];
  const RAIL = [150, 156, 168];
  const PLUSH = [44, 70, 120];
  const BOOTH = [150, 40, 50];
  const PLATE = [120, 126, 138];
  /** The carriage's wall face: cream panels over teak veneer, the red waist band and a dark kick plate. */
  const carWall = (g) => {
    g.rect(0, 0, T, T, CREAM);
    g.noise(0, 0, T, T, 0.04, B);
    g.rect(0, 0, T, 2, sh(CREAM, 0.6));
    g.rect(0, 2, T, 1, sh(CREAM, 1.08));
    g.rect(0, 10, T, 12, TEAK);
    g.noise(0, 10, T, 12, 0.08, B + 40);
    for (let y = 12; y < 22; y += 3) g.rect(0, y, T, 1, alpha(sh(TEAK, 0.82), 140));
    g.rect(0, 10, T, 1, sh(TEAK, 1.3));
    g.rect(0, 22, T, 2, TRAIN_PANEL);
    g.rect(0, 24, T, 8, [64, 52, 50]);
    g.rect(0, 24, T, 1, sh([64, 52, 50], 1.3));
    g.rect(0, T - 1, T, 1, [40, 32, 32]);
  };
  // B+0 carriage wall front, B+1 in a left wall, B+2 in a right wall
  drawTile(B, carWall);
  drawTile(B + 1, turned(carWall, 'ccw'));
  drawTile(B + 2, turned(carWall, 'cw'));
  solid(B, B + 1, B + 2);
  // B+3 sleeping-car corridor floor: a navy carpet runner with an orange stripe pattern
  drawTile(B + 3, (g) => {
    g.rect(0, 0, T, T, PLUSH);
    g.noise(0, 0, T, T, 0.09, B + 3);
    for (const y of [3, 28]) g.rect(0, y, T, 1, [220, 140, 60]);
    for (let x = 0; x < T; x += 8) {
      g.rect(x + 2, 14, 4, 1, [220, 140, 60, 170]);
      g.rect(x + 3, 13, 2, 3, [220, 140, 60, 170]);
    }
  });
  // B+4 dining-car floor: cream and wine linoleum squares, laid diagonally
  drawTile(B + 4, (g) => {
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const d = Math.floor((x + y) / 8) + Math.floor((x - y + 64) / 8);
        g.set(x, y, d % 2 ? [204, 190, 166] : [160, 112, 100]);
      }
    g.noise(0, 0, T, T, 0.06, B + 4);
  });
  // B+5 the track rushing past between the cars: ballast, sleepers and two rails with motion streaks
  drawTile(B + 5, (g) => {
    g.rect(0, 0, T, T, BALLAST);
    g.noise(0, 0, T, T, 0.3, B + 5);
    for (const x of [4, 20]) g.rect(x, 4, 7, 24, [70, 56, 46]);
    for (const y of [8, 22]) {
      g.rect(0, y, T, 3, RAIL);
      g.rect(0, y, T, 1, sh(RAIL, 1.3));
      g.rect(0, y + 3, T, 1, [30, 30, 36]);
    }
    const r = rng(B + 5);
    for (let i = 0; i < 6; i++) g.rect(Math.floor(r() * 24), Math.floor(r() * T), 6 + Math.floor(r() * 6), 1, [200, 210, 230, 50]);
    g.rect(0, 0, T, 2, [20, 20, 26, 160]);
    g.rect(0, T - 2, T, 2, [20, 20, 26, 160]);
  });
  solid(B + 5);
  /** One half of a gangway: a checker-plate floor with the black rubber bellows folding along its outer side. */
  const gangway = (g) => {
    g.rect(0, 0, T, T, PLATE);
    for (let y = 1; y < T; y += 4) for (let x = (y % 8 === 1 ? 2 : 0) + 10; x < T; x += 4) g.rect(x, y, 2, 1, sh(PLATE, 1.25));
    g.noise(10, 0, 22, T, 0.06, B + 6);
    for (let x = 0; x < 10; x++) g.rect(x, 0, 1, T, x % 3 === 2 ? [20, 20, 24] : [46, 46, 54]);
    g.rect(10, 0, 1, T, [20, 20, 24]);
  };
  // B+6, B+7 gangway, left and right half (walkable)
  drawTile(B + 6, gangway);
  drawTile(B + 7, (g) => {
    const c = canvas(T, T);
    gangway(c);
    g.paste(c, 0, 0, true);
  });
  /** A gangway half where it passes through a carriage's wall face: the open sliding door's steel frame. */
  const gangwayDoor = (g) => {
    gangway(g);
    const wall = canvas(T, T);
    carWall(wall);
    for (let y = 0; y < T; y++) for (let x = 0; x < 6; x++) g.set(x, y, wall.get(x, y));
    g.rect(6, 0, 4, T, [170, 176, 188]);
    g.rect(6, 0, 1, T, [210, 216, 226]);
    g.rect(0, 0, T, 4, [170, 176, 188]);
    g.rect(0, 0, T, 1, [80, 84, 94]);
    g.rect(0, 4, T, 3, [0, 0, 0, 70]);
  };
  // B+8, B+9 gangway door in a carriage wall, left and right half (walkable)
  drawTile(B + 8, gangwayDoor);
  drawTile(B + 9, (g) => {
    const c = canvas(T, T);
    gangwayDoor(c);
    g.paste(c, 0, 0, true);
  });
  // B+10 window at night: stars, a moon and dark hills; B+11 compartment door, hung on the carriage wall
  drawTile(B + 10, (g) => {
    carWall(g);
    const o = canvas(T, T);
    o.box(3, 3, 26, 18, [196, 200, 208], 1.15);
    o.rect(5, 5, 22, 14, NIGHT);
    for (let j = 0; j < 14; j++) o.rect(5, 5 + j, 22, 1, alpha([60, 70, 120], j * 8));
    for (const [x, y] of [[7, 7], [12, 6], [19, 9], [25, 6], [9, 11]]) o.set(x, y, [230, 230, 250]);
    o.ellipse(21, 8, 2.5, 2.5, [244, 236, 196]);
    o.ellipse(22, 7, 2, 2, NIGHT);
    for (let x = 5; x < 27; x++) {
      const h = Math.round(3 + 2 * Math.sin(x / 3) + (x > 14 ? 2 : 0));
      o.rect(x, 19 - h, 1, h, [24, 36, 44]);
    }
    o.rect(5, 5, 22, 1, alpha([255, 255, 255], 60));
    o.outline();
    g.paste(o);
  });
  solid(B + 10);
  onWall(B + 11, 89, carWall, 89);
  // B+12 compartment 34's door, the attendant's report pinned to it and the door ajar
  drawTile(B + 12, (g) => {
    g.paste(tileCanvas(B + 11));
    g.rect(6, 2, 3, 28, [20, 18, 24]);
    const o = canvas(T, T);
    paper(o, 13, 6, 10, 12, [255, 250, 230]);
    o.rect(17, 5, 2, 2, [214, 50, 46]);
    o.outline();
    g.paste(o);
  });
  solid(B + 12);
  // B+13..B+16 the dining-car counter: a coffee machine, the conductor's handheld with his note
  // under it, a tray of glasses, and the till with a card terminal
  drawPiece([[B + 13, B + 14, B + 15, B + 16]], (g, { obj, shadow }) => {
    shadow(64, 30, 63, 2);
    obj((o) => {
      o.box(0, 13, 128, 4, [214, 218, 224], 1.1);
      o.box(1, 17, 126, 12, TEAK, 1.15);
      for (let x = 4; x < 124; x += 16) o.rect(x, 19, 12, 7, sh(TEAK, 0.85));
      o.rect(1, 27, 126, 2, [64, 52, 50]);
    });
    obj((o) => {
      // coffee machine
      o.box(6, 0, 20, 15, [60, 62, 70], 1.3);
      o.rect(9, 3, 14, 3, [200, 60, 50]);
      o.rect(12, 8, 2, 4, [170, 176, 188]);
      o.rect(18, 8, 2, 4, [170, 176, 188]);
      o.box(11, 11, 4, 3, [250, 250, 250]);
      // the handheld on its note, with the lanyard
      o.box(40, 2, 11, 12, [52, 56, 66], 1.4);
      o.rect(42, 4, 7, 5, [140, 210, 240]);
      o.rect(43, 6, 4, 1, [40, 80, 110]);
      o.rect(42, 10, 7, 2, [214, 60, 56]);
      for (let x = 52; x < 60; x++) o.set(x, 8 + Math.round(Math.sin(x * 0.9) * 2), [40, 100, 200]);
      // his note, tucked under the lanyard on the next tile
      paper(o, 58, 5, 11, 10, [255, 236, 140]);
      o.rect(62, 4, 3, 2, alpha([220, 220, 230], 200));
      // glasses on a tray
      o.box(72, 10, 18, 4, [170, 176, 188], 1.2);
      for (const x of [74, 79, 84]) {
        o.rect(x, 5, 4, 5, alpha([220, 236, 240], 220));
        o.rect(x + 1, 7, 2, 2, [200, 120, 60]);
      }
      // till and card terminal
      o.box(100, 3, 16, 11, [52, 56, 70], 1.3);
      o.rect(102, 5, 12, 3, [120, 230, 160]);
      for (let i = 0; i < 3; i++) o.rect(102 + i * 4, 10, 3, 2, [206, 210, 220]);
      o.box(118, 7, 6, 7, [36, 36, 40], 1.3);
      o.rect(119, 8, 4, 2, [140, 210, 240]);
    });
  });
  solid(B + 13, B + 14, B + 15, B + 16);
  /** A dining booth's bench facing right: a tall red backrest on the left, the seat beside it. */
  const booth = (g) => {
    g.ellipse(16, 29, 12, 2, [0, 0, 0, 60]);
    const o = canvas(T, T);
    o.box(12, 8, 16, 18, BOOTH, 1.2);
    o.rect(14, 11, 12, 1, sh(BOOTH, 0.8));
    o.box(4, 2, 9, 26, sh(BOOTH, 0.8), 1.3);
    o.rect(5, 3, 7, 1, [222, 182, 82]);
    o.rect(6, 28, 3, 2, [60, 40, 30]);
    o.rect(23, 26, 3, 3, [60, 40, 30]);
    o.outline();
    g.paste(o);
  };
  // B+17 booth bench facing right, B+18 facing left (seats: walkable)
  drawTile(B + 17, booth);
  drawTile(B + 18, (g) => {
    const c = canvas(T, T);
    booth(c);
    g.paste(c, 0, 0, true);
  });
  // B+19 dining table with a newspaper next to the lamp
  drawTile(B + 19, (g) => {
    g.paste(tileCanvas(90));
    const o = canvas(T, T);
    o.box(4, 13, 11, 9, [238, 234, 222], 1, 0.85);
    o.rect(5, 14, 9, 2, [50, 50, 60]);
    for (let y = 17; y < 21; y += 2) o.rect(5, y, 8, 1, [150, 150, 160]);
    o.outline([120, 110, 100]);
    g.paste(o);
  });
  solid(B + 19);
  // B+20 card reader server: a slim grey cabinet with a column of reader lights and a card slot
  drawTile(B + 20, (g, { obj, shadow }) => {
    shadow(16, 30, 12, 2);
    obj((o) => {
      o.box(5, 0, 22, 30, [126, 132, 144], 1.2);
      o.rect(7, 3, 18, 8, [30, 40, 50]);
      for (let j = 0; j < 3; j++) o.rect(9, 5 + j * 2, 8 - j * 2, 1, [140, 210, 240]);
      for (let j = 0; j < 6; j++) {
        o.set(9, 14 + j * 2, j === 3 ? [240, 70, 60] : [90, 220, 110]);
        o.rect(11, 14 + j * 2, 7, 1, [90, 96, 108]);
      }
      o.box(20, 14, 4, 10, [60, 64, 74], 1.3);
      o.rect(21, 15, 2, 4, [244, 204, 72]);
    });
  });
  // B+21 the sign by the door panel, on the carriage wall: yellow, with a door pictogram and a key
  drawTile(B + 21, (g) => {
    carWall(g);
    const o = canvas(T, T);
    o.box(5, 3, 22, 18, [244, 204, 60], 1.1);
    o.rect(7, 5, 18, 3, [30, 30, 36]);
    o.box(8, 10, 7, 9, [80, 84, 94], 1.2);
    o.rect(13, 14, 1, 2, [244, 204, 60]);
    o.rect(17, 12, 6, 3, [30, 30, 36]);
    o.rect(19, 15, 2, 3, [30, 30, 36]);
    o.outline();
    g.paste(o);
  });
  // B+22 the route map on the carriage wall: a white strip with the line, its stations and a red "you are here"
  drawTile(B + 22, (g) => {
    carWall(g);
    const o = canvas(T, T);
    o.box(2, 4, 28, 15, [246, 244, 236], 1, 0.88);
    o.rect(4, 11, 24, 2, [40, 80, 160]);
    for (const x of [5, 11, 16, 22, 27]) {
      o.ellipse(x, 11.5, 2, 2, [250, 250, 250]);
      o.ellipse(x, 11.5, 1, 1, [40, 80, 160]);
      o.rect(x - 1, 15, 3, 1, [120, 120, 130]);
    }
    o.rect(18, 6, 2, 4, [214, 50, 46]);
    o.rect(4, 6, 8, 1, [60, 60, 70]);
    o.outline();
    g.paste(o);
  });
  // B+23 the driver's log: a grey desk with the open logbook, a pen and the driver's cap
  drawTile(B + 23, (g, { obj, shadow }) => {
    shadow(16, 29, 14, 2);
    obj((o) => {
      trainDesk(o);
      o.box(3, 7, 17, 11, [40, 60, 110], 1.2);
      o.rect(4, 8, 7, 9, [250, 246, 230]);
      o.rect(12, 8, 7, 9, [250, 246, 230]);
      for (let y = 10; y < 16; y += 2) {
        o.rect(5, y, 5, 1, [130, 130, 145]);
        o.rect(13, y, 4, 1, [130, 130, 145]);
      }
      o.ellipse(25, 12, 5, 3.5, [40, 50, 80]);
      o.rect(21, 13, 9, 2, [30, 30, 40]);
      o.rect(23, 10, 4, 1, [222, 182, 82]);
    });
  });
  // B+24 luggage rack (above the avatars): a brass rack under the ceiling with a suitcase and a bag
  drawTile(B + 24, (g) => {
    const o = canvas(T, T);
    o.rect(0, 4, T, 2, [212, 170, 80]);
    o.rect(0, 12, T, 2, [212, 170, 80]);
    for (let x = 2; x < T; x += 5) o.rect(x, 5, 1, 8, [180, 140, 60]);
    o.box(4, 0, 14, 10, [110, 70, 44], 1.25);
    o.rect(9, 0, 4, 1, [60, 40, 30]);
    o.box(20, 3, 10, 8, [60, 90, 70], 1.25);
    o.outline();
    g.paste(o);
    g.rect(0, 15, T, 3, [0, 0, 0, 40]);
  });
  // B+25 ceiling light (above the avatars): a frosted dome in a brass ring, with a warm glow
  drawTile(B + 25, (g) => {
    for (let j = 0; j < 7; j++) g.ellipse(16, 16, 15 - j, 12 - j, [255, 226, 160, 16]);
    const o = canvas(T, T);
    o.ellipse(16, 16, 8, 5, [212, 170, 80]);
    o.ellipse(16, 15, 6, 3.5, [255, 248, 220]);
    o.ellipse(15, 14, 2.5, 1.2, [255, 255, 255]);
    o.outline();
    g.paste(o);
  });
  // B+26 the attendant's samovar on a little cabinet, with glasses in metal holders
  drawTile(B + 26, (g, { obj, shadow }) => {
    shadow(16, 30, 12, 2);
    obj((o) => {
      o.box(3, 16, 26, 13, TEAK, 1.2);
      o.rect(5, 19, 22, 1, sh(TEAK, 0.75));
      o.ellipse(13, 10, 7, 7, [212, 170, 80]);
      o.ellipse(11, 8, 2.5, 3, sh([212, 170, 80], 1.3));
      o.box(10, 1, 6, 3, [180, 140, 60], 1.2);
      o.rect(19, 10, 4, 2, [180, 140, 60]);
      for (const x of [22, 26]) {
        o.box(x - 1, 9, 4, 6, [170, 176, 188], 1.2);
        o.rect(x, 10, 2, 3, [170, 90, 40]);
      }
    });
  });
  // B+27 the emergency brake on the carriage wall: a red handle in a glass-fronted box, its seal broken
  drawTile(B + 27, (g) => {
    carWall(g);
    const o = canvas(T, T);
    o.box(8, 4, 16, 16, [214, 46, 46], 1.2);
    o.rect(10, 6, 12, 12, [240, 236, 228]);
    o.rect(12, 9, 8, 3, [214, 46, 46]);
    o.rect(15, 12, 2, 4, [80, 84, 94]);
    o.rect(10, 6, 4, 1, alpha([255, 255, 255], 200));
    o.outline();
    g.paste(o);
    g.rect(22, 18, 2, 4, [214, 46, 46]);
    g.set(24, 21, [214, 46, 46]);
  });
  // B+28 mail sacks and parcels in the service car
  drawTile(B + 28, (g, { obj, shadow }) => {
    shadow(16, 29, 14, 2);
    obj((o) => {
      o.ellipse(10, 20, 8, 9, [196, 176, 130]);
      o.rect(8, 9, 4, 3, [140, 110, 70]);
      o.rect(6, 18, 8, 1, [150, 130, 90]);
      o.box(15, 13, 14, 15, KRAFT, 1.2);
      o.rect(21, 13, 2, 15, [200, 180, 140]);
      o.box(17, 6, 10, 8, sh(KRAFT, 1.08), 1.2);
      o.rect(18, 9, 5, 2, [250, 250, 250]);
    });
  });
  // B+29 an outside door in the carriage wall: a narrow door with a drop window and a square-key lock
  drawTile(B + 29, (g) => {
    carWall(g);
    const o = canvas(T, T);
    o.box(6, 1, 20, 31, [176, 60, 56], 1.2);
    o.rect(9, 4, 14, 10, NIGHT);
    for (const [x, y] of [[11, 6], [18, 8], [14, 11]]) o.set(x, y, [230, 230, 250]);
    o.rect(9, 4, 14, 1, alpha([255, 255, 255], 80));
    o.rect(20, 18, 3, 6, [200, 204, 214]);
    o.rect(10, 20, 3, 3, [60, 64, 74]);
    o.rect(11, 21, 1, 1, [244, 204, 72]);
    o.outline();
    g.paste(o);
  });
  solid(B + 20, B + 21, B + 22, B + 23, B + 26, B + 27, B + 28, B + 29);
  // B+30 rainwater and wet leaves blown in under the outside door (decor)
  drawTile(B + 30, (g) => {
    g.ellipse(16, 12, 13, 7, [90, 120, 160, 110]);
    g.ellipse(13, 10, 7, 3, [160, 190, 230, 120]);
    for (const [x, y, c] of [[8, 6, [176, 110, 50]], [22, 16, [150, 120, 40]], [18, 4, [190, 90, 40]]]) {
      g.ellipse(x, y, 2.5, 1.5, c);
      g.set(x + 2, y, sh(c, 0.6));
    }
    for (const [x, y] of [[10, 22], [20, 26]]) g.ellipse(x, y, 3, 1.5, [90, 120, 160, 90]);
  });
  // B+31 dining-car window: the night window with red curtains drawn to the sides
  drawTile(B + 31, (g) => {
    g.paste(tileCanvas(B + 10));
    const o = canvas(T, T);
    for (const [x, dir] of [[1, 1], [31, -1]]) {
      for (let j = 0; j < 22; j++) {
        const w = Math.round(6 - Math.abs(j - 13) * 0.25);
        o.rect(dir > 0 ? x : x - w, 1 + j, w, 1, BOOTH);
      }
      o.rect(dir > 0 ? x + 2 : x - 3, 1, 1, 21, sh(BOOTH, 0.7));
    }
    o.rect(0, 0, T, 2, [212, 170, 80]);
    o.outline();
    g.paste(o);
  });
  solid(B + 31);
}
// --- end sql-train ---

// --- pandas-market restyle (tiles 336-367) ---
// Market Day: Kleeberg's covered market hall. Red brick walls with tall arched windows, a stone-slab
// entrance hall under the station clock, two rows of stalls under striped awnings with the fountain
// in the north row, a loading corner, a café corner and Greta's office in the south-east.
{
  const B = blockOf('pandas-market');
  const BRICK = [158, 78, 58];
  const MORTAR = [190, 162, 140];
  const CREAM = [228, 214, 184];
  const IRON = [46, 78, 66];
  const SLAB = [198, 190, 174];
  const STONE = [176, 178, 186];
  const WATER = [86, 158, 210];
  const PLANK = [168, 118, 72];
  /** The hall's wall face: red brick under a cream cornice, above a dark green plinth. */
  const brickWall = (g) => {
    g.rect(0, 0, T, T, BRICK);
    for (let y = 5, r = 0; y < T - 6; y += 5, r++) {
      g.rect(0, y, T, 1, MORTAR);
      for (let x = r % 2 ? 2 : 10; x < T; x += 16) g.rect(x, y - 4, 1, 4, MORTAR);
    }
    g.noise(0, 0, T, T, 0.1, B);
    g.rect(0, 0, T, 2, sh(BRICK, 0.55));
    g.rect(0, 2, T, 3, CREAM);
    g.rect(0, 2, T, 1, sh(CREAM, 1.1));
    g.rect(0, 4, T, 1, sh(CREAM, 0.72));
    g.rect(0, T - 6, T, 6, IRON);
    g.rect(0, T - 6, T, 1, sh(IRON, 1.45));
    g.rect(0, T - 1, T, 1, sh(IRON, 0.7));
  };
  // B+0 brick wall front, B+1 / B+2 the same in a left and a right wall
  drawTile(B, brickWall);
  drawTile(B + 1, turned(brickWall, 'ccw'));
  drawTile(B + 2, turned(brickWall, 'cw'));
  // B+3 a tall arched window in the brick wall, iron glazing bars and daylight
  drawTile(B + 3, (g) => {
    brickWall(g);
    const o = canvas(T, T);
    o.ellipse(16, 12, 10, 8, CREAM);
    o.rect(6, 12, 20, 14, CREAM);
    o.ellipse(16, 12.5, 8, 6.5, IRON);
    o.rect(8, 12, 16, 13, IRON);
    const glass = canvas(T, T);
    glass.ellipse(16, 13, 7, 5.5, [180, 216, 236]);
    glass.rect(9, 13, 14, 11, [180, 216, 236]);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const p = glass.get(x, y);
      if (p[3]) o.set(x, y, sh(p, 1.12 - y * 0.012));
    }
    o.rect(15, 7, 2, 18, IRON);
    o.rect(9, 17, 14, 1, IRON);
    for (let i = 0; i < 4; i++) o.set(11 + i, 15 - i, [250, 252, 255]);
    o.rect(6, 25, 20, 2, sh(CREAM, 0.9));
    o.outline();
    g.paste(o);
  });
  solid(B, B + 1, B + 2, B + 3);
  // B+4 the entrance hall floor: big worn stone slabs
  drawTile(B + 4, (g) => {
    g.rect(0, 0, T, T, sh(SLAB, 0.78));
    const r = rng(B + 4);
    for (const [x, y, w, h] of [[0, 0, 15, 15], [16, 0, 16, 9], [16, 10, 16, 21], [0, 16, 15, 15]]) {
      const s = sh(SLAB, 0.93 + r() * 0.12);
      g.rect(x + 1, y + 1, w - 1, h - 1, s);
      g.rect(x + 1, y + 1, w - 1, 1, sh(s, 1.08));
    }
    g.noise(0, 0, T, T, 0.07, B + 4);
    for (const [x, y] of [[5, 6], [22, 4], [27, 20], [9, 24]]) g.set(x, y, sh(SLAB, 0.7));
  });
  // B+5 market litter (decor): straw, a cabbage leaf, a dropped cherry tomato
  drawTile(B + 5, (g) => {
    const r = rng(B + 5);
    for (let i = 0; i < 14; i++) {
      const x = 2 + Math.floor(r() * 26), y = 2 + Math.floor(r() * 26), len = 3 + Math.floor(r() * 4);
      const col = r() < 0.5 ? [222, 190, 96] : [196, 160, 74];
      for (let k = 0; k < len; k++) g.set(x + k, y + Math.floor(k * (r() < 0.5 ? 0.4 : -0.3)), col);
    }
    g.ellipse(20, 21, 5, 3.5, [110, 170, 80]);
    g.ellipse(20, 21, 3, 2, [150, 206, 110]);
    g.rect(16, 21, 7, 1, [190, 226, 160]);
    g.ellipse(9, 12, 2, 2, [214, 48, 40]);
    g.set(9, 11, [255, 140, 120]);
    g.set(9, 10, [80, 150, 60]);
  });
  // B+6..B+9 the fountain (2 x 2): a round stone basin with coins, a pedestal bowl and a spout
  drawPiece([[B + 6, B + 7], [B + 8, B + 9]], (g, { obj, shadow }) => {
    shadow(32, 54, 31, 7);
    obj((o) => {
      o.ellipse(32, 42, 30, 17, sh(STONE, 0.82));
      o.ellipse(32, 39, 30, 16, STONE);
      o.ellipse(32, 38, 29, 14, sh(STONE, 1.15));
      o.ellipse(32, 40, 25, 11.5, sh(WATER, 0.8));
      o.ellipse(32, 41, 24, 10, WATER);
      o.noise(4, 22, 56, 36, 0.08, B + 6);
    });
    // coins on the bottom and ripples
    for (const [x, y] of [[16, 41], [21, 46], [43, 44], [47, 38], [26, 47], [40, 48]]) {
      g.rect(x, y, 2, 1, [236, 200, 90]);
      g.set(x, y + 1, [180, 140, 50]);
    }
    for (const [cx, cy, rx] of [[32, 42, 14], [32, 42, 20]]) for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      if (a % 3) g.set(cx + Math.cos(t) * rx, cy + Math.sin(t) * rx * 0.42, [190, 228, 248, 160]);
    }
    obj((o) => {
      o.box(28, 20, 8, 22, STONE, 1.2);
      o.rect(29, 22, 2, 18, sh(STONE, 1.25));
      o.ellipse(32, 21, 12, 5, sh(STONE, 0.85));
      o.ellipse(32, 20, 12, 4.5, STONE);
      o.ellipse(32, 20, 10, 3, sh(WATER, 0.9));
      o.box(30, 10, 4, 10, STONE, 1.2);
      o.ellipse(32, 10, 3.5, 2, sh(STONE, 1.2));
    });
    // the jet and the water falling from the bowl
    g.rect(31, 1, 2, 9, [170, 220, 250, 220]);
    g.rect(31, 1, 1, 7, [240, 250, 255, 220]);
    for (const [x, y] of [[28, 4], [36, 3], [26, 8], [38, 7], [33, 0]]) g.set(x, y, [200, 236, 255]);
    for (const x of [20, 21, 43, 44]) g.rect(x, 22, 1, 15, [170, 220, 250, 170]);
    for (const x of [21, 43]) g.rect(x, 24, 1, 10, [240, 250, 255, 170]);
    for (const [x, y] of [[18, 38], [23, 37], [41, 37], [46, 38]]) g.ellipse(x, y, 2, 1, [230, 246, 255, 200]);
  });
  solid(B + 6, B + 7, B + 8, B + 9);
  /** A striped awning seen from above and the front: slanted cloth with a scalloped valance. */
  const awning = (stripe) => (g, { obj }) =>
    obj((o) => {
      for (let x = 1; x < 63; x++) {
        const col = Math.floor((x - 1) / 7) % 2 ? [246, 240, 226] : stripe;
        for (let y = 3; y < 19; y++) o.set(x, y, sh(col, 0.8 + (y - 3) * 0.018));
        for (let y = 19; y < 23; y++) o.set(x, y, col);
      }
      o.rect(1, 3, 62, 1, sh(stripe, 0.6));
      for (let x = 1; x < 62; x += 7) {
        const col = Math.floor((x - 1) / 7) % 2 ? [246, 240, 226] : stripe;
        o.ellipse(x + 3.5, 23, 3.5, 3, col);
      }
      o.rect(1, 19, 62, 1, sh(stripe, 1.3));
      o.rect(1, 22, 62, 1, alpha(sh(stripe, 0.7), 160));
    });
  // B+10/11 red, B+12/13 green, B+14/15 blue awning (above the avatars)
  drawPiece([[B + 10, B + 11]], awning([200, 60, 52]));
  drawPiece([[B + 12, B + 13]], awning([64, 146, 84]));
  drawPiece([[B + 14, B + 15]], awning([62, 112, 186]));
  /**
   * One half of a stall counter: a wooden top with goods, plank front, a pole at the outer end.
   * 'L' halves end on the left, 'R' halves on the right, so any L and R make a two-tile stall.
   */
  const counter = (side, goods) => (g, { obj, shadow }) => {
    shadow(side === 'L' ? 18 : 14, 30, 16, 2);
    obj((o) => {
      const x0 = side === 'L' ? 1 : 0, w = side === 'L' ? T - 1 : T - 1;
      o.box(x0, 12, w, 5, sh(PLANK, 1.2), 1.15, 0.85);
      o.rect(x0, 17, w, 12, sh(PLANK, 0.82));
      for (let x = x0 + 5; x < x0 + w; x += 6) o.rect(x, 17, 1, 12, sh(PLANK, 0.62));
      o.rect(x0, 17, w, 1, sh(PLANK, 0.55));
      o.rect(x0, 28, w, 1, sh(PLANK, 0.55));
      const px = side === 'L' ? 1 : T - 3;
      o.box(px, 0, 2, 30, WOOD_DARK, 1.3);
      goods(o);
    });
  };
  const jar = (o, x, y) => {
    o.box(x, y + 2, 5, 6, [232, 156, 30], 1.25);
    o.rect(x, y, 5, 2, [250, 246, 236]);
    o.set(x + 1, y + 4, [255, 224, 140]);
    o.rect(x + 1, y + 6, 3, 1, [250, 240, 200]);
  };
  const loaf = (o, x, y) => {
    o.ellipse(x, y, 5, 3, [196, 132, 64]);
    o.ellipse(x, y - 1, 4, 1.5, [222, 164, 92]);
    for (let i = -2; i <= 2; i += 2) o.set(x + i, y - 1, [150, 96, 46]);
  };
  // B+16/17 vegetable stall: tomatoes, carrots, cabbages and potatoes
  drawTile(B + 16, counter('L', (o) => {
    crate(o, 4, 4, 13, [214, 52, 44]);
    crate(o, 18, 4, 13, [236, 132, 40]);
  }));
  drawTile(B + 17, counter('R', (o) => {
    for (const x of [6, 13]) { o.ellipse(x, 10, 4, 3.5, [110, 170, 80]); o.ellipse(x - 1, 9, 2, 1.5, [170, 216, 130]); }
    crate(o, 18, 4, 10, [176, 136, 86]);
  }));
  // B+18/19 honey stall: jars, a honeycomb frame and a candle
  drawTile(B + 18, counter('L', (o) => {
    for (const x of [5, 11, 17, 23]) jar(o, x, 4);
  }));
  drawTile(B + 19, counter('R', (o) => {
    o.box(3, 1, 13, 12, [150, 104, 60]);
    o.rect(5, 3, 9, 8, [236, 176, 50]);
    for (let y = 3; y < 11; y += 2) for (let x = 5 + (y % 4 ? 1 : 0); x < 14; x += 2) o.set(x, y, [200, 130, 30]);
    jar(o, 18, 4);
    o.box(25, 5, 3, 7, [246, 230, 170]);
    o.set(26, 4, [255, 200, 80]);
  }));
  // B+20/21 bread and cheese stall
  drawTile(B + 20, counter('L', (o) => {
    o.box(4, 7, 26, 4, [214, 180, 120]);
    loaf(o, 10, 7);
    loaf(o, 22, 7);
    o.ellipse(16, 5, 3, 2.5, [210, 150, 80]);
  }));
  drawTile(B + 21, counter('R', (o) => {
    o.ellipse(9, 9, 7, 4, [236, 200, 90]);
    o.rect(2, 9, 14, 3, [214, 176, 70]);
    o.ellipse(9, 8, 6, 3, [248, 222, 120]);
    o.box(18, 5, 8, 7, [240, 210, 100]);
    for (const [x, y] of [[20, 7], [23, 9], [7, 7]]) o.set(x, y, [200, 160, 60]);
  }));
  // B+22 stall half with the card terminal: a card reader, a printed receipt and apples
  drawTile(B + 22, counter('L', (o) => {
    crate(o, 4, 4, 11, [200, 50, 50]);
    o.box(18, 2, 9, 12, [54, 58, 70], 1.3);
    o.rect(19, 3, 7, 4, [130, 220, 170]);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) o.set(20 + c * 2, 9 + r * 2, [210, 214, 222]);
    o.box(27, 4, 4, 9, [250, 248, 238], 1, 0.85);
    o.rect(28, 6, 2, 1, [140, 140, 150]);
    o.rect(28, 8, 2, 1, [140, 140, 150]);
  }));
  // B+23 stall half with handwritten price tags stuck into the produce
  drawTile(B + 23, counter('R', (o) => {
    crate(o, 2, 5, 12, [236, 200, 70]);
    crate(o, 15, 5, 12, [120, 176, 70]);
    for (const [x, y, col] of [[4, 1, [250, 248, 238]], [16, 0, [255, 236, 140]], [23, 2, [250, 248, 238]]]) {
      o.rect(x + 3, y + 5, 1, 4, WOOD_DARK);
      o.box(x, y, 7, 5, col, 1, 0.85);
      o.rect(x + 1, y + 2, 4, 1, [60, 60, 70]);
    }
  }));
  solid(...range(B + 16, B + 23));
  // B+24 bunting (above the avatars): a sagging string of coloured pennants, seamless left to right
  drawTile(B + 24, (g) => {
    const o = canvas(T, T);
    const yAt = (x) => 3 + Math.round(5 * Math.sin((x / T) * Math.PI));
    const cols = [[220, 60, 52], [240, 200, 60], [62, 112, 186], [70, 160, 90]];
    for (let i = 0; i < 4; i++) {
      const cx = 4 + i * 8, y = yAt(cx);
      for (let j = 0; j < 9; j++) o.rect(cx - 3 + Math.floor(j / 3), y + 1 + j, Math.max(1, 7 - 2 * Math.floor(j / 3) * 1.15), 1, cols[i]);
      o.rect(cx - 3, y + 1, 7, 1, sh(cols[i], 1.3));
    }
    o.outline();
    g.paste(o);
    for (let x = 0; x < T; x++) g.set(x, yAt(x), [70, 60, 50]);
  });
  // B+25 the hall clock (above the avatars), hanging on a rod, at two o'clock: envelope time
  drawTile(B + 25, (g) => {
    const o = canvas(T, T);
    o.rect(15, 0, 2, 6, [50, 54, 60]);
    o.box(11, 5, 10, 3, IRON);
    o.ellipse(16, 17, 10, 10, IRON);
    o.ellipse(16, 17, 8, 8, [250, 248, 236]);
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2;
      o.set(16 + Math.sin(t) * 7, 17 - Math.cos(t) * 7, [60, 60, 66]);
    }
    o.rect(16, 11, 1, 6, [30, 30, 36]);
    for (let k = 0; k < 5; k++) o.set(16 + k * 0.9, 17 - k * 0.5, [30, 30, 36]);
    o.set(16, 17, [200, 50, 40]);
    o.rect(9, 12, 2, 1, [255, 255, 255, 180]);
    o.outline();
    g.paste(o);
  });
  // B+26 the market plan on the brick wall: two rows of six pitches with the fountain in the north row
  drawTile(B + 26, (g) => {
    brickWall(g);
    const o = canvas(T, T);
    o.box(3, 5, 26, 20, [246, 238, 214], 1, 0.86);
    for (let i = 0; i < 6; i++) {
      const x = 5 + i * 4 + (i >= 4 ? 2 : 0);
      o.rect(x, 8, 3, 4, [[200, 60, 52], [64, 146, 84], [62, 112, 186]][i % 3]);
      o.rect(x, 16, 3, 4, [[64, 146, 84], [62, 112, 186], [200, 60, 52]][i % 3]);
    }
    o.ellipse(22, 10, 1.5, 1.5, WATER);
    o.rect(5, 13, 22, 2, [196, 190, 176]);
    o.box(22, 21, 5, 3, [150, 104, 60]);
    o.rect(5, 22, 6, 1, [90, 90, 100]);
    o.outline();
    g.paste(o);
  });
  // B+27 the market rules, a framed notice with a red seal, and B+28 the helper rota on a clipboard
  drawTile(B + 27, (g) => {
    brickWall(g);
    const o = canvas(T, T);
    o.box(5, 5, 22, 20, WOOD_DARK, 1.3);
    paper(o, 7, 7, 18, 16);
    o.rect(9, 8, 14, 1, [40, 40, 50]);
    o.ellipse(22, 20, 2.5, 2.5, [200, 50, 40]);
    o.outline();
    g.paste(o);
  });
  onWall(B + 28, 26, brickWall);
  solid(B + 26, B + 27);
  // B+29 sack barrow loaded with potato sacks
  drawTile(B + 29, (g, { obj, shadow }) => {
    shadow(16, 29, 12, 2);
    obj((o) => {
      o.rect(6, 2, 2, 26, [70, 74, 84]);
      o.rect(24, 2, 2, 26, [70, 74, 84]);
      o.rect(6, 2, 20, 2, [70, 74, 84]);
      o.box(5, 25, 22, 3, [90, 94, 104]);
      const sack = [190, 160, 112];
      o.ellipse(16, 20, 9, 6, sack);
      o.ellipse(16, 11, 8, 6, sh(sack, 1.08));
      o.rect(13, 5, 6, 2, sh(sack, 0.8));
      o.rect(11, 18, 10, 1, sh(sack, 0.8));
      o.ellipse(5, 27, 3, 3, [40, 40, 46]);
      o.ellipse(27, 27, 3, 3, [40, 40, 46]);
    });
  });
  solid(B + 29);
  // B+30 a wet patch around the fountain (decor): darker stone, a puddle and splashes
  drawTile(B + 30, (g) => {
    g.ellipse(13, 14, 10, 5, [40, 60, 90, 70]);
    g.ellipse(20, 18, 8, 4, [40, 60, 90, 70]);
    g.ellipse(13, 14, 8, 3.5, [96, 168, 220, 150]);
    g.ellipse(20, 18, 6, 2.5, [96, 168, 220, 150]);
    g.rect(9, 13, 5, 1, [235, 248, 255, 220]);
    g.rect(18, 17, 3, 1, [235, 248, 255, 220]);
    for (const [x, y] of [[26, 8], [5, 24], [27, 25], [21, 5], [6, 6], [15, 26]]) {
      g.rect(x, y, 2, 1, [110, 180, 230, 220]);
      g.set(x, y, [235, 248, 255]);
    }
  });
  // B+31 a plain wooden bench (a seat, not solid)
  drawTile(B + 31, (g, { obj, shadow }) => {
    shadow(16, 28, 14, 2);
    obj((o) => {
      o.rect(4, 18, 3, 10, WOOD_DARK);
      o.rect(25, 18, 3, 10, WOOD_DARK);
      o.box(1, 12, 30, 7, PLANK, 1.25);
      o.rect(1, 15, 30, 1, sh(PLANK, 0.75));
    });
  });
}
// --- end pandas-market ---

// --- ts-nordlys restyle (tiles 368-399) ---
// Station Nordlys: a polar research station in safe mode, the heating off and frost creeping in.
// Insulated white wall panels with an orange band, a boot room at the airlock, a generator room with
// the fuel tank and the stationarity gauge, the mess under the aurora window, the chief's office,
// the ops corridor, the cold lab, the echo sounder's instrument room and the supply depot.
{
  const B = blockOf('ts-nordlys');
  const PANEL = [212, 220, 228];
  const BAND = [226, 112, 46];
  const SKIRT = [70, 78, 92];
  const ICE = [214, 238, 250];
  const STEEL = [150, 160, 174];
  const RUBBER = [72, 78, 88];
  const GREEN = [110, 240, 170];
  /** The station's wall face: insulated white panels with rivets, an orange band and a grey skirting. */
  const stationWall = (g) => {
    g.rect(0, 0, T, T, PANEL);
    g.noise(0, 0, T, T, 0.04, B);
    g.rect(0, 0, T, 2, sh(PANEL, 0.62));
    g.rect(0, 2, T, 1, sh(PANEL, 1.08));
    for (const x of [0, 16]) { g.rect(x, 3, 1, T - 9, sh(PANEL, 0.84)); g.rect(x + 1, 3, 1, T - 9, sh(PANEL, 1.06)); }
    for (const [x, y] of [[4, 5], [12, 5], [20, 5], [28, 5]]) g.set(x, y, sh(PANEL, 0.7));
    g.rect(0, 15, T, 4, BAND);
    g.rect(0, 15, T, 1, sh(BAND, 1.25));
    g.rect(0, 18, T, 1, sh(BAND, 0.75));
    g.rect(0, T - 6, T, 6, SKIRT);
    g.rect(0, T - 6, T, 1, sh(SKIRT, 1.4));
    g.rect(0, T - 1, T, 1, sh(SKIRT, 0.7));
  };
  /** Frost in the corners of a window pane (x, y, w, h). */
  const frost = (o, x, y, w, h) => {
    for (let j = 0; j < 5; j++) {
      o.rect(x, y + j, 5 - j, 1, alpha(ICE, 230));
      o.rect(x + w - 5 + j, y + h - 1 - j, 5 - j, 1, alpha(ICE, 230));
      o.rect(x + w - 5 + j, y + j, 5 - j, 1, alpha(ICE, 160));
    }
  };
  // B+0 station wall, B+1 / B+2 the same in a left and a right wall
  drawTile(B, stationWall);
  drawTile(B + 1, turned(stationWall, 'ccw'));
  drawTile(B + 2, turned(stationWall, 'cw'));
  // B+3 a frosted window full of northern lights, with a sine wave drawn in the frost
  drawTile(B + 3, (g) => {
    stationWall(g);
    const o = canvas(T, T);
    o.box(3, 3, 26, 21, [96, 104, 120], 1.2);
    o.rect(5, 5, 22, 17, [14, 20, 44]);
    for (let x = 5; x < 27; x++) {
      const y1 = 10 + Math.round(3 * Math.sin(x / 3));
      for (let j = 0; j < 7; j++) o.set(x, y1 + j, alpha([90, 240, 150], 200 - j * 26));
      const y2 = 7 + Math.round(2 * Math.sin(x / 4 + 1));
      for (let j = 0; j < 4; j++) o.set(x, y2 + j, alpha([190, 110, 240], 150 - j * 30));
    }
    for (const [x, y] of [[7, 6], [22, 7], [12, 19], [25, 18]]) o.set(x, y, [255, 255, 255]);
    o.rect(5, 19, 22, 3, [226, 236, 246]);
    frost(o, 5, 5, 22, 17);
    for (let x = 8; x < 24; x++) o.set(x, 15 + Math.round(2 * Math.sin((x - 8) / 2.5)), [250, 252, 255]);
    o.outline();
    g.paste(o);
  });
  // B+4 a frosted window onto the polar night: stars, a snowdrift against the glass
  drawTile(B + 4, (g) => {
    stationWall(g);
    const o = canvas(T, T);
    o.box(3, 3, 26, 21, [96, 104, 120], 1.2);
    o.rect(5, 5, 22, 17, [18, 26, 54]);
    for (let j = 0; j < 17; j++) o.rect(5, 5 + j, 22, 1, alpha([60, 90, 150], j * 6));
    for (const [x, y] of [[8, 7], [14, 9], [20, 6], [24, 11], [11, 12], [18, 13]]) o.set(x, y, [240, 246, 255]);
    o.ellipse(22, 8, 2, 2, [240, 240, 220]);
    for (let x = 5; x < 27; x++) o.rect(x, 17 + Math.round(2 * Math.sin(x / 3)), 1, 22 - 17 - Math.round(2 * Math.sin(x / 3)), [236, 244, 250]);
    o.rect(15, 5, 2, 17, [96, 104, 120]);
    frost(o, 5, 5, 22, 17);
    o.outline();
    g.paste(o);
  });
  solid(B, B + 1, B + 2, B + 3, B + 4);
  // B+5 the corridor floor: grey anti-slip vinyl with a raised diamond pattern
  drawTile(B + 5, (g) => {
    const base = [124, 132, 144];
    g.rect(0, 0, T, T, base);
    g.noise(0, 0, T, T, 0.06, B + 5);
    for (let y = 2; y < T; y += 8) for (let x = (y / 8) % 2 < 1 ? 2 : 6; x < T; x += 8) {
      g.rect(x + 1, y, 1, 3, sh(base, 1.18));
      g.rect(x, y + 1, 3, 1, sh(base, 1.18));
      g.set(x + 2, y + 2, sh(base, 0.8));
    }
    g.rect(0, 0, T, 1, sh(base, 0.82));
  });
  // B+6 the boot room floor: ribbed black rubber matting
  drawTile(B + 6, (g) => {
    g.rect(0, 0, T, T, RUBBER);
    for (let y = 1; y < T; y += 4) { g.rect(0, y, T, 2, sh(RUBBER, 1.25)); g.rect(0, y + 2, T, 1, sh(RUBBER, 0.75)); }
    g.noise(0, 0, T, T, 0.08, B + 6);
  });
  // B+7 snow and slush trodden in from the airlock (decor)
  drawTile(B + 7, (g) => {
    const r = rng(B + 7);
    for (let i = 0; i < 7; i++) g.ellipse(3 + r() * 26, 3 + r() * 26, 2 + r() * 3, 1.5 + r() * 2, [236, 244, 250, 200]);
    const boot = (x, y) => { g.ellipse(x, y, 3, 4.5, [190, 210, 226, 210]); g.ellipse(x, y + 7, 2.5, 2, [190, 210, 226, 210]); };
    boot(10, 8);
    boot(21, 17);
    for (const [x, y] of [[4, 22], [27, 6], [15, 28]]) g.set(x, y, [255, 255, 255]);
  });
  // B+8 frost creeping across the cold floor (decor)
  drawTile(B + 8, (g) => {
    const r = rng(B + 8);
    for (let i = 0; i < 6; i++) {
      let x = r() * T, y = r() * T;
      for (let k = 0; k < 14; k++) {
        g.set(x, y, [230, 244, 255, 190]);
        x += r() < 0.5 ? 1 : -1;
        y += r() < 0.6 ? 1 : 0;
      }
    }
    g.ellipse(9, 9, 8, 6, [220, 238, 252, 70]);
    g.ellipse(23, 22, 7, 5, [220, 238, 252, 60]);
  });
  // B+9 a bundle of cables across the floor (decor), joining left and right edges
  drawTile(B + 9, (g) => {
    for (const [dy, col] of [[0, [40, 44, 52]], [3, [200, 60, 50]], [6, [50, 90, 170]]]) for (let x = 0; x < T; x++) {
      const y = 14 + dy + Math.round(2 * Math.sin((x / T) * Math.PI * 2 + dy));
      g.rect(x, y, 1, 2, col);
      g.set(x, y, sh(col, 1.4));
    }
  });
  // B+10 the instrument room floor: dark blue acoustic tiles
  drawTile(B + 10, (g) => {
    const base = [52, 66, 96];
    g.rect(0, 0, T, T, base);
    for (const o of [0, 16]) { g.rect(0, o, T, 1, sh(base, 0.7)); g.rect(o, 0, 1, T, sh(base, 0.7)); }
    for (let y = 3; y < T; y += 4) for (let x = 3; x < T; x += 4) if (x % 16 && y % 16) g.set(x, y, sh(base, 0.78));
    g.noise(0, 0, T, T, 0.06, B + 10);
  });
  // B+11..B+14 the station's fuel tank (2 x 2): a red cylinder on a cradle, a level window, frost
  drawPiece([[B + 11, B + 12], [B + 13, B + 14]], (g, { obj, shadow }) => {
    shadow(32, 58, 30, 5);
    obj((o) => {
      o.box(6, 48, 52, 8, STEEL, 1.2);
      const red = [196, 52, 44];
      o.rect(3, 8, 58, 40, red);
      for (let x = 3; x < 61; x++) {
        const f = 0.72 + 0.5 * Math.sin(((x - 3) / 58) * Math.PI);
        o.rect(x, 8, 1, 40, sh(red, Math.min(1.25, f)));
      }
      o.ellipse(32, 8, 29, 5, sh(red, 1.2));
      o.ellipse(32, 8, 24, 3.5, sh(red, 1.05));
      for (const y of [16, 38]) o.rect(3, y, 58, 2, sh(STEEL, 0.85));
      o.box(44, 18, 6, 20, [40, 40, 46]);
      o.rect(45, 33, 4, 4, [240, 190, 60]);
      o.box(12, 22, 22, 10, [246, 244, 236], 1, 0.85);
      o.rect(14, 24, 18, 2, [40, 40, 46]);
      o.rect(14, 28, 10, 1, [120, 120, 130]);
      o.box(28, 0, 8, 6, STEEL, 1.2);
    });
    for (const [x, y, w] of [[5, 10, 10], [50, 12, 8], [8, 44, 12], [40, 42, 9]]) g.rect(x, y, w, 1, alpha(ICE, 220));
  });
  solid(B + 11, B + 12, B + 13, B + 14);
  // B+15/B+16 the diesel generator (2 x 1): a grey housing, a dead control panel, a frosted exhaust
  drawPiece([[B + 15, B + 16]], (g, { obj, shadow }) => {
    shadow(32, 29, 30, 3);
    obj((o) => {
      o.box(2, 6, 60, 22, [104, 118, 104], 1.2);
      for (let x = 6; x < 34; x += 4) o.rect(x, 10, 2, 14, sh([104, 118, 104], 0.7));
      o.box(38, 9, 20, 13, [40, 44, 52]);
      o.rect(40, 11, 8, 3, [60, 30, 30]);
      o.ellipse(52, 13, 2, 2, [200, 50, 40]);
      for (let i = 0; i < 3; i++) o.ellipse(42 + i * 5, 18, 1.5, 1.5, [180, 186, 196]);
      o.box(10, 0, 6, 7, STEEL);
      o.box(2, 26, 60, 3, [60, 64, 72]);
    });
    g.rect(10, 1, 6, 1, alpha(ICE, 230));
    g.rect(4, 7, 30, 1, alpha(ICE, 200));
  });
  solid(B + 15, B + 16);
  // B+17 the stationarity gauge on the wall: a dial from red to green, the needle stuck in the red
  drawTile(B + 17, (g) => {
    stationWall(g);
    const o = canvas(T, T);
    o.box(4, 2, 24, 24, [60, 66, 78], 1.25);
    o.ellipse(16, 15, 10, 10, [240, 240, 232]);
    for (let a = 0; a <= 20; a++) {
      const t = Math.PI * (1 + a / 20);
      const col = a < 13 ? [220, 60, 50] : [60, 190, 90];
      for (const rr of [7, 8]) o.set(16 + Math.cos(t) * rr, 15 + Math.sin(t) * rr, col);
    }
    for (let k = 0; k < 7; k++) o.set(16 - k * 0.85, 15 - k * 0.45, [30, 30, 36]);
    o.ellipse(16, 15, 1.5, 1.5, [30, 30, 36]);
    o.rect(9, 20, 14, 3, [30, 34, 40]);
    o.rect(10, 21, 7, 1, [255, 120, 90]);
    o.rect(19, 21, 2, 1, [60, 70, 60]);
    o.outline();
    g.paste(o);
  });
  // B+18 the gauge's instruction plate: an engraved steel plate with three numbered steps
  drawTile(B + 18, (g) => {
    stationWall(g);
    const o = canvas(T, T);
    o.box(5, 4, 22, 21, [196, 200, 208], 1.15);
    for (let i = 0; i < 3; i++) {
      o.ellipse(9, 9 + i * 6, 2, 2, [52, 110, 190]);
      o.rect(13, 8 + i * 6, 11 - i * 2, 1, [60, 64, 76]);
      o.rect(13, 10 + i * 6, 8, 1, [120, 124, 136]);
    }
    for (const [x, y] of [[6, 5], [25, 5], [6, 23], [25, 23]]) o.set(x, y, [110, 116, 128]);
    o.outline();
    g.paste(o);
  });
  solid(B + 17, B + 18);
  // B+19 a locker with a red parka hanging in the open door
  drawTile(B + 19, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(3, 0, 26, 30, [88, 112, 140], 1.15);
      o.rect(5, 2, 10, 26, [36, 40, 50]);
      o.rect(17, 2, 10, 26, sh([88, 112, 140], 0.9));
      for (let y = 4; y < 10; y += 2) o.rect(19, y, 6, 1, sh([88, 112, 140], 0.7));
      o.rect(18, 15, 2, 4, [210, 214, 222]);
      o.box(6, 5, 8, 15, [214, 64, 48], 1.2);
      o.rect(6, 5, 8, 2, [240, 236, 226]);
      o.rect(9, 7, 1, 13, sh([214, 64, 48], 0.7));
      o.box(6, 23, 4, 5, [60, 48, 40]);
      o.box(10, 23, 4, 5, [60, 48, 40]);
    });
  });
  // B+20 a boot bench (a seat, not solid): a slatted bench with a pair of snow boots below
  drawTile(B + 20, (g, { obj, shadow }) => {
    shadow(16, 29, 14, 2);
    obj((o) => {
      o.rect(3, 16, 2, 12, [70, 74, 84]);
      o.rect(27, 16, 2, 12, [70, 74, 84]);
      o.box(1, 11, 30, 6, [168, 124, 82], 1.25);
      o.rect(1, 13, 30, 1, sh([168, 124, 82], 0.75));
      o.box(9, 21, 6, 7, [70, 54, 44]);
      o.box(17, 22, 6, 6, [70, 54, 44]);
      o.rect(9, 21, 6, 2, [230, 236, 240]);
      o.rect(17, 22, 6, 2, [230, 236, 240]);
    });
  });
  // B+21 a dead radiator on the wall, hung with icicles
  drawTile(B + 21, (g) => {
    stationWall(g);
    const o = canvas(T, T);
    o.box(4, 8, 24, 16, [206, 210, 216], 1.15);
    for (let x = 7; x < 26; x += 4) o.rect(x, 9, 1, 14, sh([206, 210, 216], 0.75));
    o.rect(4, 8, 24, 1, alpha(ICE, 255));
    o.box(22, 4, 3, 4, [120, 126, 136]);
    o.outline();
    g.paste(o);
    for (const [x, len] of [[6, 5], [11, 3], [15, 6], [20, 4], [25, 5]]) for (let j = 0; j < len; j++) g.rect(x, 24 + j, j < len - 2 ? 2 : 1, 1, [220, 240, 252]);
  });
  solid(B + 19, B + 21);
  // B+22 the echo sounder: a console with a round sonar screen and two rows of echo bars
  drawTile(B + 22, (g, { obj, shadow }) => {
    shadow(16, 30, 14, 2);
    obj((o) => {
      o.box(1, 14, 30, 15, [60, 70, 90], 1.2);
      o.box(2, 0, 28, 15, [44, 52, 68], 1.2);
      o.ellipse(10, 8, 6, 6, [10, 30, 24]);
      for (const rr of [2, 4, 6]) for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; o.set(10 + Math.cos(t) * rr, 8 + Math.sin(t) * rr, alpha(GREEN, 120)); }
      for (let k = 0; k < 6; k++) o.set(10 + k * 0.8, 8 - k * 0.6, GREEN);
      o.rect(18, 2, 10, 11, [10, 30, 24]);
      for (let i = 0; i < 5; i++) { o.rect(19 + i * 2, 7 - Math.max(0, 4 - i), 1, 1 + Math.max(0, 4 - i), GREEN); o.rect(19 + i * 2, 10, 1, i === 1 ? 2 : 1, [140, 200, 255]); }
      o.rect(18, 7, 10, 1, alpha([255, 255, 255], 70));
      for (let i = 0; i < 5; i++) o.ellipse(6 + i * 5, 20, 1.5, 1.5, [[220, 60, 50], [240, 190, 60], [180, 186, 196], [180, 186, 196], [60, 190, 90]][i]);
      o.rect(4, 24, 24, 2, [36, 40, 50]);
    });
  });
  // B+23 the sample freezer: a tall white lab freezer, frosted, with a two-digit keypad
  drawTile(B + 23, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(4, 0, 24, 30, [232, 236, 240], 1.05);
      o.rect(4, 14, 24, 1, [170, 176, 186]);
      o.rect(24, 4, 2, 8, [150, 156, 166]);
      o.rect(24, 17, 2, 8, [150, 156, 166]);
      o.box(7, 3, 12, 9, [50, 56, 66]);
      o.rect(8, 4, 10, 3, [130, 220, 170]);
      o.rect(9, 5, 2, 1, [20, 60, 40]);
      o.rect(13, 5, 2, 1, [20, 60, 40]);
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) o.set(9 + c * 2, 8 + r * 2, [210, 214, 222]);
      o.rect(4, 0, 24, 2, ICE);
      for (const [x, y] of [[6, 18], [20, 22], [10, 26], [16, 19]]) o.rect(x, y, 3, 1, alpha(ICE, 255));
      o.box(8, 18, 9, 5, [52, 110, 190]);
    });
  });
  // B+24 the supply terminal: a rugged console with a fuel order on screen and a PIN pad
  drawTile(B + 24, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(3, 12, 26, 17, [214, 110, 46], 1.2);
      o.box(5, 1, 22, 13, [52, 58, 70], 1.2);
      o.rect(7, 3, 18, 9, [16, 30, 44]);
      o.rect(8, 4, 9, 1, [120, 200, 255]);
      o.rect(8, 6, 14, 1, [120, 200, 255]);
      o.rect(8, 8, 6, 1, [240, 190, 60]);
      o.rect(19, 8, 5, 3, [200, 60, 50]);
      o.box(9, 16, 14, 8, [60, 66, 78]);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) o.set(11 + c * 3, 18 + r * 2, [220, 224, 230]);
      o.rect(5, 26, 22, 1, [40, 40, 46]);
    });
  });
  solid(B + 22, B + 23, B + 24);
  // B+25 a caged work lamp (above the avatars), glowing warm against the cold
  drawTile(B + 25, (g) => {
    for (let j = 0; j < 16; j++) g.rect(Math.round(16 - (4 + j)), 10 + j, 8 + 2 * j, 1, [255, 230, 170, Math.round(56 - j * 3.4)]);
    const o = canvas(T, T);
    o.rect(15, 0, 2, 4, [50, 54, 60]);
    o.box(11, 3, 10, 3, [60, 64, 72]);
    o.ellipse(16, 9, 5, 4, [255, 236, 170]);
    o.ellipse(16, 8, 2.5, 2, [255, 252, 230]);
    for (const x of [12, 16, 20]) o.rect(x, 5, 1, 8, [60, 64, 72]);
    o.rect(11, 12, 10, 1, [60, 64, 72]);
    o.outline();
    g.paste(o);
  });
  // B+26 insulated pipes under the ceiling (above the avatars), frosted, seamless left to right
  drawTile(B + 26, (g) => {
    const o = canvas(T, T);
    o.rect(0, 4, T, 6, [200, 204, 212]);
    o.rect(0, 4, T, 1, [236, 240, 246]);
    o.rect(0, 9, T, 1, [150, 156, 166]);
    o.rect(0, 12, T, 4, [196, 72, 52]);
    o.rect(0, 12, T, 1, [236, 120, 96]);
    o.rect(0, 15, T, 1, [140, 44, 36]);
    o.rect(6, 3, 3, 14, [80, 86, 98]);
    o.rect(24, 3, 3, 14, [80, 86, 98]);
    g.paste(o);
    for (const [x, w] of [[1, 4], [12, 7], [28, 3]]) g.rect(x, 4, w, 1, [255, 255, 255]);
    for (const [x, len] of [[3, 4], [14, 3], [20, 5], [30, 3]]) for (let j = 0; j < len; j++) g.set(x, 16 + j, [220, 240, 252, 230]);
    g.rect(0, 17, T, 2, [0, 0, 0, 40]);
  });
  // B+27 skis, poles and snowshoes on a wall rack
  drawTile(B + 27, (g) => {
    stationWall(g);
    const o = canvas(T, T);
    o.box(2, 5, 28, 3, [120, 86, 54]);
    for (const [x, col] of [[5, [220, 60, 50]], [9, [220, 60, 50]], [21, [52, 110, 190]], [25, [52, 110, 190]]]) {
      o.box(x, 2, 3, 23, col, 1.3);
      o.rect(x, 2, 3, 2, sh(col, 1.4));
    }
    o.rect(14, 4, 1, 22, [60, 64, 72]);
    o.rect(17, 4, 1, 22, [60, 64, 72]);
    o.ellipse(14.5, 22, 2, 1, [60, 64, 72]);
    o.ellipse(17.5, 22, 2, 1, [60, 64, 72]);
    o.outline();
    g.paste(o);
  });
  solid(B + 27);
  // B+28 a clipboard and B+29 a pinboard, hung on the station wall
  onWall(B + 28, 26, stationWall);
  onWall(B + 29, 9, stationWall);
  // B+30 the engineer's desk with the frost-damaged fuel logbook open on it
  drawTile(B + 30, (g, { obj, shadow }) => {
    shadow(16, 29, 14, 2);
    obj((o) => {
      deskBase(o, [120, 128, 140]);
      o.box(5, 4, 20, 12, [40, 70, 110]);
      o.box(6, 5, 9, 10, [246, 244, 232], 1, 0.88);
      o.box(15, 5, 9, 10, [246, 244, 232], 1, 0.88);
      for (let y = 7; y < 14; y += 2) { o.rect(7, y, 6, 1, [90, 94, 110]); o.rect(16, y, 6, 1, [90, 94, 110]); }
      o.rect(17, 9, 5, 3, alpha(ICE, 255));
      o.rect(8, 11, 4, 2, alpha(ICE, 255));
      o.box(26, 6, 4, 8, [70, 74, 84]);
      o.rect(27, 4, 2, 2, [240, 190, 60]);
    });
  });
  // B+31 the safe-mode panel on the wall: a red warning light and a frozen thermometer
  drawTile(B + 31, (g) => {
    stationWall(g);
    for (let j = 0; j < 8; j++) g.ellipse(10, 9, 8 - j, 7 - j, [255, 60, 50, 22]);
    const o = canvas(T, T);
    o.box(4, 4, 24, 20, [60, 66, 78], 1.25);
    o.ellipse(10, 9, 3, 3, [230, 50, 40]);
    o.set(9, 8, [255, 200, 190]);
    o.rect(6, 15, 9, 6, [20, 24, 30]);
    o.rect(7, 17, 7, 1, [255, 90, 70]);
    o.rect(7, 19, 4, 1, [255, 90, 70]);
    o.box(20, 6, 4, 16, [240, 244, 248]);
    o.rect(21, 18, 2, 3, [52, 110, 190]);
    o.ellipse(22, 20, 2, 2, [52, 110, 190]);
    o.outline();
    g.paste(o);
  });
  solid(B + 30, B + 31);
}
// --- end ts-nordlys ---

// --- ts-festival restyle (tiles 400-431) ---
// Festival Season: the festival office at the Lindenwiese and the meadow behind it. Cream offices with
// wood wainscoting (planning, the gate hall with its turnstiles, production), and the festival grounds
// inside a wooden fence: the main stage under a lighting truss, the lighting desk, lantern strings,
// linden trees, a food truck, beer benches and Line 7's tram stop.
{
  const B = blockOf('ts-festival');
  const CREAM = [234, 218, 178];
  const PANEL = [150, 100, 62];
  const FENCE = [186, 140, 92];
  const HEDGE = [70, 132, 72];
  const GRASS = [104, 164, 82];
  const NIGHT = [40, 36, 78];
  const LIGHT = [255, 220, 120];
  /** The office wall face: cream plaster over a wooden wainscot. */
  const officeWall = (g) => {
    g.rect(0, 0, T, T, CREAM);
    g.noise(0, 0, T, T, 0.05, B);
    g.rect(0, 0, T, 2, sh(CREAM, 0.62));
    g.rect(0, 2, T, 1, sh(CREAM, 1.06));
    g.rect(0, T - 11, T, 11, PANEL);
    for (let x = 3; x < T; x += 8) g.rect(x, T - 9, 6, 6, sh(PANEL, 0.86));
    g.rect(0, T - 12, T, 2, sh(PANEL, 1.3));
    g.rect(0, T - 1, T, 1, sh(PANEL, 0.7));
  };
  /** The meadow's wall face: a hedge behind a fence of rough vertical boards. */
  const fenceWall = (g) => {
    g.rect(0, 0, T, T, HEDGE);
    g.noise(0, 0, T, T, 0.25, B + 2);
    g.rect(0, 0, T, 2, sh(HEDGE, 0.55));
    for (let x = 0; x < T; x += 8) {
      const c = sh(FENCE, 0.92 + ((x / 8) % 3) * 0.06);
      g.rect(x, 9, 7, T - 9, c);
      g.rect(x + 2, 7, 3, 2, c);
      g.rect(x, 9, 7, 1, sh(c, 1.2));
      g.rect(x + 6, 10, 1, T - 10, sh(c, 0.72));
      g.rect(x + 7, 9, 1, T - 9, [70, 52, 36]);
    }
    for (const y of [13, 24]) { g.rect(0, y, T, 2, sh(FENCE, 0.7)); g.rect(0, y, T, 1, sh(FENCE, 0.85)); }
    g.noise(0, 9, T, T - 9, 0.08, B + 3);
    for (const x of [2, 9, 19, 27]) { g.set(x, T - 2, GRASS); g.set(x + 1, T - 3, sh(GRASS, 1.2)); }
  };
  // B+0 office wall, B+1 the same in a left wall; B+2 fence, B+3 the same in a right wall
  drawTile(B, officeWall);
  drawTile(B + 1, turned(officeWall, 'ccw'));
  drawTile(B + 2, fenceWall);
  drawTile(B + 3, turned(fenceWall, 'cw'));
  solid(B, B + 1, B + 2, B + 3);
  // B+4 meadow grass with clover and a few daisies
  drawTile(B + 4, (g) => {
    g.rect(0, 0, T, T, GRASS);
    g.noise(0, 0, T, T, 0.16, B + 4);
    const r = rng(B + 4);
    for (let i = 0; i < 26; i++) { const x = Math.floor(r() * T), y = Math.floor(r() * T); g.rect(x, y, 1, 2, sh(GRASS, r() < 0.5 ? 1.25 : 0.78)); }
    for (const [x, y] of [[6, 7], [23, 20], [14, 27]]) { g.set(x, y, [250, 250, 240]); g.set(x + 1, y, [250, 250, 240]); g.set(x, y + 1, [250, 250, 240]); g.set(x + 1, y + 1, [240, 200, 60]); }
  });
  // B+5 a gravel path trodden into the meadow
  drawTile(B + 5, (g) => {
    const base = [196, 176, 140];
    g.rect(0, 0, T, T, base);
    g.noise(0, 0, T, T, 0.12, B + 5);
    const r = rng(B + 5);
    for (let i = 0; i < 40; i++) g.rect(Math.floor(r() * T), Math.floor(r() * T), 2, 1, sh(base, r() < 0.5 ? 1.15 : 0.8));
  });
  // B+6 confetti and a lost wristband on the grass (decor)
  drawTile(B + 6, (g) => {
    const r = rng(B + 6);
    const cols = [[230, 60, 90], [250, 210, 60], [70, 150, 230], [250, 250, 250], [160, 90, 220]];
    for (let i = 0; i < 22; i++) g.rect(Math.floor(r() * 30), Math.floor(r() * 30), 2, 1 + (i % 2), cols[i % cols.length]);
    g.ellipse(20, 22, 5, 2.5, [230, 60, 90]);
    g.ellipse(20, 22, 3.5, 1.2, [0, 0, 0, 0]);
    for (let x = 16; x <= 24; x++) g.set(x, 22, sh([230, 60, 90], 0.7));
  });
  // B+7..B+14 the main stage (4 x 2): a night-blue backdrop with string lights and a linden-leaf
  // banner, then the stage boards with footlights over a black skirt
  drawPiece([[B + 7, B + 8, B + 9, B + 10], [B + 11, B + 12, B + 13, B + 14]], (g, { obj, shadow }) => {
    shadow(64, 62, 64, 3);
    obj((o) => {
      o.rect(2, 2, 124, 36, NIGHT);
      for (let j = 0; j < 36; j++) o.rect(2, 2 + j, 124, 1, sh(NIGHT, 0.8 + j * 0.012));
      for (let x = 2; x < 126; x += 10) o.rect(x, 4, 1, 34, sh(NIGHT, 0.7));
      o.box(0, 0, 128, 3, [60, 60, 70]);
      o.box(36, 8, 56, 20, [244, 214, 120], 1.15);
      o.rect(38, 10, 52, 16, [250, 236, 190]);
      o.ellipse(64, 18, 9, 6, [92, 160, 76]);
      o.rect(64, 13, 1, 11, [60, 110, 50]);
      for (const [x, c] of [[44, [230, 60, 90]], [50, [70, 150, 230]], [78, [250, 170, 40]], [84, [160, 90, 220]]]) o.rect(x, 15, 3, 6, c);
      // the stage boards and its skirt
      o.box(0, 36, 128, 14, [168, 120, 76], 1.2);
      for (let x = 0; x < 128; x += 9) o.rect(x, 37, 1, 13, [130, 90, 56]);
      o.rect(0, 50, 128, 11, [30, 28, 36]);
      o.rect(0, 50, 128, 1, [70, 66, 80]);
      for (let x = 6; x < 128; x += 12) o.box(x, 46, 6, 3, [60, 60, 70]);
    });
    for (let x = 4; x < 126; x += 6) {
      const y = 5 + Math.round(2 * Math.sin(x / 8));
      g.set(x, y, [255, 240, 170]);
      g.ellipse(x, y, 1.5, 1.5, [255, 230, 140, 90]);
    }
    for (let x = 9; x < 128; x += 12) { g.rect(x - 1, 46, 4, 2, LIGHT); for (let j = 1; j < 8; j++) g.rect(x - j, 46 - j, 4 + 2 * j, 1, [255, 230, 150, 40 - j * 4]); }
    for (let x = 4; x < 126; x += 16) g.rect(x, 54, 6, 1, [70, 66, 80]);
  });
  solid(...range(B + 7, B + 14));
  // B+15 a speaker stack
  drawTile(B + 15, (g, { obj, shadow }) => {
    shadow(16, 30, 12, 2);
    obj((o) => {
      o.box(5, 0, 22, 30, [36, 36, 42], 1.4);
      for (const [y, r] of [[8, 6], [21, 7]]) { o.ellipse(16, y, r, r, [20, 20, 24]); o.ellipse(16, y, r - 2, r - 2, [70, 70, 80]); o.ellipse(16, y, 1.5, 1.5, [140, 140, 150]); }
      o.rect(5, 14, 22, 1, [80, 80, 90]);
    });
  });
  // B+16 the lighting truss (above the avatars): a silver girder with coloured spotlights
  drawTile(B + 16, (g) => {
    const o = canvas(T, T);
    o.rect(0, 2, T, 2, [200, 204, 212]);
    o.rect(0, 9, T, 2, [170, 174, 184]);
    for (let x = 0; x < T; x += 8) { for (let k = 0; k < 7; k++) o.set(x + k, 3 + k, [190, 194, 204]); }
    for (const [x, c] of [[6, [255, 90, 120]], [22, [110, 190, 255]]]) {
      o.box(x - 3, 11, 7, 7, [40, 40, 48]);
      o.ellipse(x, 17, 3, 1.5, c);
    }
    o.outline();
    g.paste(o);
    for (const [x, c] of [[6, [255, 90, 120]], [22, [110, 190, 255]]]) for (let j = 0; j < 12; j++) g.rect(x - 2 - Math.floor(j / 2), 19 + j, 5 + j, 1, alpha(c, 60 - j * 4));
  });
  // B+17 a string of paper lanterns (above the avatars), seamless left to right: Lantern Night
  drawTile(B + 17, (g) => {
    const o = canvas(T, T);
    const yAt = (x) => 4 + Math.round(4 * Math.sin((x / T) * Math.PI));
    const cols = [[250, 120, 60], [250, 210, 70], [230, 80, 120]];
    for (let i = 0; i < 3; i++) {
      const cx = 5 + i * 11, y = yAt(cx);
      o.rect(cx, y, 1, 3, [70, 60, 50]);
      o.ellipse(cx + 0.5, y + 7, 4, 4.5, cols[i]);
      o.rect(cx - 2, y + 2, 5, 1, [60, 50, 40]);
      o.rect(cx - 2, y + 11, 5, 1, [60, 50, 40]);
      for (const dx of [-2, 2]) o.rect(cx + dx, y + 4, 1, 6, sh(cols[i], 0.8));
    }
    o.outline();
    for (let i = 0; i < 3; i++) { const cx = 5 + i * 11, y = yAt(cx); g.ellipse(cx + 0.5, y + 7, 8, 8, alpha(cols[i], 40)); }
    g.paste(o);
    for (let x = 0; x < T; x++) g.set(x, yAt(x), [70, 60, 50]);
    for (let i = 0; i < 3; i++) { const cx = 5 + i * 11, y = yAt(cx); g.rect(cx - 1, y + 5, 2, 3, [255, 250, 210]); }
  });
  // B+18 the lighting desk: faders in three groups, a small screen and a gooseneck lamp
  drawTile(B + 18, (g, { obj, shadow }) => {
    shadow(16, 30, 14, 2);
    obj((o) => {
      o.box(1, 6, 30, 16, [52, 54, 64], 1.25);
      o.rect(2, 22, 28, 7, [36, 36, 44]);
      o.rect(4, 26, 2, 3, [36, 36, 44]);
      o.box(20, 0, 9, 7, [30, 30, 36]);
      o.rect(21, 1, 7, 4, [110, 200, 255]);
      for (let gi = 0; gi < 3; gi++) for (let k = 0; k < 2; k++) {
        const x = 4 + gi * 6 + k * 3;
        o.rect(x, 9, 1, 10, [20, 20, 24]);
        o.box(x - 1, 10 + ((gi * 3 + k * 5) % 7), 3, 2, [[230, 70, 70], [250, 200, 60], [90, 200, 120]][gi]);
      }
      o.rect(4, 2, 1, 6, [140, 140, 150]);
      o.rect(4, 2, 4, 1, [140, 140, 150]);
      o.ellipse(8, 3, 2, 1.5, LIGHT);
    });
  });
  /** A waist-high turnstile: a steel post with three arms; `scanner` adds a lit scanner head. */
  const turnstile = (scanner) => (g, { obj, shadow }) => {
    shadow(16, 29, 11, 2);
    obj((o) => {
      o.box(10, 6, 12, 22, [150, 160, 174], 1.2);
      o.rect(4, 14, 24, 2, [200, 206, 214]);
      o.rect(15, 10, 2, 12, [200, 206, 214]);
      o.ellipse(16, 15, 3, 3, [110, 116, 128]);
      o.box(8, 26, 16, 3, [90, 96, 108]);
      if (scanner) {
        o.box(11, 0, 10, 7, [40, 44, 52]);
        o.rect(12, 1, 8, 3, [255, 80, 70]);
        o.rect(13, 2, 6, 1, [255, 200, 190]);
        o.rect(12, 5, 3, 1, [90, 200, 120]);
      } else o.ellipse(16, 8, 3, 2, [60, 200, 110]);
    });
  };
  // B+19 the gate scanner (turnstile with a red-lit scanner), B+20 a plain turnstile
  drawTile(B + 19, turnstile(true));
  drawTile(B + 20, turnstile(false));
  // B+21 the Festwiese tram stop: the green-and-yellow H sign over a passenger counter box
  drawTile(B + 21, (g, { obj, shadow }) => {
    shadow(16, 30, 9, 2);
    obj((o) => {
      o.rect(15, 8, 2, 22, [110, 116, 128]);
      o.ellipse(16, 7, 7, 7, [250, 210, 60]);
      o.ellipse(16, 7, 5.5, 5.5, [50, 140, 80]);
      o.rect(13, 4, 1, 6, [250, 210, 60]);
      o.rect(18, 4, 1, 6, [250, 210, 60]);
      o.rect(13, 7, 6, 1, [250, 210, 60]);
      o.box(9, 16, 14, 9, [70, 76, 88], 1.2);
      o.rect(10, 17, 12, 4, [20, 30, 24]);
      o.rect(11, 18, 2, 2, [120, 240, 160]);
      o.rect(14, 18, 2, 2, [120, 240, 160]);
      o.rect(17, 18, 2, 2, [120, 240, 160]);
      o.rect(11, 22, 10, 1, [250, 210, 60]);
    });
  });
  // B+22 tram rails running down the meadow (decor)
  drawTile(B + 22, (g) => {
    for (let y = 2; y < T; y += 8) g.box(3, y, 26, 4, [120, 92, 66], 1.15);
    for (const x of [8, 22]) { g.rect(x, 0, 3, T, [150, 154, 164]); g.rect(x, 0, 1, T, [210, 214, 222]); g.rect(x + 2, 0, 1, T, [90, 94, 104]); }
  });
  // B+23 a newspaper box with today's City Courier in its window
  drawTile(B + 23, (g, { obj, shadow }) => {
    shadow(16, 30, 9, 2);
    obj((o) => {
      o.box(7, 4, 18, 20, [52, 110, 190], 1.2);
      o.rect(9, 6, 14, 9, [210, 226, 236]);
      paper(o, 10, 7, 12, 8);
      o.rect(11, 8, 10, 1, [30, 30, 40]);
      o.rect(9, 17, 14, 3, [40, 80, 150]);
      o.rect(13, 18, 6, 1, [250, 210, 60]);
      o.rect(9, 24, 2, 6, [60, 64, 72]);
      o.rect(21, 24, 2, 6, [60, 64, 72]);
    });
  });
  solid(B + 15, B + 18, B + 19, B + 20, B + 21, B + 23);
  // B+24/B+25 a food truck (2 x 1): a teal van with its hatch propped open over a counter
  drawPiece([[B + 24, B + 25]], (g, { obj, shadow }) => {
    shadow(32, 29, 30, 3);
    obj((o) => {
      const van = [72, 170, 170];
      o.box(1, 4, 62, 22, van, 1.2);
      o.box(46, 6, 16, 18, sh(van, 0.92));
      o.rect(48, 8, 12, 7, [180, 220, 240]);
      o.rect(6, 1, 34, 4, sh(van, 1.15));
      o.rect(6, 8, 34, 10, [40, 40, 46]);
      o.rect(8, 10, 30, 6, [250, 200, 120]);
      for (let x = 10; x < 36; x += 6) o.ellipse(x, 13, 2, 1.5, [190, 110, 60]);
      o.box(4, 17, 38, 3, [220, 220, 210]);
      o.rect(6, 20, 34, 3, [230, 80, 90]);
      o.ellipse(12, 26, 4, 4, [30, 30, 36]);
      o.ellipse(52, 26, 4, 4, [30, 30, 36]);
      o.ellipse(12, 26, 1.5, 1.5, [160, 160, 170]);
      o.ellipse(52, 26, 1.5, 1.5, [160, 160, 170]);
    });
  });
  solid(B + 24, B + 25);
  // B+26 a beer bench (a seat, not solid)
  drawTile(B + 26, (g, { obj, shadow }) => {
    shadow(16, 28, 14, 2);
    obj((o) => {
      o.rect(5, 18, 2, 9, [80, 80, 90]);
      o.rect(25, 18, 2, 9, [80, 80, 90]);
      o.box(0, 13, T, 6, [190, 150, 100], 1.2);
      o.rect(0, 15, T, 1, sh([190, 150, 100], 0.8));
    });
  });
  // B+27 the event calendar pinned on the office wall: a month grid with two red-ringed dates
  drawTile(B + 27, (g) => {
    officeWall(g);
    const o = canvas(T, T);
    o.box(5, 3, 22, 19, [250, 248, 238], 1, 0.86);
    o.rect(5, 3, 22, 4, [70, 150, 90]);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) o.rect(7 + c * 4, 9 + r * 3, 2, 1, [140, 140, 150]);
    for (const [x, y] of [[14, 11], [22, 17]]) { o.rect(x - 1, y - 1, 4, 3, [220, 50, 50]); o.rect(x, y, 2, 1, [250, 248, 238]); }
    o.rect(15, 1, 2, 3, [200, 50, 50]);
    o.outline();
    g.paste(o);
  });
  // B+28 the whiteboard and B+29 a clipboard, hung on the office wall
  onWall(B + 28, 22, officeWall);
  onWall(B + 29, 26, officeWall);
  // B+30 a festival poster on the fence
  drawTile(B + 30, (g) => {
    fenceWall(g);
    const o = canvas(T, T);
    o.box(6, 4, 20, 22, [40, 36, 78], 1.2);
    o.ellipse(16, 12, 6, 6, [250, 170, 40]);
    o.ellipse(16, 12, 4, 4, [250, 220, 90]);
    o.rect(9, 20, 14, 2, [230, 80, 120]);
    o.rect(11, 23, 10, 1, [250, 250, 240]);
    o.outline();
    g.paste(o);
  });
  solid(B + 27, B + 30);
  // B+31 a young linden tree: heart-shaped leaves in a round crown over a slim trunk
  drawTile(B + 31, (g, { obj, shadow }) => {
    shadow(16, 30, 10, 2);
    obj((o) => {
      o.rect(14, 18, 4, 12, [110, 80, 56]);
      o.rect(14, 18, 1, 12, [140, 104, 72]);
      o.ellipse(16, 11, 13, 11, [62, 128, 64]);
      o.ellipse(13, 9, 9, 7, [84, 156, 80]);
      o.ellipse(11, 6, 4, 3, [120, 190, 100]);
      o.noise(3, 0, 26, 22, 0.18, B + 31);
    });
  });
  solid(B + 31);
}
// --- end ts-festival ---

// --- python-docs restyle (tiles 432-463) ---
// The Silent Archive: Kleeberg's city library after closing. Walnut panelling under green wallpaper,
// a parquet reading hall with the sealed door, the carpeted stacks, Margarete's office, a stone
// packing room with the stairs to the cellar and the circulation desk.
{
  const B = blockOf('python-docs');
  const WALNUT = [98, 62, 40];
  const PAPER_GREEN = [52, 88, 70];
  const OAK = [178, 130, 80];
  const MOSS = [46, 82, 64];
  const FLAG = [126, 122, 116];
  const LAMP_GREEN = [44, 140, 92];
  const WARM = [255, 222, 150];
  const MOON = [170, 200, 255];
  const SPINES = [[132, 42, 44], [44, 66, 120], [52, 98, 62], [176, 130, 52], [104, 70, 46], [222, 210, 180], [90, 46, 90], [150, 80, 50]];
  /** The archive's wall face: green damask wallpaper over walnut panelling. */
  const archiveWall = (g) => {
    g.rect(0, 0, T, 15, PAPER_GREEN);
    g.noise(0, 0, T, 15, 0.06, B);
    for (let y = 4; y < 15; y += 8)
      for (let x = (y / 8) % 2 < 1 ? 4 : 0; x < T; x += 8) {
        g.set(x, y - 1, sh(PAPER_GREEN, 1.3));
        g.rect(x - 1, y, 3, 1, sh(PAPER_GREEN, 1.3));
        g.set(x, y + 1, sh(PAPER_GREEN, 1.3));
      }
    g.rect(0, 0, T, 2, sh(PAPER_GREEN, 0.62));
    g.rect(0, 15, T, 2, sh(WALNUT, 1.35));
    g.rect(0, 17, T, 15, WALNUT);
    g.noise(0, 17, T, 15, 0.08, B + 100);
    for (const x0 of [2, 18]) {
      g.rect(x0, 19, 12, 8, sh(WALNUT, 0.84));
      g.rect(x0, 19, 12, 1, sh(WALNUT, 0.66));
      g.rect(x0, 26, 12, 1, sh(WALNUT, 1.22));
      g.rect(x0 + 11, 19, 1, 8, sh(WALNUT, 1.12));
    }
    g.rect(0, T - 3, T, 3, sh(WALNUT, 0.6));
    g.rect(0, T - 3, T, 1, sh(WALNUT, 1.15));
  };
  // B+0 archive wall front, B+1 in a left wall, B+2 in a right wall
  drawTile(B, archiveWall);
  drawTile(B + 1, turned(archiveWall, 'ccw'));
  drawTile(B + 2, turned(archiveWall, 'cw'));
  // B+3 reading-hall floor: honey oak parquet laid in a fishbone
  drawTile(B + 3, (g) => {
    const r = rng(B + 3);
    const shade = Array.from({ length: 64 }, () => 0.86 + r() * 0.24);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const col = Math.floor(x / 8);
        const xm = x % 8;
        const v = (col % 2 ? y - xm + 32 : y + xm) % 32;
        const k = Math.floor(v / 4);
        let c = sh(OAK, shade[col * 8 + k]);
        if (v % 4 === 0) c = sh(OAK, 0.7);
        if (xm === 0) c = sh(OAK, 0.62);
        g.set(x, y, c);
      }
    g.noise(0, 0, T, T, 0.06, B + 3);
  });
  // B+4 stacks floor: a deep green carpet with a small gold diamond
  drawTile(B + 4, (g) => {
    g.rect(0, 0, T, T, MOSS);
    g.noise(0, 0, T, T, 0.1, B + 4);
    for (let y = 0; y < T; y += 2) g.rect(0, y, T, 1, alpha(sh(MOSS, 0.9), 80));
    for (const [cx, cy] of [[8, 8], [24, 24]]) {
      g.set(cx, cy - 2, [176, 150, 84]);
      g.rect(cx - 1, cy - 1, 3, 1, [150, 128, 70]);
      g.rect(cx - 2, cy, 5, 1, [176, 150, 84]);
      g.rect(cx - 1, cy + 1, 3, 1, [150, 128, 70]);
      g.set(cx, cy + 2, [176, 150, 84]);
    }
  });
  // B+5 packing-room floor: worn grey flagstones
  drawTile(B + 5, (g) => {
    const r = rng(B + 5);
    for (let row = 0; row < 2; row++)
      for (let i = -1; i < 2; i++) {
        const x0 = i * 16 + (row ? 8 : 0);
        g.rect(x0, row * 16, 16, 16, sh(FLAG, 0.9 + r() * 0.2));
      }
    g.noise(0, 0, T, T, 0.12, B + 5);
    for (const y of [0, 16]) g.rect(0, y, T, 1, sh(FLAG, 0.62));
    for (const x of [0, 16]) g.rect(x, 0, 1, 16, sh(FLAG, 0.62));
    for (const x of [8, 24]) g.rect(x, 16, 1, 16, sh(FLAG, 0.62));
    for (const y of [1, 17]) g.rect(0, y, T, 1, sh(FLAG, 1.12));
    for (const [x, y] of [[5, 7], [21, 10], [12, 25], [28, 22]]) g.rect(x, y, 2, 1, sh(FLAG, 0.75));
  });
  // B+6..B+9 tall bookcase, two tiles wide and two tall: five shelves of spines under a cornice
  drawPiece([[B + 6, B + 7], [B + 8, B + 9]], (g, { obj, shadow }) => {
    shadow(32, 61, 31, 3);
    obj((o) => {
      o.box(1, 0, 62, 61, WALNUT, 1.3);
      o.rect(0, 0, 64, 4, sh(WALNUT, 1.2));
      o.rect(0, 4, 64, 1, sh(WALNUT, 0.6));
      o.rect(4, 6, 56, 50, sh(WALNUT, 0.45));
      const r = rng(B + 6);
      for (let s = 0; s < 5; s++) {
        const base = 15 + s * 10;
        for (let x = 5; x < 58; ) {
          const w = 2 + Math.floor(r() * 3);
          if (x + w > 59) break;
          const h = 6 + Math.floor(r() * 3);
          const col = SPINES[Math.floor(r() * SPINES.length)];
          if (r() < 0.07) { x += w + 1; continue; }
          o.rect(x, base - h, w, h, col);
          o.rect(x, base - h, 1, h, sh(col, 1.25));
          if (w > 2) o.rect(x, base - h + 2, w, 1, [214, 180, 90]);
          x += w;
        }
        o.rect(4, base, 56, 2, sh(WALNUT, 1.15));
      }
      o.rect(2, 56, 60, 5, sh(WALNUT, 0.8));
    });
  });
  // B+10, B+11 reading table with a green banker's lamp and an open book
  drawPiece([[B + 10, B + 11]], (g, { obj, shadow }) => {
    shadow(32, 29, 30, 3);
    for (let j = 0; j < 7; j++) g.ellipse(18, 14, 18 - j * 2, 8 - j, alpha(WARM, 16));
    obj((o) => {
      o.box(1, 10, 62, 12, WALNUT, 1.3);
      o.rect(1, 13, 62, 1, sh(WALNUT, 0.8));
      o.rect(3, 22, 3, 8, sh(WALNUT, 0.7));
      o.rect(58, 22, 3, 8, sh(WALNUT, 0.7));
      o.rect(4, 17, 56, 1, sh(WALNUT, 1.15));
    });
    for (let j = 0; j < 6; j++) g.ellipse(14, 14, 11 - j, 4 - j * 0.5, alpha(WARM, 30));
    obj((o) => {
      o.rect(13, 4, 2, 9, [212, 170, 80]);
      o.ellipse(14, 12.5, 5, 1.5, [212, 170, 80]);
      o.box(6, 2, 16, 5, LAMP_GREEN, 1.35);
      o.rect(7, 6, 14, 1, [255, 240, 190]);
      // open book: two pages and a ribbon
      o.box(30, 9, 11, 7, [244, 236, 214], 1, 0.85);
      o.box(41, 9, 11, 7, [236, 228, 204], 1, 0.85);
      o.rect(41, 9, 1, 7, [150, 130, 100]);
      for (let y = 11; y < 15; y += 2) { o.rect(32, y, 7, 1, [150, 146, 150]); o.rect(43, y, 7, 1, [150, 146, 150]); }
      o.rect(44, 16, 1, 3, [180, 40, 50]);
      o.box(54, 7, 7, 3, [132, 42, 44]);
      o.box(55, 4, 6, 3, [44, 66, 120]);
    });
  });
  // B+12 wooden reading chair (a seat, not solid)
  drawTile(B + 12, (g, { obj, shadow }) => {
    shadow(16, 28, 9, 2);
    obj((o) => {
      o.rect(9, 20, 2, 8, sh(WALNUT, 0.7));
      o.rect(21, 20, 2, 8, sh(WALNUT, 0.7));
      o.box(7, 14, 18, 7, sh(WALNUT, 1.2), 1.25);
      o.rect(8, 2, 2, 13, WALNUT);
      o.rect(22, 2, 2, 13, WALNUT);
      o.box(8, 2, 16, 4, WALNUT, 1.3);
      for (const x of [12, 15, 18]) o.rect(x, 6, 2, 8, sh(WALNUT, 1.1));
    });
  });
  // B+13 Margarete's rule, cross-stitched and framed, above her desk
  drawTile(B + 13, (g) => {
    archiveWall(g);
    const o = canvas(T, T);
    o.box(3, 3, 26, 21, [150, 104, 52], 1.3);
    o.rect(5, 5, 22, 17, [238, 228, 200]);
    o.noise(5, 5, 22, 17, 0.05, B + 13);
    for (let x = 6; x < 26; x += 2) { o.set(x, 6, [60, 110, 80]); o.set(x + 1, 20, [60, 110, 80]); }
    const r = rng(B + 113);
    for (const y of [9, 12, 15]) for (let x = 8; x < 25; x++) if (r() < 0.72) o.set(x, y, [150, 40, 50]);
    o.rect(14, 17, 4, 1, [150, 40, 50]);
    o.outline();
    g.paste(o);
  });
  // B+14 keypad, B+15 clipboard, B+16 noticeboard and B+17 portrait, hung on the archive wall
  onWall(B + 14, 13, archiveWall);
  onWall(B + 15, 26, archiveWall);
  onWall(B + 16, 9, archiveWall);
  onWall(B + 17, 30, archiveWall);
  // B+18 the old terminal: a beige CRT with green text and a heavy keyboard on a desk
  drawTile(B + 18, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      deskBase(o, WALNUT);
      o.box(6, 1, 20, 14, [214, 204, 176], 1.15);
      o.rect(8, 3, 16, 9, [16, 30, 20]);
      for (let y = 4; y < 11; y += 2) o.rect(9, y, 4 + ((y * 5) % 9), 1, [90, 230, 120]);
      o.rect(9, 10, 2, 1, [180, 255, 190]);
      o.rect(20, 12, 3, 1, [230, 120, 60]);
      o.box(7, 16, 18, 4, [196, 186, 160], 1.15);
      for (let x = 8; x < 24; x += 2) o.set(x, 17, [120, 112, 98]);
    });
  });
  // B+19 a tall arched window in the archive wall, night outside
  drawTile(B + 19, (g) => {
    archiveWall(g);
    const o = canvas(T, T);
    const frame = [190, 180, 160];
    o.rect(6, 10, 20, 18, frame);
    o.ellipse(16, 10, 10, 8, frame);
    o.rect(8, 10, 16, 16, [24, 34, 70]);
    o.ellipse(16, 10, 8, 6, [24, 34, 70]);
    for (let j = 0; j < 12; j++) o.rect(8, 14 + j, 16, 1, alpha([60, 80, 140], 40 + j * 6));
    o.ellipse(20, 9, 2.5, 2.5, [240, 240, 210]);
    for (const [x, y] of [[11, 7], [13, 14], [21, 17], [10, 20]]) o.set(x, y, [230, 236, 255]);
    o.rect(15, 4, 2, 22, frame);
    o.rect(8, 16, 16, 2, frame);
    o.rect(5, 26, 22, 3, sh(frame, 1.1));
    o.outline();
    g.paste(o);
  });
  // B+20..B+23 the stairs down to the cellar: an opening in the floor behind a wooden railing
  drawPiece([[B + 20, B + 21], [B + 22, B + 23]], (g, { obj }) => {
    g.rect(4, 6, 56, 56, [30, 26, 24]);
    for (let s = 0; s < 8; s++) {
      const y = 56 - s * 6;
      const c = sh([150, 120, 90], 1 - s * 0.1);
      g.rect(6, y, 52, 6, c);
      g.rect(6, y, 52, 1, sh(c, 1.25));
      g.rect(6, y + 5, 52, 1, sh(c, 0.6));
    }
    for (let j = 0; j < 14; j++) g.rect(6, 6 + j, 52, 1, [10, 8, 8, 200 - j * 14]);
    obj((o) => {
      const rail = [128, 84, 50];
      o.box(0, 2, 64, 4, rail, 1.3);
      o.box(0, 2, 4, 60, rail, 1.3);
      o.box(60, 2, 4, 60, rail, 1.3);
      for (let x = 6; x < 60; x += 6) o.rect(x, 6, 2, 4, sh(rail, 0.8));
      o.box(0, 0, 5, 6, sh(rail, 1.1));
      o.box(59, 0, 5, 6, sh(rail, 1.1));
      o.box(0, 58, 5, 6, sh(rail, 1.1));
      o.box(59, 58, 5, 6, sh(rail, 1.1));
    });
  });
  // B+24, B+25 packing table: a pile of books, flat archive boxes and a ball of twine
  drawPiece([[B + 24, B + 25]], (g, { obj, shadow }) => {
    shadow(32, 29, 30, 3);
    obj((o) => {
      o.box(1, 12, 62, 11, [176, 140, 96], 1.2);
      o.rect(1, 15, 62, 1, sh([176, 140, 96], 0.85));
      o.rect(3, 23, 3, 7, [120, 92, 60]);
      o.rect(58, 23, 3, 7, [120, 92, 60]);
      const r = rng(B + 24);
      for (let i = 0; i < 6; i++) {
        const col = SPINES[Math.floor(r() * SPINES.length)];
        o.box(5 + Math.floor(r() * 3), 12 - i * 2 - 2, 14, 3, col, 1.25);
      }
      for (let i = 0; i < 3; i++) o.box(24 + i, 10 - i * 2, 18, 3, [196, 162, 112], 1.2);
      o.box(44, 4, 16, 10, [204, 170, 120], 1.15);
      o.rect(44, 4, 16, 3, sh([204, 170, 120], 1.12));
      o.box(48, 8, 8, 3, [244, 238, 220]);
      o.ellipse(33, 17, 3, 2.5, [214, 196, 150]);
    });
  });
  // B+26 globe on a wooden stand
  drawTile(B + 26, (g, { obj, shadow }) => {
    shadow(16, 29, 9, 2);
    obj((o) => {
      o.rect(15, 20, 2, 7, WALNUT);
      o.box(9, 26, 14, 3, WALNUT, 1.3);
      o.ellipse(16, 12, 9, 9, [70, 120, 170]);
      o.ellipse(13, 9, 4, 3, [120, 160, 90]);
      o.ellipse(19, 15, 3, 4, [140, 168, 96]);
      o.ellipse(12, 16, 2, 1.5, [120, 160, 90]);
      o.rect(10, 7, 2, 2, [190, 220, 240]);
    });
    const ring = [212, 170, 80];
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      g.set(16 + Math.cos(t) * 10.5, 12 + Math.sin(t) * 10.5, ring);
    }
  });
  // B+27 books stacked on the floor, waiting to be shelved
  drawTile(B + 27, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      const r = rng(B + 27);
      for (const [x0, n] of [[3, 5], [12, 3], [20, 6]])
        for (let i = 0; i < n; i++) {
          const col = SPINES[Math.floor(r() * SPINES.length)];
          const w = 8 + Math.floor(r() * 2);
          o.box(x0 + Math.floor(r() * 2), 26 - i * 3, w, 3, col, 1.3);
          o.rect(x0 + 1, 27 - i * 3, w - 2, 1, [236, 228, 210]);
        }
    });
  });
  // B+28 library pendant (above the avatars): a green glass shade and a warm cone of light
  drawTile(B + 28, (g) => {
    for (let j = 0; j < 18; j++) g.rect(Math.round(16 - (5 + j * 0.8)), 10 + j, Math.round(10 + j * 1.6), 1, alpha(WARM, Math.round(80 - j * 4)));
    const o = canvas(T, T);
    o.rect(15, 0, 2, 4, [212, 170, 80]);
    o.ellipse(16, 8, 8, 4.5, LAMP_GREEN);
    o.ellipse(16, 6.5, 6, 2.5, sh(LAMP_GREEN, 1.35));
    o.rect(8, 9, 16, 1, sh(LAMP_GREEN, 0.7));
    o.ellipse(16, 10, 4, 1.2, [255, 246, 200]);
    o.outline();
    g.paste(o);
  });
  // B+29 loose papers and a dropped book on the floor (decor)
  drawTile(B + 29, (g) => {
    const sheet = (x, y, w, h) => {
      g.rect(x + 1, y + 1, w, h, [0, 0, 0, 50]);
      g.rect(x, y, w, h, [244, 240, 226]);
      for (let j = y + 2; j < y + h - 1; j += 2) g.rect(x + 1, j, w - 3, 1, [160, 156, 160]);
    };
    sheet(3, 4, 9, 11);
    sheet(14, 15, 10, 8);
    sheet(6, 19, 7, 9);
    g.rect(21, 4, 8, 7, [0, 0, 0, 50]);
    g.rect(20, 3, 8, 7, [44, 66, 120]);
    g.rect(20, 3, 8, 1, [80, 100, 160]);
    g.rect(21, 4, 6, 5, [240, 232, 210]);
  });
  // B+30 moonlight falling through an arched window onto the floor (decor)
  drawTile(B + 30, (g) => {
    for (let y = 0; y < T; y++) {
      const x0 = 6 + Math.round(y * 0.25);
      for (let x = x0; x < x0 + 20; x++) {
        const bar = (x - x0 === 9 || x - x0 === 10 || y === 12 || y === 13);
        if (!bar) g.set(x, y, alpha(MOON, 96 - Math.round(y * 1.8)));
      }
    }
  });
  // B+31 the late-fees ledger: a big open ledger, an inkwell and a pen on the circulation desk
  drawTile(B + 31, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      deskBase(o, WALNUT);
      o.box(3, 5, 13, 9, [242, 234, 210], 1, 0.85);
      o.box(16, 5, 13, 9, [236, 226, 200], 1, 0.85);
      o.rect(15, 5, 2, 9, [120, 40, 40]);
      for (let y = 7; y < 13; y += 2) { o.rect(5, y, 9, 1, [140, 150, 170]); o.rect(18, y, 9, 1, [140, 150, 170]); }
      o.rect(11, 6, 1, 7, [200, 70, 70]);
      o.rect(25, 6, 1, 7, [200, 70, 70]);
      o.box(25, 1, 4, 4, [30, 34, 50]);
      o.rect(27, 0, 1, 2, [240, 240, 240]);
    });
  });
  solid(B, B + 1, B + 2, ...range(B + 6, B + 11), ...range(B + 13, B + 27), B + 31);
}
// --- end python-docs ---

// --- python-debug restyle (tiles 464-495) ---
// The Butterfly House: a tropical glasshouse on a November night. Glass walls in white frames, an
// airlock with a strip curtain, Ole's tech room, and the hall itself: gravel paths, a boardwalk,
// a lily pond, palms and plant beds with butterflies in the air.
{
  const B = blockOf('python-debug');
  const FRAME = [220, 228, 222];
  const PANE = [34, 66, 72];
  const SILL = [150, 120, 100];
  const MULCH = [86, 60, 42];
  const GRAVEL = [196, 186, 162];
  const PLANK = [168, 124, 82];
  const WATER = [52, 120, 140];
  const FROND = [56, 146, 76];
  const BUTTERFLY_COLOURS = [[70, 140, 255], [255, 150, 40], [250, 230, 90], [230, 70, 90], [190, 120, 240]];
  /** The glasshouse wall: night-dark panes in white frames over a brick sill, leaves pressed to the glass. */
  const glassWall = (g) => {
    g.rect(0, 0, T, T, PANE);
    for (let j = 0; j < 22; j++) g.rect(0, j, T, 1, alpha([90, 140, 130], 50 - j * 2));
    g.ellipse(6, 20, 7, 3, alpha(sh(FROND, 0.6), 200));
    g.ellipse(27, 16, 6, 2.5, alpha(sh(FROND, 0.5), 200));
    const r = rng(B);
    for (let i = 0; i < 14; i++) g.set(2 + Math.floor(r() * 28), 3 + Math.floor(r() * 18), [200, 230, 226, 150]);
    g.rect(0, 0, T, 2, sh(FRAME, 0.7));
    g.rect(0, 2, T, 1, FRAME);
    g.rect(0, 0, 2, 26, FRAME);
    g.rect(16, 0, 2, 26, FRAME);
    g.rect(0, 12, T, 1, FRAME);
    g.rect(2, 3, 1, 9, alpha([255, 255, 255], 90));
    g.rect(18, 3, 1, 9, alpha([255, 255, 255], 90));
    g.rect(0, 24, T, 8, SILL);
    g.noise(0, 24, T, 8, 0.12, B + 50);
    for (const y of [27, 30]) g.rect(0, y, T, 1, sh(SILL, 0.75));
    for (const [x, y] of [[8, 24], [24, 27], [14, 30]]) g.rect(x, y, 1, 3, sh(SILL, 0.75));
    g.rect(0, 24, T, 1, sh(SILL, 1.25));
    g.rect(0, T - 1, T, 1, sh(SILL, 0.6));
  };
  // B+0 glass wall front, B+1 in a left wall, B+2 in a right wall
  drawTile(B, glassWall);
  drawTile(B + 1, turned(glassWall, 'ccw'));
  drawTile(B + 2, turned(glassWall, 'cw'));
  // B+3 boardwalk: weathered planks running across
  drawTile(B + 3, (g) => {
    const r = rng(B + 3);
    for (let y = 0; y < T; y += 8) {
      g.rect(0, y, T, 8, sh(PLANK, 0.88 + r() * 0.2));
      g.rect(0, y, T, 1, sh(PLANK, 1.2));
      g.rect(0, y + 7, T, 1, sh(PLANK, 0.6));
      const seam = Math.floor(r() * 24) + 4;
      g.rect(seam, y, 1, 8, sh(PLANK, 0.6));
      g.set(seam - 3, y + 3, sh(PLANK, 0.5));
      g.set(seam + 3, y + 3, sh(PLANK, 0.5));
    }
    g.noise(0, 0, T, T, 0.1, B + 3);
  });
  // B+4 bark mulch between the beds, with a few fallen leaves
  drawTile(B + 4, (g) => {
    g.rect(0, 0, T, T, MULCH);
    const r = rng(B + 4);
    for (let i = 0; i < 90; i++) g.rect(Math.floor(r() * 31), Math.floor(r() * 31), 2, 1, sh(MULCH, 0.7 + r() * 0.7));
    for (const [x, y, c] of [[6, 8, [120, 150, 60]], [22, 21, [170, 120, 50]], [25, 5, [90, 140, 70]]]) {
      g.ellipse(x, y, 2.5, 1.5, c);
      g.set(x - 2, y + 1, sh(c, 0.7));
    }
  });
  // B+5 gravel path
  drawTile(B + 5, (g) => {
    g.rect(0, 0, T, T, GRAVEL);
    const r = rng(B + 5);
    for (let i = 0; i < 160; i++) {
      const x = Math.floor(r() * T), y = Math.floor(r() * T);
      g.set(x, y, sh(GRAVEL, 0.72 + r() * 0.5));
      if (r() < 0.3) g.set(x + 1, y, sh(GRAVEL, 1.15));
    }
  });
  // B+6..B+11 lily pond, three tiles wide and two tall: water in a ring of stones, pads, a lotus and koi
  drawPiece([[B + 6, B + 7, B + 8], [B + 9, B + 10, B + 11]], (g, { obj }) => {
    obj((o) => {
      o.ellipse(48, 32, 47, 31, [128, 124, 116]);
      const r = rng(B + 6);
      for (let i = 0; i < 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        o.ellipse(48 + Math.cos(t) * 43, 32 + Math.sin(t) * 27, 4 + r() * 2, 3 + r() * 1.5, sh([140, 136, 126], 0.85 + r() * 0.3));
      }
      o.ellipse(48, 33, 40, 24, WATER);
      for (let j = 0; j < 10; j++) o.ellipse(48, 30 - j, 38 - j * 3, 20 - j * 2, alpha(sh(WATER, 1.2), 30));
      o.ellipse(48, 37, 36, 18, alpha(sh(WATER, 0.7), 90));
    });
    for (const [x, y, rx] of [[26, 26, 6], [64, 22, 7], [40, 44, 5], [72, 40, 6]]) {
      g.ellipse(x, y, rx, rx * 0.6, [70, 150, 70]);
      g.ellipse(x - 1, y - 1, rx - 2, rx * 0.4, [96, 178, 90]);
      g.rect(x, y - 1, rx, 1, sh(WATER, 0.9));
    }
    g.ellipse(64, 19, 3, 2.5, [250, 180, 210]);
    g.ellipse(64, 18, 1.5, 1.2, [255, 240, 200]);
    for (const [x, y, c] of [[46, 30, [240, 120, 40]], [56, 38, [250, 250, 240]]]) {
      g.ellipse(x, y, 4, 1.8, c);
      g.rect(x + 4, y - 1, 2, 3, sh(c, 0.85));
      g.set(x - 2, y - 1, [30, 30, 30]);
    }
    for (const [x, y] of [[34, 34], [58, 26]]) { g.rect(x, y, 5, 1, [200, 236, 240, 150]); g.rect(x + 1, y + 2, 3, 1, [200, 236, 240, 110]); }
  });
  /** A big tropical leaf: an ellipse with a midrib, drawn at an angle from a base point. */
  const leaf = (o, x, y, dx, dy, len, wid, col) => {
    const n = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 0; i <= len; i++) {
      const t = i / len;
      const w = Math.sin(t * Math.PI) * wid;
      const cx = x + (dx / n) * i, cy = y + (dy / n) * i;
      o.ellipse(cx, cy, w + 0.5, w * 0.7 + 0.5, i % 3 ? col : sh(col, 0.9));
    }
    for (let i = 1; i < len; i++) o.set(x + (dx / n) * i, y + (dy / n) * i, sh(col, 1.35));
  };
  // B+12, B+13 raised plant bed: a timber box of soil, big leaves and red and orange flowers
  drawPiece([[B + 12, B + 13]], (g, { obj, shadow }) => {
    shadow(32, 29, 31, 3);
    obj((o) => {
      o.box(1, 16, 62, 13, [120, 84, 54], 1.25);
      o.rect(1, 21, 62, 1, [96, 66, 42]);
      o.rect(3, 15, 58, 3, [60, 42, 30]);
      const r = rng(B + 12);
      for (let i = 0; i < 9; i++) {
        const x = 6 + i * 6.5;
        leaf(o, x, 17, (r() - 0.5) * 6, -6, 11 + Math.floor(r() * 5), 3.2, sh(FROND, 0.8 + r() * 0.4));
      }
      for (const [x, y, c] of [[12, 6, [230, 60, 60]], [28, 3, [255, 150, 40]], [44, 7, [240, 80, 150]], [56, 4, [255, 200, 60]]]) {
        o.ellipse(x, y, 3, 2.5, c);
        o.ellipse(x, y - 1, 1.5, 1, sh(c, 1.4));
      }
    });
  });
  // B+14, B+15 palm planter: a round stone pot with the trunk rising out of it (the crown is on the above layer)
  drawPiece([[B + 14, B + 15]], (g, { obj, shadow }) => {
    shadow(32, 29, 18, 3);
    obj((o) => {
      for (let y = 0; y < 22; y++) {
        const x = 30 + Math.round(Math.sin(y / 6) * 1.5);
        o.rect(x, y, 5, 1, y % 4 ? [130, 100, 66] : [100, 76, 50]);
      }
      o.ellipse(32, 22, 16, 5, [176, 110, 80]);
      o.box(18, 22, 28, 7, [176, 110, 80], 1.2);
      o.ellipse(32, 22, 13, 3, [70, 50, 36]);
      leaf(o, 26, 21, -6, -2, 8, 2.5, FROND);
      leaf(o, 38, 21, 6, -2, 8, 2.5, sh(FROND, 0.85));
    });
  });
  // B+16..B+19 palm crown (above the avatars): fronds spreading from the top of the trunk
  drawPiece([[B + 16, B + 17], [B + 18, B + 19]], (g) => {
    const o = canvas(64, 64);
    const fronds = [[-1, 0.25, 26], [1, 0.25, 26], [-1, -0.4, 30], [1, -0.4, 30], [-0.45, -1, 32], [0.45, -1, 32], [0, -1, 34], [-0.6, 0.8, 14], [0.6, 0.8, 14]];
    fronds.forEach(([dx, dy, len], i) => leaf(o, 32, 46, dx * 10, dy * 10, len, 5.5, sh(FROND, 0.8 + (i % 4) * 0.12)));
    o.ellipse(32, 46, 4, 3, [110, 84, 54]);
    for (const [x, y] of [[29, 49], [35, 50]]) o.ellipse(x, y, 2.5, 2.5, [150, 110, 60]);
    o.outline([20, 50, 30]);
    g.paste(o);
  });
  // B+20 vines hanging from the roof (above the avatars)
  drawTile(B + 20, (g) => {
    const o = canvas(T, T);
    for (const [x, len] of [[5, 26], [14, 16], [22, 30], [28, 12]]) {
      for (let y = 0; y < len; y++) o.set(x + Math.round(Math.sin(y / 4 + x) * 1.2), y, [60, 110, 50]);
      for (let y = 3; y < len; y += 4) {
        const cx = x + Math.round(Math.sin(y / 4 + x) * 1.2);
        o.ellipse(cx + (y % 8 ? 2 : -2), y, 2.5, 1.6, y % 8 ? FROND : sh(FROND, 1.2));
      }
    }
    o.outline([20, 50, 30]);
    g.paste(o);
  });
  /** A butterfly seen from above: four wing lobes around a dark body. */
  const butterfly = (o, x, y, col, s = 1) => {
    o.ellipse(x - 2.5 * s, y - 1.5 * s, 2.5 * s, 2 * s, col);
    o.ellipse(x + 2.5 * s, y - 1.5 * s, 2.5 * s, 2 * s, col);
    o.ellipse(x - 2 * s, y + 1.5 * s, 1.8 * s, 1.6 * s, sh(col, 0.8));
    o.ellipse(x + 2 * s, y + 1.5 * s, 1.8 * s, 1.6 * s, sh(col, 0.8));
    o.set(x - 3 * s, y - 2 * s, sh(col, 1.5));
    o.set(x + 2 * s, y - 2 * s, sh(col, 1.5));
    o.rect(x, y - 2, 1, 5, [30, 26, 30]);
  };
  // B+21 butterflies in the air (above the avatars)
  drawTile(B + 21, (g) => {
    const o = canvas(T, T);
    butterfly(o, 8, 9, BUTTERFLY_COLOURS[0], 1.3);
    butterfly(o, 23, 6, BUTTERFLY_COLOURS[1]);
    butterfly(o, 18, 22, BUTTERFLY_COLOURS[2], 1.1);
    o.outline([30, 26, 40]);
    g.paste(o);
  });
  // B+22 climate controller on the glass wall: a steel box, a red error display and a crashed status light
  drawTile(B + 22, (g) => {
    glassWall(g);
    const o = canvas(T, T);
    o.box(4, 3, 24, 22, [200, 204, 196], 1.15);
    o.rect(6, 5, 20, 8, [30, 20, 24]);
    o.rect(8, 7, 4, 4, [255, 70, 60]);
    o.rect(13, 7, 2, 4, [255, 70, 60]);
    o.rect(16, 7, 8, 1, [255, 70, 60]);
    o.rect(16, 9, 6, 1, [255, 140, 120]);
    o.ellipse(10, 18, 3, 3, [90, 96, 104]);
    o.rect(10, 16, 1, 3, [255, 255, 255]);
    o.ellipse(20, 18, 2.5, 2.5, [230, 50, 40]);
    o.set(19, 17, [255, 200, 190]);
    o.rect(6, 22, 20, 1, [120, 200, 120]);
    o.outline();
    g.paste(o);
  });
  // B+23 noticeboard, B+24 clipboard, B+25 keypad and B+26 whiteboard, hung on the glass wall
  onWall(B + 23, 9, glassWall);
  onWall(B + 24, 26, glassWall);
  onWall(B + 25, 13, glassWall);
  onWall(B + 26, 22, glassWall);
  // B+27 feeding station: a table of cut fruit and nectar dishes with sponges, butterflies already on it
  drawTile(B + 27, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      deskBase(o, [150, 110, 72]);
      o.ellipse(9, 12, 5, 2.5, [240, 240, 236]);
      o.ellipse(8, 11, 2.5, 1.8, [255, 150, 40]);
      o.ellipse(11, 12, 2.5, 1.8, [255, 170, 60]);
      o.ellipse(23, 12, 5, 2.5, [240, 240, 236]);
      o.rect(20, 10, 6, 2, [250, 220, 90]);
      o.ellipse(16, 8, 3, 1.5, [120, 200, 230]);
      o.rect(14, 7, 4, 1, [250, 220, 90]);
    });
    const o = canvas(T, T);
    butterfly(o, 10, 6, BUTTERFLY_COLOURS[0]);
    butterfly(o, 24, 5, BUTTERFLY_COLOURS[4]);
    o.outline([30, 26, 40]);
    g.paste(o);
  });
  // B+28 strip curtain in the airlock opening (above the avatars): clear PVC strips on a rail
  drawTile(B + 28, (g) => {
    g.rect(0, 0, T, 3, [150, 156, 164]);
    g.rect(0, 0, T, 1, [200, 206, 214]);
    for (let x = 1; x < T; x += 5) {
      g.rect(x, 3, 4, 27, [210, 236, 240, 90]);
      g.rect(x, 3, 1, 27, [240, 255, 255, 150]);
      g.rect(x + 3, 3, 1, 27, [140, 180, 190, 110]);
    }
  });
  // B+29 puddle on the path with leaves in it, from the misting (decor)
  drawTile(B + 29, (g) => {
    g.ellipse(16, 18, 12, 6, [70, 110, 120, 130]);
    g.ellipse(14, 17, 7, 3, [160, 200, 210, 90]);
    g.ellipse(21, 20, 3, 1.5, [120, 160, 60]);
    g.ellipse(9, 16, 2.5, 1.5, [180, 120, 50]);
    for (const [x, y] of [[26, 9], [5, 26], [28, 26]]) g.set(x, y, [120, 170, 190, 200]);
  });
  // B+30 heliconia in a pot: red lobster-claw flowers over long leaves
  drawTile(B + 30, (g, { obj, shadow }) => {
    shadow(16, 29, 9, 2);
    obj((o) => {
      leaf(o, 16, 22, -5, -6, 14, 3, FROND);
      leaf(o, 16, 22, 5, -6, 14, 3, sh(FROND, 0.85));
      leaf(o, 16, 22, 0, -6, 16, 3, sh(FROND, 1.1));
      for (let i = 0; i < 4; i++) {
        o.rect(12 + (i % 2) * 6, 5 + i * 3, 4, 2, [230, 50, 40]);
        o.set(12 + (i % 2) * 6, 5 + i * 3, [255, 220, 60]);
      }
      o.box(9, 21, 14, 8, [176, 110, 80], 1.2);
    });
  });
  // B+31 garden bench (a seat, not solid): slatted wood on iron legs, seen from behind
  drawTile(B + 31, (g, { obj, shadow }) => {
    shadow(16, 28, 14, 2);
    obj((o) => {
      for (const x of [3, 27]) o.rect(x, 12, 2, 16, [50, 54, 58]);
      for (let y = 4; y < 12; y += 3) o.box(1, y, 30, 2, PLANK, 1.25);
      for (let y = 14; y < 22; y += 3) o.box(1, y, 30, 2, sh(PLANK, 1.08), 1.25);
    });
  });
  solid(B, B + 1, B + 2, ...range(B + 6, B + 15), ...range(B + 22, B + 27), B + 30);
}
// --- end python-debug ---

// --- stats-fair restyle (tiles 496-527) ---
// The Rigged Fair: Kleeberg's autumn fair after midnight. A painted fairground hoarding with bulbs
// all round, trampled night grass, a sawdust midway past the stalls, a cobbled plaza at the east
// gate, a carousel in the middle, a high striker and a food court under string lights.
{
  const B = blockOf('stats-fair');
  const BOARD_RED = [150, 44, 54];
  const BOARD_CREAM = [222, 204, 160];
  const NIGHT_GRASS = [44, 72, 48];
  const SAWDUST = [178, 146, 100];
  const COBBLE = [104, 102, 110];
  const BULB = [255, 214, 120];
  const BULB_COLOURS = [[255, 90, 90], [255, 214, 90], [110, 200, 255], [130, 240, 140], [240, 130, 240]];
  const GOLDEN = [222, 182, 82];
  /** A row of lit bulbs with soft halos along y, every `step` pixels. */
  const bulbs = (g, y, step, cols = [BULB], x0 = 2) => {
    let i = 0;
    for (let x = x0; x < T; x += step, i++) {
      const c = cols[i % cols.length];
      g.ellipse(x + 0.5, y + 0.5, 3.5, 3.5, alpha(c, 50));
      g.rect(x, y, 2, 2, c);
      g.set(x, y, sh(c, 1.4));
    }
  };
  /** The fairground hoarding: red and cream boards under a navy rail of bulbs. */
  const hoarding = (g) => {
    for (let x = 0; x < T; x += 4) g.rect(x, 0, 4, T, (x / 4) % 2 ? BOARD_CREAM : BOARD_RED);
    g.noise(0, 0, T, T, 0.08, B);
    for (let x = 0; x < T; x += 4) g.rect(x, 0, 1, T, sh((x / 4) % 2 ? BOARD_CREAM : BOARD_RED, 0.7));
    for (let j = 0; j < T; j++) g.rect(0, j, T, 1, [12, 16, 40, 60 + Math.round(j * 1.5)]);
    g.rect(0, 0, T, 8, [34, 38, 70]);
    g.rect(0, 0, T, 2, [20, 22, 44]);
    g.rect(0, 8, T, 1, GOLDEN);
    bulbs(g, 4, 8, [BULB], 3);
    g.rect(0, 22, T, 1, GOLDEN);
    g.rect(0, T - 4, T, 4, [36, 34, 40]);
    g.rect(0, T - 4, T, 1, [70, 66, 76]);
  };
  // B+0 hoarding, B+1 in a left wall, B+2 in a right wall
  drawTile(B, hoarding);
  drawTile(B + 1, turned(hoarding, 'ccw'));
  drawTile(B + 2, turned(hoarding, 'cw'));
  // B+3 trampled grass at night
  drawTile(B + 3, (g) => {
    g.rect(0, 0, T, T, NIGHT_GRASS);
    const r = rng(B + 3);
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(r() * T), y = Math.floor(r() * T);
      g.rect(x, y, 1, 2, sh(NIGHT_GRASS, 0.75 + r() * 0.6));
    }
    for (let i = 0; i < 4; i++) g.ellipse(4 + r() * 24, 4 + r() * 24, 3, 1.5, alpha(sh(NIGHT_GRASS, 0.7), 140));
  });
  // B+4 sawdust and straw on the midway
  drawTile(B + 4, (g) => {
    g.rect(0, 0, T, T, SAWDUST);
    g.noise(0, 0, T, T, 0.14, B + 4);
    const r = rng(B + 4);
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(r() * 30), y = Math.floor(r() * 31);
      g.rect(x, y, 2 + Math.floor(r() * 3), 1, r() < 0.5 ? [226, 200, 120] : sh(SAWDUST, 0.7));
    }
  });
  // B+5 cobbles at the gate
  drawTile(B + 5, (g) => {
    g.rect(0, 0, T, T, sh(COBBLE, 0.55));
    const r = rng(B + 5);
    for (let row = 0; row < 4; row++)
      for (let i = -1; i < 5; i++) {
        const x = i * 8 + (row % 2 ? 4 : 0) + 4, y = row * 8 + 4;
        const c = sh(COBBLE, 0.85 + r() * 0.3);
        g.ellipse(x, y, 3.6, 3.2, c);
        g.rect(x - 2, y - 2, 2, 1, sh(c, 1.25));
      }
  });
  // B+6..B+14 carousel, three tiles square: a striped canopy on a golden pole, horses round the edge
  drawPiece([[B + 6, B + 7, B + 8], [B + 9, B + 10, B + 11], [B + 12, B + 13, B + 14]], (g, { obj, shadow }) => {
    shadow(48, 86, 44, 8);
    for (let j = 0; j < 8; j++) g.ellipse(48, 72, 46 - j * 2, 20 - j, alpha(BULB, 10));
    obj((o) => {
      // platform
      o.ellipse(48, 76, 44, 14, [120, 64, 50]);
      o.ellipse(48, 73, 44, 13, [200, 170, 120]);
      o.ellipse(48, 73, 36, 9, [184, 150, 100]);
      // poles and horses
      for (let i = 0; i < 5; i++) {
        const x = 14 + i * 17;
        o.rect(x, 34, 2, 38, GOLDEN);
        const hc = [[250, 246, 236], [150, 100, 70], [250, 246, 236], [60, 50, 50], [250, 246, 236]][i];
        o.box(x - 6, 54 + (i % 2) * 4, 13, 7, hc, 1.2);
        o.rect(x + 5, 50 + (i % 2) * 4, 4, 6, hc);
        o.rect(x + 7, 49 + (i % 2) * 4, 3, 2, sh(hc, 0.8));
        o.rect(x - 5, 61 + (i % 2) * 4, 2, 5, hc);
        o.rect(x + 3, 61 + (i % 2) * 4, 2, 5, hc);
        o.rect(x - 2, 54 + (i % 2) * 4, 5, 2, [200, 50, 60]);
      }
      o.rect(46, 20, 4, 54, GOLDEN);
      // canopy: a striped cone with a scalloped edge
      for (let y = 4; y < 36; y++) {
        const half = 6 + (y - 4) * 1.35;
        for (let x = Math.round(48 - half); x <= 48 + half; x++) {
          const seg = Math.floor(((x - 48) / half + 1) * 5);
          o.set(x, y, seg % 2 ? [236, 230, 214] : [200, 44, 60]);
        }
      }
      for (let x = 6; x < 92; x += 8) o.ellipse(x + 4, 36, 4, 3, Math.floor(x / 8) % 2 ? [236, 230, 214] : [200, 44, 60]);
      o.rect(5, 34, 87, 2, GOLDEN);
      o.ellipse(48, 4, 4, 3, GOLDEN);
      o.rect(47, 0, 2, 3, GOLDEN);
    });
    bulbs(g, 34, 8, BULB_COLOURS, 0);
    for (let x = 8; x < 96; x += 8) {
      const c = BULB_COLOURS[(x / 8) % 5];
      g.ellipse(x + 0.5, 34.5, 3.5, 3.5, alpha(c, 50));
      g.rect(x, 34, 2, 2, c);
    }
  });
  // B+15 string lights strung across the fair (above the avatars)
  drawTile(B + 15, (g) => {
    for (let x = 0; x < T; x++) g.set(x, 6 + Math.round(Math.sin((x / T) * Math.PI) * 4), [30, 30, 36]);
    for (const [i, x] of [4, 12, 20, 28].entries()) {
      const y = 7 + Math.round(Math.sin((x / T) * Math.PI) * 4);
      const c = BULB_COLOURS[i % 5];
      g.ellipse(x, y + 2, 6, 6, alpha(c, 45));
      g.ellipse(x, y + 2, 3.5, 3.5, alpha(c, 90));
      g.rect(x - 1, y, 3, 4, c);
      g.set(x, y + 1, [255, 255, 240]);
    }
  });
  // B+16..B+18 a striped awning (above the avatars): left end, middle, right end
  const awning = (g, left, right) => {
    const o = canvas(T, T);
    for (let x = 0; x < T; x++) {
      const red = Math.floor(x / 8) % 2 === 0;
      o.rect(x, 2, 1, 12, red ? [200, 44, 60] : [236, 230, 214]);
    }
    for (let x = 0; x < T; x += 8) o.ellipse(x + 4, 14, 4, 3, Math.floor(x / 8) % 2 === 0 ? [200, 44, 60] : [236, 230, 214]);
    o.rect(0, 2, T, 1, [255, 255, 255]);
    if (left) o.rect(0, 2, 2, 22, [120, 90, 60]);
    if (right) o.rect(T - 2, 2, 2, 22, [120, 90, 60]);
    o.outline();
    g.paste(o);
  };
  drawTile(B + 16, (g) => awning(g, true, false));
  drawTile(B + 17, (g) => awning(g, false, false));
  drawTile(B + 18, (g) => awning(g, false, true));
  // B+19 the gate post: a sturdy post with a four-digit keypad and the night guard's note
  drawTile(B + 19, (g, { obj, shadow }) => {
    shadow(16, 29, 9, 2);
    obj((o) => {
      o.box(11, 4, 10, 25, [92, 72, 54], 1.25);
      o.box(9, 1, 14, 4, [70, 54, 40], 1.25);
      o.box(10, 8, 12, 12, [60, 64, 76], 1.2);
      o.rect(12, 10, 8, 2, [120, 230, 160]);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) o.rect(12 + i * 3, 13 + j * 2, 2, 1, [210, 214, 222]);
      paper(o, 12, 21, 8, 6);
      o.rect(15, 21, 2, 1, [220, 60, 60]);
    });
  });
  // B+20 clipboard, B+21 noticeboard and B+22 the fair map poster, hung on the hoarding
  onWall(B + 20, 26, hoarding);
  onWall(B + 21, 9, hoarding);
  onWall(B + 22, 65, hoarding);
  // B+23 lamp post: a cast-iron post with a lantern (its glow is B+24 on the above layer)
  drawTile(B + 23, (g, { obj, shadow }) => {
    shadow(16, 29, 6, 2);
    obj((o) => {
      o.box(14, 8, 4, 20, [44, 48, 56], 1.4);
      o.box(11, 26, 10, 3, [44, 48, 56], 1.3);
      o.box(11, 0, 10, 9, [44, 48, 56], 1.4);
      o.rect(12, 2, 8, 5, [255, 224, 140]);
      o.rect(13, 3, 3, 2, [255, 250, 220]);
    });
  });
  // B+24 a lantern's glow (above the avatars)
  drawTile(B + 24, (g) => {
    for (let j = 0; j < 10; j++) g.ellipse(16, 5, 16 - j * 1.4, 12 - j, alpha(BULB, 12 + j * 3));
    g.ellipse(16, 5, 4, 3, alpha([255, 250, 220], 160));
  });
  // B+25 candy-floss cart: a striped cart with a pink cloud in a drum and a pole of bags
  drawTile(B + 25, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      o.box(3, 14, 26, 11, [236, 230, 214], 1.1);
      for (let x = 5; x < 28; x += 6) o.rect(x, 15, 3, 9, [230, 120, 160]);
      o.ellipse(8, 27, 3, 3, [50, 50, 56]);
      o.ellipse(24, 27, 3, 3, [50, 50, 56]);
      o.ellipse(12, 12, 7, 3, [200, 206, 214]);
      o.ellipse(12, 9, 6, 4, [255, 190, 220]);
      o.ellipse(11, 8, 3, 2, [255, 225, 240]);
      o.rect(24, 1, 2, 13, [200, 206, 214]);
      for (const [x, y, c] of [[20, 3, [190, 230, 255]], [26, 4, [255, 190, 220]], [21, 8, [255, 190, 220]], [27, 9, [190, 230, 255]]]) o.ellipse(x, y, 2.5, 3, c);
    });
  });
  // B+26 hay bales, stacked
  drawTile(B + 26, (g, { obj, shadow }) => {
    shadow(16, 29, 14, 2);
    obj((o) => {
      const hay = [214, 180, 90];
      o.box(2, 17, 14, 11, hay, 1.2);
      o.box(16, 17, 14, 11, sh(hay, 0.95), 1.2);
      o.box(8, 7, 15, 11, sh(hay, 1.05), 1.2);
      for (const [x, y, w] of [[2, 21, 14], [16, 21, 14], [8, 11, 15]]) { o.rect(x, y, w, 1, [150, 110, 50]); o.rect(x, y + 3, w, 1, [150, 110, 50]); }
      o.noise(2, 7, 28, 21, 0.18, B + 26);
    });
  });
  // B+27 balloons tied to a stall (above the avatars)
  drawTile(B + 27, (g) => {
    const o = canvas(T, T);
    for (const [x, y, c] of [[9, 7, [230, 60, 70]], [17, 4, [250, 210, 70]], [24, 8, [90, 160, 240]], [14, 12, [120, 210, 120]], [21, 14, [230, 120, 220]]]) {
      for (let j = 0; j < 30 - y; j++) o.set(16 + Math.round(((x - 16) * (30 - y - j)) / (30 - y)), y + 4 + j, [220, 220, 220]);
      o.ellipse(x, y, 4, 4.8, c);
      o.ellipse(x - 1.5, y - 2, 1.2, 1.5, sh(c, 1.5));
    }
    o.outline();
    g.paste(o);
  });
  // B+28 litter on the midway: a dropped popcorn tub and torn tickets (decor)
  drawTile(B + 28, (g) => {
    g.rect(6, 15, 9, 7, [0, 0, 0, 50]);
    g.rect(5, 13, 8, 7, [236, 230, 214]);
    for (let x = 5; x < 13; x += 3) g.rect(x, 13, 1, 7, [200, 44, 60]);
    for (const [x, y] of [[14, 15], [16, 18], [13, 20], [18, 14], [19, 21]]) g.ellipse(x, y, 1.5, 1.2, [255, 244, 200]);
    g.rect(21, 7, 6, 3, [230, 180, 70]);
    g.rect(24, 7, 1, 3, [180, 130, 40]);
    g.rect(7, 25, 5, 3, [120, 190, 230]);
  });
  // B+29 warm light pool on the ground (decor)
  drawTile(B + 29, (g) => {
    for (let j = 0; j < 8; j++) g.ellipse(16, 16, 16 - j * 2, 14 - j * 1.6, alpha(BULB, 14));
  });
  // B+30, B+31 high striker: the bell and the top of the tower (above), the base with the lever pad (walls)
  drawPiece([[B + 30], [B + 31]], (g, { obj, shadow }) => {
    shadow(16, 61, 13, 3);
    obj((o) => {
      o.box(12, 6, 8, 50, [236, 230, 214], 1.1);
      for (let y = 10; y < 54; y += 8) o.rect(12, y, 8, 3, [200, 44, 60]);
      o.rect(15, 8, 2, 46, [60, 60, 70]);
      o.box(13, 36, 6, 4, [250, 210, 70]);
      o.ellipse(16, 4, 6, 4, GOLDEN);
      o.ellipse(15, 3, 2, 1.5, [255, 240, 190]);
      o.box(4, 52, 24, 8, [120, 84, 54], 1.2);
      o.box(9, 50, 14, 4, [60, 60, 70], 1.2);
      o.box(22, 40, 3, 14, [150, 110, 70]);
      o.box(20, 38, 7, 4, [90, 90, 100]);
    });
    for (const y of [16, 26]) for (const x of [10, 22]) { g.ellipse(x, y, 2.5, 2.5, alpha(BULB, 70)); g.rect(x - 1, y - 1, 2, 2, BULB); }
  });
  solid(B, B + 1, B + 2, ...range(B + 6, B + 14), B + 19, B + 20, B + 21, B + 22, B + 23, B + 25, B + 26, B + 31);
}
// --- end stats-fair ---

// --- stats-ab restyle (tiles 528-559) ---
// The Chocolate Experiment: Kakaowerk Kleeberg at midnight. A marble foyer with the exit and the
// release console, Ana's wood-floored analytics office, a checkered blind-tasting room and the long
// packing hall: conveyor lines, the checkweigher, a copper conche, moulds, pallets and cocoa sacks.
{
  const B = blockOf('stats-ab');
  const CREAM = [234, 222, 198];
  const COCOA = [92, 56, 38];
  const CHOC = [118, 70, 44];
  const MILK = [168, 112, 70];
  const COPPER = [200, 124, 72];
  const GOLD = [214, 172, 78];
  const BRAND = [150, 36, 54];
  const STEEL = [176, 184, 196];
  const WRAPS = [[150, 36, 54], [64, 110, 170], [214, 172, 78], [70, 140, 90], [120, 70, 44]];
  /** The factory's wall face: cream glazed bricks above a chocolate-brown band with a gold line. */
  const factoryWall = (g) => {
    g.rect(0, 0, T, T, CREAM);
    g.noise(0, 0, T, T, 0.05, B);
    g.rect(0, 0, T, 2, sh(CREAM, 0.66));
    for (let y = 2, r = 0; y < T - 7; y += 6, r++) {
      g.rect(0, y, T, 1, sh(CREAM, 0.84));
      for (let x = r % 2 ? 0 : 8; x < T; x += 16) g.rect(x, y, 1, 6, sh(CREAM, 0.84));
      g.rect(0, y + 1, T, 1, sh(CREAM, 1.06));
    }
    g.rect(0, T - 7, T, 7, COCOA);
    g.rect(0, T - 7, T, 1, sh(COCOA, 1.35));
    g.rect(0, T - 5, T, 1, GOLD);
    g.rect(0, T - 1, T, 1, sh(COCOA, 0.7));
  };
  /** A chocolate bar in a coloured wrapper, seen from above. */
  const wrapped = (o, x, y, col, w = 7, h = 4) => {
    o.box(x, y, w, h, col, 1.25);
    o.rect(x + 2, y + 1, Math.max(1, w - 4), h - 2, [246, 236, 214]);
  };
  // B+0 factory wall front
  drawTile(B, factoryWall);
  // B+1 packing hall floor: sealed grey-green concrete with speckles and a seam
  drawTile(B + 1, (g) => {
    const c = [148, 152, 142];
    g.rect(0, 0, T, T, c);
    g.noise(0, 0, T, T, 0.07, B + 1);
    const r = rng(B + 1);
    for (let i = 0; i < 26; i++) g.set(Math.floor(r() * T), Math.floor(r() * T), sh(c, r() < 0.5 ? 0.8 : 1.15));
    g.rect(0, 0, T, 1, sh(c, 0.8));
    g.rect(0, 0, 1, T, sh(c, 0.8));
    g.rect(1, 1, T - 1, 1, sh(c, 1.06));
  });
  // B+2 tasting room floor: cream and cocoa checks
  drawTile(B + 2, (g) => {
    for (const [x, y] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
      const c = (x + y) % 32 ? [170, 122, 86] : [232, 220, 196];
      g.rect(x, y, 16, 16, c);
      g.rect(x, y, 16, 1, sh(c, 1.1));
      g.rect(x, y + 15, 16, 1, sh(c, 0.86));
    }
    g.noise(0, 0, T, T, 0.06, B + 2);
  });
  // B+3 foyer floor: polished caramel marble slabs with pale veins
  drawTile(B + 3, (g) => {
    const c = [196, 150, 112];
    g.rect(0, 0, T, T, c);
    g.noise(0, 0, T, T, 0.05, B + 3);
    for (let i = 0; i < 26; i++) g.set(3 + i, 6 + Math.round(Math.sin(i / 4) * 3 + i / 3), sh(c, 1.22));
    for (let i = 0; i < 14; i++) g.set(16 + i, 22 + Math.round(Math.sin(i / 3) * 2), sh(c, 1.16));
    for (let i = 0; i < 6; i++) g.set(4 + i, 26 - i, [255, 244, 226, 90]);
    g.rect(0, 0, T, 1, sh(c, 0.74));
    g.rect(0, 0, 1, T, sh(c, 0.74));
    g.rect(1, 1, T - 1, 1, sh(c, 1.1));
  });
  // B+4, B+5 factory wall front in a left and a right wall
  drawTile(B + 4, turned(factoryWall, 'ccw'));
  drawTile(B + 5, turned(factoryWall, 'cw'));
  solid(B, B + 4, B + 5);
  // B+6..B+9 conveyor line, four tiles: a wrapping hood on the left, then a belt of bars on rollers
  drawPiece([[B + 6, B + 7, B + 8, B + 9]], (g, { obj, shadow }) => {
    shadow(64, 29, 62, 3);
    obj((o) => {
      o.box(0, 11, 128, 11, [58, 60, 70], 1.3);
      for (let x = 2; x < 128; x += 4) o.rect(x, 12, 1, 9, [76, 80, 94]);
      o.rect(0, 21, 128, 2, STEEL);
      for (const x of [3, 40, 84, 121]) o.rect(x, 23, 3, 7, sh(STEEL, 0.7));
      // the wrapping hood
      o.box(2, 2, 28, 19, [206, 210, 216], 1.15);
      o.rect(2, 2, 28, 3, BRAND);
      o.rect(2, 4, 28, 1, sh(BRAND, 0.75));
      o.rect(5, 8, 10, 5, [30, 40, 36]);
      o.rect(6, 9, 6, 1, [120, 230, 160]);
      o.rect(6, 11, 4, 1, [255, 200, 120]);
      o.ellipse(22, 10, 2.5, 2.5, [230, 60, 50]);
      o.ellipse(22, 10, 1, 1, [255, 170, 160]);
      for (let x = 4; x < 28; x += 3) o.rect(x, 16, 2, 5, [150, 156, 166]);
      const r = rng(B + 6);
      for (let x = 34, i = 0; x < 122; x += 11, i++) wrapped(o, x + Math.floor(r() * 2), 13 + (i % 2), WRAPS[i % WRAPS.length]);
    });
  });
  // B+10 the checkweigher: a steel platform with a bar on it and a display head reading 100.8
  drawTile(B + 10, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      o.box(1, 14, 30, 8, STEEL, 1.2);
      o.rect(3, 16, 26, 1, sh(STEEL, 0.8));
      o.rect(4, 22, 3, 8, sh(STEEL, 0.7));
      o.rect(25, 22, 3, 8, sh(STEEL, 0.7));
      o.rect(14, 22, 4, 6, [70, 74, 84]);
      o.rect(23, 4, 3, 11, [90, 96, 108]);
      o.box(14, 0, 17, 8, [52, 56, 70], 1.3);
      o.rect(15, 2, 15, 4, [20, 30, 26]);
      for (const [x, w] of [[16, 2], [19, 2], [22, 1], [24, 2]]) o.rect(x, 3, w, 2, [120, 240, 160]);
      o.set(27, 3, [255, 90, 70]);
      o.set(28, 3, [255, 90, 70]);
      wrapped(o, 4, 9, BRAND, 9, 5);
    });
  });
  // B+11..B+14 the conche: a round copper tank of molten chocolate with a stirring arm, on legs
  drawPiece([[B + 11, B + 12], [B + 13, B + 14]], (g, { obj, shadow }) => {
    shadow(32, 58, 28, 5);
    obj((o) => {
      o.rect(9, 44, 4, 14, sh(STEEL, 0.6));
      o.rect(51, 44, 4, 14, sh(STEEL, 0.6));
      o.rect(30, 46, 4, 12, sh(STEEL, 0.6));
      o.ellipse(32, 36, 27, 16, sh(COPPER, 0.8));
      o.rect(5, 22, 54, 14, COPPER);
      for (let x = 6; x < 58; x += 1) {
        const f = 1 + 0.35 * Math.cos(((x - 32) / 27) * 1.5);
        o.rect(x, 22, 1, 14, sh(COPPER, f > 1.2 ? 1.25 : f > 1.05 ? 1.05 : 0.85));
      }
      o.ellipse(32, 22, 27, 12, sh(COPPER, 1.15));
      o.ellipse(32, 22, 24, 10, [60, 34, 22]);
      o.ellipse(32, 23, 22, 8.5, CHOC);
      // the swirl of the stirred chocolate
      for (let a = 0; a < 26; a++) {
        const t = a / 4, rr = 2 + a * 0.75;
        o.set(32 + Math.cos(t) * rr * 0.95, 23 + Math.sin(t) * rr * 0.36, sh(MILK, 1.1));
      }
      o.ellipse(26, 20, 4, 1.4, [190, 132, 88, 200]);
      o.rect(12, 30, 40, 2, sh(COPPER, 0.7));
      o.box(28, 4, 8, 12, [70, 74, 84], 1.3);
      o.rect(31, 14, 2, 9, STEEL);
      o.rect(19, 20, 26, 2, STEEL);
      o.box(40, 34, 13, 9, [52, 56, 70], 1.3);
      o.rect(42, 36, 6, 2, [120, 230, 160]);
      o.ellipse(50, 37, 1.5, 1.5, [230, 60, 50]);
      o.rect(10, 37, 6, 3, GOLD);
    });
    // drips running down the side
    for (const [x, l] of [[14, 6], [18, 4], [47, 5]]) g.rect(x, 30, 2, l, alpha(CHOC, 230));
  });
  // B+15 chocolate spill on the floor (decor)
  drawTile(B + 15, (g) => {
    g.ellipse(15, 18, 12, 7, alpha(COCOA, 220));
    g.ellipse(24, 23, 5, 3, alpha(COCOA, 220));
    g.ellipse(13, 16, 7, 3, alpha(CHOC, 230));
    g.ellipse(11, 15, 3, 1, [210, 160, 120, 200]);
    g.ellipse(6, 26, 2, 1.5, alpha(COCOA, 220));
  });
  // B+16 floor drain (decor): a round steel grate
  drawTile(B + 16, (g) => {
    g.ellipse(16, 17, 9, 6, [70, 74, 80]);
    g.ellipse(16, 16, 8, 5, [128, 134, 142]);
    for (let x = 10; x < 23; x += 3) g.rect(x, 13, 1, 7, [52, 56, 62]);
    g.ellipse(16, 17, 9, 6, [0, 0, 0, 30]);
  });
  // B+17 hanging factory lamp (above the avatars): a green enamel dome and a strong cone of light
  drawTile(B + 17, (g) => {
    for (let j = 0; j < 21; j++) g.rect(Math.round(16 - (5 + j * 0.55)), 11 + j, Math.round(10 + j * 1.1), 1, [255, 240, 180, Math.round(95 - j * 3.5)]);
    g.ellipse(16, 29, 10, 2.5, [255, 244, 200, 60]);
    const o = canvas(T, T);
    o.rect(15, 0, 2, 3, [40, 44, 50]);
    o.ellipse(16, 8, 10, 5.5, [52, 112, 88]);
    o.ellipse(15, 6, 6, 2.5, sh([52, 112, 88], 1.4));
    o.rect(6, 9, 21, 2, [36, 78, 62]);
    o.ellipse(16, 11, 5, 2, [255, 252, 220]);
    o.outline();
    g.paste(o);
  });
  // B+18 overhead pipe (above the avatars): a copper chocolate pipe with a hanger and a flange
  drawTile(B + 18, (g) => {
    const o = canvas(T, T);
    o.rect(14, 0, 3, 7, [60, 64, 72]);
    o.box(0, 6, T, 7, COPPER, 1.3, 0.7);
    o.rect(0, 8, T, 1, sh(COPPER, 1.45));
    o.box(12, 4, 7, 11, sh(COPPER, 0.85), 1.25);
    o.outline();
    g.paste(o);
    g.ellipse(16, 24, 12, 2, [0, 0, 0, 40]);
  });
  // B+19 blind-tasting booth: a white table with a divider, a plate of two squares, a card and water
  drawTile(B + 19, (g, { obj, shadow }) => {
    shadow(16, 29, 14, 2);
    obj((o) => {
      o.box(1, 1, 30, 12, [196, 186, 168], 1.15);
      o.rect(3, 3, 26, 1, sh([196, 186, 168], 0.85));
      o.box(1, 12, 30, 10, [244, 240, 232], 1.05, 0.85);
      o.rect(3, 22, 3, 8, COCOA);
      o.rect(26, 22, 3, 8, COCOA);
      o.ellipse(11, 15, 6, 3, [255, 255, 255]);
      o.box(7, 13, 4, 3, CHOC, 1.3);
      o.box(12, 13, 4, 3, sh(CHOC, 1.2), 1.3);
      paper(o, 18, 13, 6, 7);
      o.box(26, 10, 3, 5, [190, 226, 240]);
    });
  });
  // B+20 mould trolley: a steel rack of trays with rows of moulded bars
  drawTile(B + 20, (g, { obj, shadow }) => {
    shadow(16, 29, 12, 2);
    obj((o) => {
      o.rect(4, 2, 2, 26, sh(STEEL, 0.8));
      o.rect(26, 2, 2, 26, sh(STEEL, 0.8));
      for (let s = 0; s < 3; s++) {
        const y = 3 + s * 8;
        o.box(3, y, 26, 6, STEEL, 1.2);
        for (let i = 0; i < 5; i++) o.box(5 + i * 5, y + 1, 4, 3, s === 1 ? sh(CHOC, 1.3) : CHOC, 1.3);
      }
      for (const x of [5, 27]) o.ellipse(x, 29, 2, 1.5, [40, 40, 46]);
    });
  });
  // B+21 the tasting protocol: a clipboard on a wooden easel by the tasting room's door
  drawTile(B + 21, (g, { obj, shadow }) => {
    shadow(16, 29, 10, 2);
    obj((o) => {
      o.rect(8, 6, 2, 24, WOOD_DARK);
      o.rect(22, 6, 2, 24, WOOD_DARK);
      o.rect(15, 2, 2, 22, sh(WOOD_DARK, 0.85));
      o.box(6, 2, 20, 22, [196, 150, 96], 1.15);
      o.rect(12, 1, 8, 3, STEEL);
      o.box(8, 5, 16, 17, [250, 248, 238], 1, 0.86);
      o.rect(9, 6, 14, 3, BRAND);
      for (let y = 10; y < 21; y += 2) o.rect(10, y, 10 - (y % 3), 1, [130, 130, 145]);
      o.ellipse(20, 18, 2, 2, GOLD);
    });
  });
  // B+22, B+23 the night guard's desk: a curved wood counter with a monitor, a logbook and a bell
  drawPiece([[B + 22, B + 23]], (g, { obj, shadow }) => {
    shadow(32, 29, 30, 3);
    obj((o) => {
      o.box(2, 12, 60, 16, WOOD, 1.25);
      o.rect(2, 14, 60, 1, sh(WOOD, 0.8));
      o.rect(2, 20, 60, 2, GOLD);
      o.box(26, 16, 12, 9, BRAND, 1.2);
      o.ellipse(32, 20, 3, 3, GOLD);
      o.box(6, 1, 18, 12, [52, 56, 70], 1.3);
      o.rect(8, 3, 14, 8, [24, 40, 46]);
      for (let i = 0; i < 4; i++) o.rect(9 + (i % 2) * 7, 4 + Math.floor(i / 2) * 4, 5, 3, [70, 110, 120]);
      o.rect(12, 13, 6, 1, [70, 74, 84]);
      o.box(36, 7, 14, 6, [240, 236, 222], 1, 0.85);
      o.rect(43, 7, 1, 6, [180, 170, 150]);
      o.ellipse(56, 10, 3, 2.5, GOLD);
      o.rect(55, 7, 2, 1, sh(GOLD, 1.3));
    });
  });
  // B+24 chocolate display cabinet: a glass case of wrapped bars on a wooden base
  drawTile(B + 24, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(3, 0, 26, 21, [210, 230, 236], 1.1);
      for (let s = 0; s < 3; s++) {
        o.rect(4, 6 + s * 6, 24, 1, [170, 190, 200]);
        for (let i = 0; i < 3; i++) wrapped(o, 5 + i * 8, 2 + s * 6, WRAPS[(i + s * 2) % WRAPS.length], 6, 4);
      }
      for (let i = 0; i < 6; i++) o.set(6 + i, 18 - i * 2, [255, 255, 255, 160]);
      o.box(2, 20, 28, 10, CHOC, 1.25);
      o.rect(4, 24, 24, 1, GOLD);
    });
  });
  // B+25, B+26 the Kleeberg sign on the factory wall: a gold-framed plate with a cocoa pod and lettering
  drawPiece([[B + 25, B + 26]], (g) => {
    const wall = canvas(T, T);
    factoryWall(wall);
    g.paste(wall);
    g.paste(wall, T);
    const o = canvas(2 * T, T);
    o.box(3, 4, 58, 18, BRAND, 1.25);
    o.rect(4, 5, 56, 1, GOLD);
    o.rect(4, 20, 56, 1, GOLD);
    o.ellipse(12, 13, 5, 6.5, [176, 104, 48]);
    o.ellipse(12, 13, 3.5, 5.5, [206, 136, 66]);
    for (let y = 8; y < 19; y += 2) o.set(12, y, [140, 76, 34]);
    o.rect(12, 5, 1, 2, [70, 120, 60]);
    // K L E E B E R G as blocky gold letters
    const letters = ['K', 'L', 'E', 'E', 'B', 'E', 'R', 'G'];
    const font = {
      K: ['101', '110', '100', '110', '101'], L: ['100', '100', '100', '100', '111'], E: ['111', '100', '110', '100', '111'],
      B: ['110', '101', '110', '101', '110'], R: ['110', '101', '110', '101', '101'], G: ['111', '100', '101', '101', '111'],
    };
    letters.forEach((ch, i) => font[ch].forEach((row, y) => [...row].forEach((b, x) => b === '1' && o.set(21 + i * 5 + x, 10 + y, sh(GOLD, 1.2)))));
    o.outline();
    g.paste(o);
  });
  // B+27 Ana's testing binder: a low shelf of ring binders with the thick red one open on top
  drawTile(B + 27, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      o.box(2, 12, 28, 17, WOOD, 1.25);
      o.rect(4, 14, 24, 13, sh(WOOD, 0.6));
      for (let i = 0; i < 6; i++) {
        const col = [BRAND, [64, 110, 170], [70, 140, 90], GOLD, [64, 110, 170], [230, 226, 214]][i];
        o.box(5 + i * 4, 15, 3, 12, col, 1.2);
        o.rect(6 + i * 4, 23, 1, 2, [250, 248, 238]);
      }
      o.box(6, 4, 20, 9, BRAND, 1.2);
      o.box(7, 2, 9, 9, [250, 248, 238], 1, 0.86);
      o.box(16, 2, 9, 9, [250, 248, 238], 1, 0.86);
      for (let y = 4; y < 10; y += 2) { o.rect(9, y, 5, 1, [130, 130, 145]); o.rect(18, y, 5, 1, [130, 130, 145]); }
      for (let y = 3; y < 10; y += 2) o.set(16, y, STEEL);
    });
  });
  // B+28 a pallet of chocolate cartons, shrink-wrapped
  drawTile(B + 28, (g, { obj, shadow }) => {
    shadow(16, 30, 14, 2);
    obj((o) => {
      o.box(1, 25, 30, 5, [170, 130, 84], 1.25);
      for (const x of [3, 14, 25]) o.rect(x, 27, 4, 3, [90, 64, 40]);
      const carton = [196, 150, 100];
      for (const [x, y] of [[2, 14], [16, 14], [2, 3], [16, 3]]) {
        o.box(x, y, 14, 11, carton, 1.2);
        o.rect(x, y + 4, 14, 1, sh(carton, 0.8));
        o.ellipse(x + 7, y + 7, 2.5, 2, BRAND);
      }
    });
    for (let y = 3; y < 25; y += 5) g.rect(2, y, 28, 1, [255, 255, 255, 50]);
  });
  // B+29 spilt cocoa beans (decor)
  drawTile(B + 29, (g) => {
    const r = rng(B + 29);
    for (let i = 0; i < 16; i++) {
      const x = 4 + Math.floor(r() * 24), y = 6 + Math.floor(r() * 22);
      g.ellipse(x + 0.5, y + 1, 2.5, 1.5, [0, 0, 0, 50]);
      g.ellipse(x, y, 2.5, 1.6, [110, 62, 40]);
      g.set(x - 1, y - 1, [170, 110, 74]);
      g.set(x + 1, y, [70, 38, 24]);
    }
  });
  // B+30 the factory clock on the wall: midnight
  drawTile(B + 30, (g) => {
    factoryWall(g);
    const o = canvas(T, T);
    o.ellipse(16, 12, 10, 10, COCOA);
    o.ellipse(16, 12, 8.5, 8.5, [250, 246, 232]);
    for (let a = 0; a < 12; a++) o.set(16 + Math.round(Math.sin((a / 6) * Math.PI) * 7), 12 - Math.round(Math.cos((a / 6) * Math.PI) * 7), COCOA);
    o.rect(16, 5, 1, 7, [30, 30, 36]);
    o.rect(15, 7, 1, 5, [30, 30, 36]);
    o.set(16, 12, BRAND);
    o.outline();
    g.paste(o);
  });
  solid(B + 6, B + 7, B + 8, B + 9, B + 10, B + 11, B + 12, B + 13, B + 14, B + 19, B + 20, B + 21, B + 22, B + 23, B + 24, B + 25, B + 26, B + 27, B + 28, B + 30);
  // B+31 the quality manual's clipboard, hung on the factory wall
  onWall(B + 31, 26, factoryWall);
}
// --- end stats-ab ---

// --- nn-post restyle (tiles 560-591) ---
// The Night Post: Kleeberg station post office at ten past eleven. The public counter hall by the
// exit, with the envelope scanner and a yellow post box; Ferdinand's workshop; and the sorting hall
// below, where Iris, the letter reader, stands under an overhead letter belt, with numbered bins,
// pigeonholes, mail carts and sacks, and Jonas's desk by the archive.
{
  const B = blockOf('nn-post');
  const PLASTER = [226, 214, 168];
  const GREEN = [46, 92, 74];
  const POST = [242, 196, 48];
  const PAPER = [246, 240, 224];
  const CANVAS = [176, 170, 150];
  const IRIS = [104, 128, 118];
  const STEEL = [170, 178, 190];
  const BRASS = [204, 164, 76];
  /** The post office's wall face: pale yellow plaster above a dark green tiled dado and a wooden rail. */
  const postWall = (g) => {
    g.rect(0, 0, T, T, PLASTER);
    g.noise(0, 0, T, T, 0.05, B);
    g.rect(0, 0, T, 2, sh(PLASTER, 0.68));
    g.rect(0, 2, T, 1, sh(PLASTER, 1.08));
    g.rect(0, 15, T, T - 15, GREEN);
    g.noise(0, 15, T, T - 15, 0.08, B + 100);
    for (let y = 19; y < T - 1; y += 4) g.rect(0, y, T, 1, sh(GREEN, 0.8));
    for (let y = 19, r = 0; y < T - 1; y += 4, r++) for (let x = r % 2 ? 2 : 6; x < T; x += 8) g.rect(x, y, 1, 4, sh(GREEN, 0.8));
    g.rect(0, 14, T, 3, WOOD);
    g.rect(0, 14, T, 1, sh(WOOD, 1.3));
    g.rect(0, 16, T, 1, sh(WOOD, 0.7));
    g.rect(0, T - 1, T, 1, sh(GREEN, 0.6));
  };
  /** A small 3 x 5 digit, for bin labels and readouts. */
  const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001001010010', '111101111101111', '111101111001111'];
  const digit = (o, x, y, n, col) => [...DIGITS[n]].forEach((b, i) => b === '1' && o.set(x + (i % 3), y + Math.floor(i / 3), col));
  // B+0 post office wall front, B+1 and B+2 the same in a left and a right wall
  drawTile(B, postWall);
  drawTile(B + 1, turned(postWall, 'ccw'));
  drawTile(B + 2, turned(postWall, 'cw'));
  solid(B, B + 1, B + 2);
  // B+3 counter hall floor: terrazzo, cream with dark and green chips, in large slabs
  drawTile(B + 3, (g) => {
    const c = [214, 206, 188];
    g.rect(0, 0, T, T, c);
    g.noise(0, 0, T, T, 0.05, B + 3);
    const r = rng(B + 3);
    for (let i = 0; i < 40; i++) {
      const col = [[90, 84, 78], [70, 120, 96], [180, 150, 110], [250, 246, 236]][Math.floor(r() * 4)];
      g.rect(Math.floor(r() * 31), Math.floor(r() * 31), r() < 0.3 ? 2 : 1, 1, col);
    }
    g.rect(0, 0, T, 1, sh(c, 0.72));
    g.rect(0, 0, 1, T, sh(c, 0.72));
  });
  // B+4 sorting hall floor: worn oak boards laid lengthwise, darkened by decades of carts
  drawTile(B + 4, (g) => {
    const c = [128, 96, 66];
    g.rect(0, 0, T, T, c);
    g.noise(0, 0, T, T, 0.09, B + 4);
    for (let y = 0; y < T; y += 6) {
      g.rect(0, y, T, 1, sh(c, 0.7));
      g.rect(0, y + 1, T, 1, sh(c, 1.08));
    }
    for (const [x, y] of [[7, 0], [23, 6], [14, 12], [3, 18], [27, 24], [11, 30]]) g.rect(x, y + 1, 1, 5, sh(c, 0.72));
    for (const [x, y] of [[18, 3], [5, 14], [25, 21]]) g.set(x, y, sh(c, 0.6));
  });
  // B+5 a yellow lane line painted across the floor (decor), worn
  drawTile(B + 5, (g) => {
    for (let x = 0; x < T; x += 16) g.rect(x + 2, 14, 12, 3, [236, 196, 60, 210]);
    const r = rng(B + 5);
    for (let i = 0; i < 10; i++) g.set(Math.floor(r() * T), 14 + Math.floor(r() * 3), [140, 110, 70, 160]);
  });
  // B+6..B+11 Iris, the letter reader: a big grey-green machine, three tiles wide and two tall.
  // Bottom row from the left: her brass type plate, her control panel with the start keypad, her output tray.
  drawPiece([[B + 6, B + 7, B + 8], [B + 9, B + 10, B + 11]], (g, { obj, shadow }) => {
    shadow(48, 60, 46, 4);
    obj((o) => {
      // the body
      o.box(2, 14, 92, 44, IRIS, 1.2);
      o.rect(2, 14, 92, 4, POST);
      o.rect(2, 17, 92, 1, sh(POST, 0.75));
      o.rect(4, 56, 88, 2, sh(IRIS, 0.6));
      // the letter hopper on top, filled with envelopes
      o.box(8, 2, 30, 14, [70, 74, 84], 1.3);
      for (let i = 0; i < 5; i++) o.box(10 + i * 5, 4 - (i % 2), 6, 8, PAPER, 1, 0.85);
      // the lens and the reading screen
      o.ellipse(52, 28, 9, 9, [44, 48, 56]);
      o.ellipse(52, 28, 6.5, 6.5, [60, 150, 200]);
      o.ellipse(52, 28, 3, 3, [20, 30, 50]);
      o.set(49, 25, [220, 240, 255]);
      o.set(50, 25, [220, 240, 255]);
      o.box(66, 21, 24, 15, [30, 40, 36], 1.4);
      o.rect(68, 23, 20, 11, [18, 30, 26]);
      // a postcode digit on the screen, and a dark power LED until she runs again
      digit(o, 71, 25, 7, [120, 240, 160]);
      digit(o, 75, 25, 2, [120, 240, 160]);
      digit(o, 79, 25, 4, [120, 240, 160]);
      digit(o, 83, 25, 1, [120, 240, 160]);
      o.rect(8, 22, 34, 14, sh(IRIS, 0.85));
      for (let x = 10; x < 40; x += 3) o.rect(x, 24, 1, 10, sh(IRIS, 0.65));
      // bottom row, left: the brass type plate
      o.box(8, 40, 22, 12, BRASS, 1.3);
      o.rect(10, 42, 18, 1, sh(BRASS, 0.7));
      for (let y = 45; y < 50; y += 2) o.rect(10, y, 14 - (y % 3) * 2, 1, sh(BRASS, 0.6));
      for (const [x, y] of [[9, 41], [28, 41], [9, 50], [28, 50]]) o.set(x, y, sh(BRASS, 0.5));
      // middle: the control panel with a keypad and a big start button
      o.box(38, 39, 22, 15, [70, 74, 84], 1.3);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) o.rect(40 + i * 4, 41 + j * 4, 3, 3, [210, 214, 222]);
      o.ellipse(55, 46, 3.5, 3.5, [220, 50, 50]);
      o.ellipse(54, 45, 1.5, 1.5, [255, 160, 150]);
      // right: the output tray with sorted letters
      o.box(66, 42, 26, 12, [90, 96, 108], 1.3);
      o.rect(68, 44, 22, 8, [52, 56, 66]);
      for (let i = 0; i < 4; i++) o.box(69 + i * 5, 43, 4, 7, PAPER, 1, 0.85);
    });
  });
  // B+12, B+13 the sorting bins: ten wooden cubbies numbered 0 to 9, some holding letters
  drawPiece([[B + 12, B + 13]], (g, { obj, shadow }) => {
    shadow(32, 29, 30, 3);
    obj((o) => {
      o.box(1, 4, 62, 24, WOOD, 1.25);
      for (let i = 0; i < 10; i++) {
        const row = i < 5 ? 0 : 1;
        const cx = 3 + (i % 5) * 12;
        o.rect(cx, 6 + row * 11, 10, 9, sh(WOOD, 0.55));
        o.rect(cx, 13 + row * 11, 10, 2, sh(WOOD, 1.2));
        if ((i * 7) % 3) o.box(cx + 1, 8 + row * 11, 8, 5, PAPER, 1, 0.85);
        o.rect(cx + 3, 13 + row * 11, 4, 2, POST);
        digit(o, cx + 6, 6 + row * 11, i, POST);
      }
      o.rect(3, 28, 4, 2, sh(WOOD, 0.6));
      o.rect(57, 28, 4, 2, sh(WOOD, 0.6));
    });
  });
  // B+14 mail cart: a canvas hamper on a steel frame, full of letters
  drawTile(B + 14, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      o.box(3, 8, 26, 18, CANVAS, 1.15);
      o.rect(3, 12, 26, 2, POST);
      o.rect(3, 8, 26, 2, STEEL);
      for (const [x, y] of [[6, 3], [12, 5], [17, 2], [22, 4]]) o.box(x, y, 7, 6, PAPER, 1, 0.85);
      o.rect(10, 4, 3, 2, [200, 60, 56]);
      for (const x of [6, 26]) o.ellipse(x, 28, 2.5, 2, [40, 40, 46]);
      o.rect(4, 26, 24, 1, STEEL);
    });
  });
  // B+15 a pile of mail sacks, grey canvas with a yellow band
  drawTile(B + 15, (g, { obj, shadow }) => {
    shadow(16, 29, 14, 2);
    obj((o) => {
      for (const [cx, cy, rx] of [[10, 21, 8], [22, 21, 8], [16, 12, 8]]) {
        o.ellipse(cx, cy, rx, 7, CANVAS);
        o.ellipse(cx - 2, cy - 2, rx - 4, 3, sh(CANVAS, 1.15));
        o.rect(cx - rx + 2, cy + 1, 2 * rx - 4, 2, POST);
        o.rect(cx - 1, cy - 8, 3, 3, sh(CANVAS, 0.8));
      }
    });
  });
  // B+16 parcel shelf: a steel rack of brown parcels with labels and string
  drawTile(B + 16, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(2, 0, 28, 30, STEEL, 1.15);
      for (let s = 0; s < 3; s++) {
        const y = 2 + s * 9;
        o.rect(4, y, 24, 7, [60, 64, 76]);
        const r = rng(B + 16 + s);
        for (let x = 5; x < 27;) {
          const w = 5 + Math.floor(r() * 4);
          if (x + w > 27) break;
          const h = 4 + Math.floor(r() * 3);
          o.box(x, y + 7 - h, w, h, [196, 152, 100], 1.2);
          o.rect(x + Math.floor(w / 2), y + 7 - h, 1, h, [240, 230, 210]);
          x += w + 1;
        }
        o.rect(4, y + 7, 24, 2, sh(STEEL, 1.1));
      }
    });
  });
  // B+17 a yellow post box on a post, with the horn
  drawTile(B + 17, (g, { obj, shadow }) => {
    shadow(16, 29, 8, 2);
    obj((o) => {
      o.rect(14, 18, 4, 11, [60, 64, 72]);
      o.box(7, 3, 18, 17, POST, 1.25);
      o.ellipse(16, 4, 9, 3, sh(POST, 1.1));
      o.rect(10, 8, 12, 2, [40, 40, 46]);
      o.ellipse(16, 14, 3, 2, [40, 40, 46]);
      o.ellipse(16, 14, 1.5, 1, POST);
      o.rect(19, 13, 3, 1, [40, 40, 46]);
    });
  });
  // B+18, B+19 the public counter: dark wood with brass grilles and a glass screen, two windows
  drawPiece([[B + 18, B + 19]], (g, { obj, shadow }) => {
    shadow(32, 29, 31, 3);
    obj((o) => {
      o.box(0, 15, 64, 13, WOOD_DARK, 1.3);
      o.rect(0, 17, 64, 1, sh(WOOD_DARK, 0.8));
      for (const x of [6, 38]) o.rect(x, 20, 20, 5, sh(WOOD_DARK, 1.2));
      o.box(0, 12, 64, 4, WOOD, 1.3);
      o.rect(0, 1, 64, 11, [190, 220, 230, 140]);
      for (let x = 0; x < 64; x += 32) o.box(x, 0, 2, 13, BRASS, 1.3);
      o.box(62, 0, 2, 13, BRASS, 1.3);
      o.rect(0, 0, 64, 2, BRASS);
      for (const x of [8, 40]) {
        o.rect(x, 3, 16, 7, [24, 28, 34, 90]);
        for (let i = 0; i < 16; i += 3) o.rect(x + i, 3, 1, 7, BRASS);
        o.rect(x, 9, 16, 1, BRASS);
      }
      for (let i = 0; i < 5; i++) o.set(36 + i, 8 - i, [255, 255, 255, 170]);
      o.box(26, 10, 6, 3, PAPER, 1, 0.85);
      o.box(52, 9, 5, 4, [200, 60, 56], 1.2);
    });
  });
  // B+20 opal globe lamp (above the avatars), hung on a long rod, with a warm glow
  drawTile(B + 20, (g) => {
    for (let j = 0; j < 9; j++) g.ellipse(16, 13, 15 - j, 15 - j, [255, 236, 170, 9]);
    for (let j = 0; j < 12; j++) g.rect(Math.round(16 - (5 + j * 0.8)), 18 + j, Math.round(10 + j * 1.6), 1, [255, 236, 170, Math.round(55 - j * 4)]);
    const o = canvas(T, T);
    o.rect(15, 0, 2, 6, [50, 52, 60]);
    o.rect(13, 5, 6, 2, BRASS);
    o.ellipse(16, 13, 7, 7, [252, 246, 226]);
    o.ellipse(14, 11, 3, 3, [255, 255, 250]);
    o.outline();
    g.paste(o);
  });
  // B+21 letters spilt on the floor during the power cut (decor)
  drawTile(B + 21, (g) => {
    for (const [x, y, w, h] of [[4, 6, 9, 6], [17, 12, 8, 6], [8, 20, 9, 6], [21, 23, 7, 5]]) {
      g.rect(x + 1, y + 1, w, h, [0, 0, 0, 50]);
      g.rect(x, y, w, h, [96, 84, 70]);
      g.rect(x + 1, y + 1, w - 2, h - 2, PAPER);
      g.set(x + 1, y + 1, [190, 184, 170]);
      g.rect(x + 2, y + 2, w - 4, 1, [200, 194, 180]);
      g.set(x + w - 2, y + 1, [200, 60, 56]);
    }
  });
  // B+22 Ferdinand's workbench: an open circuit board of Iris, a soldering iron and a magnifier lamp
  drawTile(B + 22, (g, { obj, shadow }) => {
    shadow(16, 29, 14, 2);
    obj((o) => {
      deskBase(o, [150, 112, 74]);
      o.box(4, 6, 16, 9, [40, 120, 76], 1.3);
      for (let i = 0; i < 4; i++) o.rect(6 + i * 3, 8, 2, 3, [30, 34, 40]);
      o.rect(6, 12, 12, 1, BRASS);
      o.rect(21, 8, 8, 2, [200, 60, 56]);
      o.rect(27, 9, 4, 1, STEEL);
      o.rect(24, 1, 2, 9, [60, 64, 72]);
      o.ellipse(25, 2, 4, 2, [60, 64, 72]);
      o.ellipse(25, 2, 2.5, 1, [200, 230, 255]);
    });
  });
  // B+23 the archive: a cabinet of long card drawers, one pulled open with digit cards
  drawTile(B + 23, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(2, 0, 28, 30, [150, 112, 74], 1.2);
      for (let j = 0; j < 4; j++)
        for (let i = 0; i < 2; i++) {
          o.box(4 + i * 13, 2 + j * 7, 11, 6, sh([150, 112, 74], 1.12), 1.2);
          o.rect(8 + i * 13, 4 + j * 7, 3, 2, BRASS);
        }
      o.box(4, 21, 11, 8, sh([150, 112, 74], 0.85), 1.2);
      for (let i = 0; i < 4; i++) o.box(5 + i * 2, 17 + (i % 2), 3, 6, PAPER, 1, 0.85);
      digit(o, 6, 19, 3, [40, 40, 46]);
    });
  });
  // B+24 pigeonholes, B+25 the departure board, B+26 Jonas's noticeboard, B+27 the scanner's manual,
  // all hung on the post office wall
  onWall(B + 24, 108, postWall, 108);
  onWall(B + 25, 111, postWall, 111);
  onWall(B + 26, 9, postWall);
  onWall(B + 27, 26, postWall);
  // B+28 the station clock on the wall: ten past eleven
  drawTile(B + 28, (g) => {
    postWall(g);
    const o = canvas(T, T);
    o.rect(15, 0, 2, 3, [60, 64, 72]);
    o.ellipse(16, 12, 10, 10, [40, 44, 52]);
    o.ellipse(16, 12, 8.5, 8.5, [250, 250, 246]);
    for (let a = 0; a < 12; a++) o.set(16 + Math.round(Math.sin((a / 6) * Math.PI) * 7), 12 - Math.round(Math.cos((a / 6) * Math.PI) * 7), [40, 44, 52]);
    // hour hand just past eleven, minute hand at two
    o.rect(13, 8, 1, 2, [30, 30, 36]);
    o.rect(14, 9, 1, 3, [30, 30, 36]);
    o.rect(16, 11, 4, 1, [30, 30, 36]);
    o.rect(19, 10, 2, 1, [30, 30, 36]);
    o.set(16, 12, [200, 50, 50]);
    o.outline();
    g.paste(o);
  });
  // B+29 the envelope scanner: a beige machine with a slot, a test envelope in it and a paper strip
  drawTile(B + 29, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      deskBase(o, [120, 110, 100]);
      o.box(3, 3, 26, 12, [222, 212, 188], 1.15);
      o.rect(5, 6, 16, 2, [40, 40, 46]);
      o.box(7, 1, 12, 6, PAPER, 1, 0.85);
      o.rect(9, 3, 7, 1, [130, 130, 145]);
      o.set(17, 2, [200, 60, 56]);
      o.rect(23, 5, 4, 3, [30, 40, 36]);
      o.rect(24, 6, 2, 1, SCREEN);
      o.rect(5, 10, 6, 1, POST);
      o.box(14, 12, 4, 9, PAPER, 1, 0.85);
      for (let y = 14; y < 20; y += 2) o.rect(15, y, 2, 1, [60, 60, 70]);
    });
  });
  // B+30 waiting bench (a seat, not solid): a wooden slatted bench on iron legs
  drawTile(B + 30, (g, { obj, shadow }) => {
    shadow(16, 28, 14, 2);
    obj((o) => {
      o.box(1, 6, 30, 5, WOOD, 1.25);
      o.box(1, 14, 30, 8, WOOD, 1.25);
      o.rect(1, 17, 30, 1, sh(WOOD, 0.8));
      for (const x of [3, 27]) o.rect(x, 10, 2, 18, [50, 52, 60]);
    });
  });
  // B+31 the overhead letter belt (above the avatars): a belt on hangers carrying envelopes to Iris
  drawTile(B + 31, (g) => {
    g.rect(0, 22, T, 4, [0, 0, 0, 40]);
    const o = canvas(T, T);
    for (const x of [4, 26]) o.rect(x, 0, 2, 8, [50, 52, 60]);
    o.box(0, 7, T, 9, [76, 80, 92], 1.3);
    o.rect(0, 15, T, 2, STEEL);
    envelope(o, 3, 8, 9, 6);
    envelope(o, 19, 9, 9, 6);
    o.outline();
    g.paste(o);
  });
  solid(B + 6, B + 7, B + 8, B + 9, B + 10, B + 11, B + 12, B + 13, B + 14, B + 15, B + 16, B + 17, B + 18, B + 19, B + 22, B + 23, B + 28, B + 29);
}
// --- end nn-post ---

// --- nn-tablets restyle (tiles 592-623) ---
// The Varda Tablets: the basement of Hallberg City Museum at night. Sandstone walls; a small gallery
// with the cylinder seal in its case, plinths and banners; a stone vestibule by the stairs (the exit);
// Amara's office; the restoration lab with its big fragment table, light table and laser scanner; and
// the crate store where the jar waits to be packed.
{
  const B = blockOf('nn-tablets');
  const SAND = [206, 182, 140];
  const SLATE = [74, 70, 76];
  const OAK = [168, 120, 76];
  const STONE = [188, 180, 166];
  const STEEL = [170, 178, 190];
  const STRAW = [226, 196, 110];
  const PINE = [214, 178, 118];
  const BANNER = [130, 46, 40];
  /** The museum's wall face: sandstone blocks above a dark slate plinth. */
  const stoneWall = (g) => {
    g.rect(0, 0, T, T, SAND);
    g.noise(0, 0, T, T, 0.07, B);
    g.rect(0, 0, T, 2, sh(SAND, 0.66));
    for (let y = 2, r = 0; y < T - 6; y += 8, r++) {
      g.rect(0, y, T, 1, sh(SAND, 0.78));
      for (let x = r % 2 ? 4 : 20; x < T; x += 16) g.rect(x, y, 1, 8, sh(SAND, 0.78));
      g.rect(0, y + 1, T, 1, sh(SAND, 1.08));
    }
    g.rect(0, T - 6, T, 6, SLATE);
    g.rect(0, T - 6, T, 1, sh(SLATE, 1.4));
    g.rect(0, T - 1, T, 1, sh(SLATE, 0.7));
  };
  // B+0 sandstone wall front, B+1 and B+2 the same in a left and a right wall
  drawTile(B, stoneWall);
  drawTile(B + 1, turned(stoneWall, 'ccw'));
  drawTile(B + 2, turned(stoneWall, 'cw'));
  solid(B, B + 1, B + 2);
  // B+3 gallery floor: oak parquet in a basket weave of four-strip squares
  drawTile(B + 3, (g) => {
    for (const [x0, y0] of [[0, 0], [16, 0], [0, 16], [16, 16]]) {
      const across = (x0 + y0) % 32 === 0;
      for (let i = 0; i < 4; i++) {
        const c = sh(OAK, [1.04, 0.94, 1.0, 0.9][(i + x0 / 16) % 4]);
        if (across) {
          g.rect(x0, y0 + i * 4, 16, 4, c);
          g.rect(x0, y0 + i * 4, 16, 1, sh(c, 0.8));
        } else {
          g.rect(x0 + i * 4, y0, 4, 16, c);
          g.rect(x0 + i * 4, y0, 1, 16, sh(c, 0.8));
        }
      }
      g.rect(x0, y0, 16, 1, sh(OAK, 0.7));
      g.rect(x0, y0, 1, 16, sh(OAK, 0.7));
    }
    g.noise(0, 0, T, T, 0.08, B + 3);
  });
  // B+4 lab floor: pale grey vinyl tiles with a faint speckle
  drawTile(B + 4, (g) => {
    const c = [196, 202, 204];
    g.rect(0, 0, T, T, c);
    g.noise(0, 0, T, T, 0.05, B + 4);
    const r = rng(B + 4);
    for (let i = 0; i < 18; i++) g.set(Math.floor(r() * T), Math.floor(r() * T), sh(c, 0.8));
    g.rect(0, 0, T, 1, sh(c, 0.82));
    g.rect(0, 0, 1, T, sh(c, 0.82));
  });
  // B+5 clay dust and small chips on the floor (decor)
  drawTile(B + 5, (g) => {
    g.ellipse(16, 18, 13, 8, [182, 116, 74, 50]);
    const r = rng(B + 5);
    for (let i = 0; i < 14; i++) {
      const x = 4 + Math.floor(r() * 24), y = 8 + Math.floor(r() * 18);
      g.rect(x, y, 2, 2, sh(CLAY, 0.8 + r() * 0.4));
      g.set(x, y, sh(CLAY, 1.2));
    }
  });
  // B+6..B+11 the fragment table: a big sorting table, three wide and two deep, covered in labelled
  // trays of clay fragments, with a magnifier on an arm
  drawPiece([[B + 6, B + 7, B + 8], [B + 9, B + 10, B + 11]], (g, { obj, shadow }) => {
    shadow(48, 60, 46, 4);
    obj((o) => {
      for (const x of [5, 87]) o.rect(x, 46, 4, 14, sh(OAK, 0.6));
      for (const x of [44]) o.rect(x, 48, 4, 12, sh(OAK, 0.6));
      o.box(1, 8, 94, 40, [228, 226, 216], 1.08, 0.82);
      o.rect(1, 40, 94, 8, sh(OAK, 0.85));
      o.rect(1, 40, 94, 1, sh(OAK, 1.2));
      // trays in two rows
      let seed = B + 6;
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 5; i++) {
          const x = 5 + i * 18, y = 11 + j * 14;
          o.box(x, y, 15, 11, [236, 230, 210], 1.05, 0.8);
          o.rect(x + 1, y + 1, 13, 9, [208, 196, 170]);
          const r = rng(seed++);
          for (let k = 0; k < 5; k++) tablet(o, x + 1 + Math.floor(r() * 9), y + 1 + Math.floor(r() * 5), 4, 3, seed + k);
          o.rect(x + 4, y + 10, 7, 2, [250, 250, 246]);
        }
      // the magnifier lamp
      o.rect(84, 0, 2, 12, STEEL);
      o.rect(70, 0, 16, 2, STEEL);
      o.ellipse(70, 4, 6, 4, [60, 64, 74]);
      o.ellipse(70, 4, 4, 2.5, [210, 236, 250]);
    });
    for (let j = 0; j < 6; j++) g.ellipse(70, 14 + j, 8 - j, 4, [255, 244, 200, 20]);
  });
  // B+12 tablet rack: a steel rack of shallow drawers, two pulled out with tablets on foam
  drawTile(B + 12, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.box(2, 0, 28, 30, STEEL, 1.15);
      for (let j = 0; j < 5; j++) {
        o.box(4, 2 + j * 5, 24, 4, sh(STEEL, 1.1), 1.2);
        o.rect(14, 3 + j * 5, 4, 1, sh(STEEL, 0.6));
      }
      o.box(3, 11, 26, 5, [70, 74, 84], 1.3);
      tablet(o, 5, 11, 7, 4, B + 12);
      tablet(o, 17, 11, 9, 4, B + 13);
    });
  });
  // B+13 washing sink for fragments: a deep steel basin with a hose, brushes and a sieve
  drawTile(B + 13, (g, { obj, shadow }) => {
    shadow(16, 29, 13, 2);
    obj((o) => {
      benchBase(o);
      o.box(4, 9, 20, 7, STEEL, 1.2);
      o.rect(6, 10, 16, 4, [110, 140, 150]);
      o.rect(7, 11, 6, 1, [180, 220, 230]);
      o.rect(20, 2, 2, 9, [200, 206, 214]);
      o.rect(15, 2, 6, 2, [200, 206, 214]);
      o.ellipse(27, 10, 3, 3, [120, 124, 134]);
      o.ellipse(27, 10, 2, 2, [170, 160, 140]);
      o.rect(25, 4, 2, 5, [200, 60, 56]);
    });
  });
  // B+14 gallery plinth with a painted clay pot under its own light
  drawTile(B + 14, (g, { obj, shadow }) => {
    shadow(16, 30, 11, 2);
    obj((o) => {
      o.box(7, 17, 18, 13, [236, 232, 222], 1.1, 0.82);
      o.ellipse(16, 11, 7, 7, CLAY);
      o.ellipse(14, 9, 3, 3, sh(CLAY, 1.25));
      o.box(12, 2, 8, 3, sh(CLAY, 0.85));
      o.rect(10, 11, 13, 2, INK_BROWN);
      for (let x = 11; x < 22; x += 3) o.set(x, 14, INK_BROWN);
    });
  });
  // B+15 gallery plinth with a carved stone stele
  drawTile(B + 15, (g, { obj, shadow }) => {
    shadow(16, 30, 11, 2);
    obj((o) => {
      o.box(6, 22, 20, 8, [236, 232, 222], 1.1, 0.82);
      o.box(9, 1, 14, 22, STONE, 1.2);
      o.ellipse(16, 2, 7, 2, STONE);
      const r = rng(B + 15);
      for (let y = 5; y < 20; y += 3) for (let x = 11; x < 21; x += 3) if (r() < 0.7) o.rect(x, y, 2, 1, sh(STONE, 0.7));
    });
  });
  // B+16 an open shipping crate, packed with straw
  drawTile(B + 16, (g, { obj, shadow }) => {
    shadow(16, 30, 14, 2);
    obj((o) => {
      o.box(2, 8, 28, 21, PINE, 1.2);
      for (let y = 14; y < 28; y += 5) o.rect(2, y, 28, 1, sh(PINE, 0.75));
      o.rect(4, 10, 24, 4, STRAW);
      const r = rng(B + 16);
      for (let i = 0; i < 20; i++) o.rect(3 + Math.floor(r() * 25), 6 + Math.floor(r() * 7), 3, 1, sh(STRAW, 0.8 + r() * 0.4));
      o.box(18, 1, 12, 7, PINE, 1.2);
    });
  });
  // B+17 the archive crate: a closed crate stencilled VARDA, with a big white label
  drawTile(B + 17, (g, { obj, shadow }) => {
    shadow(16, 30, 14, 2);
    obj((o) => {
      o.box(2, 4, 28, 25, PINE, 1.2);
      o.rect(2, 4, 28, 4, sh(PINE, 1.12));
      for (const x of [2, 27]) o.rect(x, 4, 3, 25, sh(PINE, 0.8));
      o.box(8, 12, 16, 11, [250, 248, 238], 1, 0.86);
      o.rect(10, 14, 12, 2, BANNER);
      for (let y = 17; y < 22; y += 2) o.rect(10, y, 10, 1, [130, 130, 145]);
      o.rect(6, 25, 2, 2, [40, 40, 46]);
      o.rect(24, 25, 2, 2, [40, 40, 46]);
    });
  });
  // B+18 straw spilt on the floor (decor)
  drawTile(B + 18, (g) => {
    const r = rng(B + 18);
    for (let i = 0; i < 34; i++) {
      const x = 3 + Math.floor(r() * 26), y = 6 + Math.floor(r() * 22), l = 2 + Math.floor(r() * 4);
      g.rect(x, y, l, 1, sh(STRAW, 0.75 + r() * 0.5));
    }
  });
  // B+19 drying rack: wooden frames of wire mesh with washed fragments laid out
  drawTile(B + 19, (g, { obj, shadow }) => {
    shadow(16, 30, 13, 2);
    obj((o) => {
      o.rect(3, 2, 2, 28, sh(OAK, 0.7));
      o.rect(27, 2, 2, 28, sh(OAK, 0.7));
      for (let s = 0; s < 3; s++) {
        const y = 3 + s * 9;
        o.box(2, y, 28, 6, OAK, 1.2);
        o.rect(4, y + 1, 24, 4, [150, 156, 160]);
        for (let x = 5; x < 27; x += 4) tablet(o, x, y + 1, 3, 3, B + 19 + s * 10 + x);
      }
    });
  });
  // B+20 exhibition banner (above the avatars): a long red cloth with a Varda sign, hung from a rod
  drawTile(B + 20, (g) => {
    g.rect(9, 27, 16, 3, [0, 0, 0, 40]);
    const o = canvas(T, T);
    o.rect(4, 0, 24, 2, [60, 52, 44]);
    o.rect(8, 2, 16, 22, BANNER);
    o.rect(8, 2, 2, 22, sh(BANNER, 1.25));
    o.rect(22, 2, 2, 22, sh(BANNER, 0.75));
    for (let x = 8; x < 24; x += 4) o.rect(x, 24, 2, 2, BANNER);
    o.ellipse(16, 11, 4, 4, [232, 196, 120]);
    o.ellipse(16, 11, 2.5, 2.5, BANNER);
    o.set(16, 11, [232, 196, 120]);
    o.rect(11, 18, 10, 1, [232, 196, 120]);
    o.rect(12, 20, 8, 1, [232, 196, 120]);
    o.outline();
    g.paste(o);
  });
  // B+21 caged work lamp (above the avatars), hanging on its cable, with a bright cone
  drawTile(B + 21, (g) => {
    for (let j = 0; j < 18; j++) g.rect(Math.round(16 - (4 + j * 0.6)), 12 + j, Math.round(8 + j * 1.2), 1, [255, 246, 210, Math.round(80 - j * 4)]);
    const o = canvas(T, T);
    o.rect(15, 0, 2, 5, [40, 40, 46]);
    o.box(12, 4, 8, 3, [60, 64, 72], 1.3);
    o.ellipse(16, 10, 4.5, 4, [255, 248, 210]);
    for (const x of [12, 16, 20]) o.rect(x, 6, 1, 7, [60, 64, 72]);
    o.rect(12, 12, 9, 1, [60, 64, 72]);
    o.outline();
    g.paste(o);
  });
  // B+22 Theo's note (a clipboard), B+23 the numeral chart, B+24 Amara's sign list (a noticeboard),
  // B+25 the blueprint, B+26 a shelf of tablets: all hung on the sandstone wall
  onWall(B + 22, 26, stoneWall);
  onWall(B + 23, 179, stoneWall, 179);
  onWall(B + 24, 9, stoneWall);
  onWall(B + 25, 110, stoneWall, 110);
  onWall(B + 26, 176, stoneWall, 176);
  // B+27 a framed photo of the dig at Tell Varda on the wall: a mound under a hot sky, a tent
  drawTile(B + 27, (g) => {
    stoneWall(g);
    const o = canvas(T, T);
    o.box(3, 3, 26, 19, [70, 52, 36], 1.3);
    o.rect(5, 5, 22, 15, [150, 196, 230]);
    o.rect(5, 5, 22, 3, [120, 170, 220]);
    o.ellipse(17, 20, 13, 7, [210, 170, 110]);
    o.rect(5, 17, 22, 3, [196, 160, 104]);
    o.rect(8, 13, 5, 4, [240, 236, 226]);
    o.set(10, 12, [240, 236, 226]);
    o.ellipse(23, 8, 2, 2, [255, 236, 150]);
    o.outline();
    g.paste(o);
  });
  // B+28 packing table: bubble wrap, a tape gun and foam blocks
  drawTile(B + 28, (g, { obj, shadow }) => {
    shadow(16, 29, 14, 2);
    obj((o) => {
      deskBase(o, PINE);
      o.box(3, 6, 14, 9, [214, 230, 236], 1.1);
      for (let y = 8; y < 14; y += 2) for (let x = 5; x < 16; x += 2) o.set(x, y, [255, 255, 255]);
      o.box(19, 8, 9, 6, [230, 220, 170], 1.2);
      o.box(21, 4, 6, 4, [200, 60, 56], 1.2);
      o.rect(24, 1, 2, 4, [60, 64, 72]);
    });
  });
  // B+29 museum bench (a seat, not solid): a low upholstered bench
  drawTile(B + 29, (g, { obj, shadow }) => {
    shadow(16, 27, 14, 2);
    obj((o) => {
      o.box(2, 11, 28, 10, [70, 60, 66], 1.3);
      o.rect(2, 13, 28, 1, sh([70, 60, 66], 0.75));
      for (const x of [3, 27]) o.rect(x, 21, 2, 6, [40, 40, 46]);
    });
  });
  // B+30 crate store floor: bare concrete with a painted grid of pallet bays
  drawTile(B + 30, (g) => {
    const c = [150, 150, 146];
    g.rect(0, 0, T, T, c);
    g.noise(0, 0, T, T, 0.08, B + 30);
    const r = rng(B + 30);
    for (let i = 0; i < 12; i++) g.set(Math.floor(r() * T), Math.floor(r() * T), sh(c, 0.75));
    g.rect(0, 0, T, 1, [236, 236, 228, 70]);
    g.rect(0, 0, 1, T, [236, 236, 228, 70]);
  });
  // B+31 a spotlight on a stand, aimed at the exhibits
  drawTile(B + 31, (g, { obj, shadow }) => {
    shadow(16, 29, 8, 2);
    for (let j = 0; j < 8; j++) g.rect(19 + j, 4 - Math.floor(j / 2), 3 + j, 1 + j, [255, 244, 200, 30]);
    obj((o) => {
      o.rect(15, 10, 2, 18, [50, 52, 60]);
      o.rect(11, 27, 10, 2, [50, 52, 60]);
      o.box(11, 3, 10, 7, [40, 42, 50], 1.3);
      o.ellipse(20, 6, 2, 3, [255, 248, 210]);
    });
  });
  solid(B + 6, B + 7, B + 8, B + 9, B + 10, B + 11, B + 12, B + 13, B + 14, B + 15, B + 16, B + 17, B + 19, B + 27, B + 28, B + 31);
}
// --- end nn-tablets ---

// --- ml-seeds restyle (tiles 624-655) ---
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
