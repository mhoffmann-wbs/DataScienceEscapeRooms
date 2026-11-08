// Generates the game's pixel art: the tileset and the avatar parts sheet. All of it is drawn
// here, so it is ours to license (CC0, like the rest of the repo's art).
// Usage: node scripts/generate-art.mjs
// The avatar layout here must match src/game/avatars.ts. Tile indices are referenced by the
// maps (gid = index + 1), so append new tiles instead of reordering.
import { writeFileSync, mkdirSync } from 'node:fs';
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

// --- Tileset: 8 columns x 15 rows of 32px tiles ---------------------------------
const TILESET_COLUMNS = 8;
const TILESET_ROWS = 15;
const tiles = canvas(TILESET_COLUMNS * T, TILESET_ROWS * T);

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
console.log('wrote content/tilesets/tiles.png and content/sprites/avatar-parts.png');
