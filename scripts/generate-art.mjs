// Generates the game's pixel art: the tileset and the avatar sprite sheet. All of it is drawn
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

// --- Tileset: 8 columns x 8 rows of 32px tiles ---------------------------------
const TILESET_COLUMNS = 8;
const TILESET_ROWS = 8;
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
drawTile(2, (g) => {
  g.rect(0, 0, T, T, WALL_TOP);
  g.noise(0, 0, T, T, 0.08, 4);
  g.rect(0, 0, T, 1, sh(WALL_TOP, 1.25));
  g.rect(0, T - 3, T, 3, sh(WALL_TOP, 0.75));
});
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

// --- Avatars: rows = avatars, columns = direction x 3 frames (idle, step, step) ---
// Directions in order: down, left, right, up (see src/game/avatars.ts).
const SKIN = [[250, 218, 186], [236, 190, 150], [204, 150, 108], [160, 106, 70], [118, 76, 50]];
const AVATARS = [
  { skin: 0, hair: [70, 46, 32], style: 'short', shirt: [46, 170, 150], pants: [52, 56, 82] },
  { skin: 1, hair: [214, 162, 70], style: 'long', shirt: [232, 110, 92], pants: [64, 80, 130] },
  { skin: 3, hair: [30, 28, 36], style: 'curly', shirt: [140, 100, 212], pants: [48, 48, 60] },
  { skin: 1, hair: [150, 62, 40], style: 'ponytail', shirt: [234, 192, 62], pants: [70, 90, 150] },
  { skin: 4, hair: [24, 22, 28], style: 'short', shirt: [70, 150, 232], pants: [120, 96, 70], glasses: true },
  { skin: 0, hair: [220, 220, 226], style: 'bun', shirt: [130, 200, 82], pants: [60, 60, 76] },
  { skin: 2, hair: [40, 30, 28], style: 'long', shirt: [220, 80, 140], pants: [44, 46, 64] },
  { skin: 2, hair: [88, 58, 36], style: 'cap', shirt: [96, 110, 128], pants: [52, 70, 110], cap: [210, 60, 60] },
  { skin: 3, hair: [52, 36, 30], style: 'bun', shirt: [250, 150, 60], pants: [70, 64, 60], glasses: true },
  { skin: 1, hair: [110, 70, 40], style: 'curly', shirt: [60, 120, 90], pants: [180, 160, 120] },
  { skin: 4, hair: [36, 28, 30], style: 'ponytail', shirt: [240, 240, 236], pants: [60, 80, 130] },
  { skin: 0, hair: [200, 90, 40], style: 'short', shirt: [180, 60, 70], pants: [50, 50, 66], glasses: true },
];
const DIRS = ['down', 'left', 'right', 'up'];
const GLASSES = [90, 130, 200];
const FRAMES = 3;

/** Draws one avatar frame facing down, left or up (right is left mirrored). */
function drawAvatar(o, a, dir, frame) {
  const skin = SKIN[a.skin];
  const bob = frame === 0 ? 0 : -1;
  const step = frame === 0 ? 0 : frame === 1 ? 1 : -1;
  const shoe = [44, 38, 40];
  const side = dir === 'left';
  const y0 = bob;

  // legs and shoes
  if (side) {
    o.rect(14 - step * 2, 23 + y0, 3, 6, sh(a.pants, 0.85));
    o.rect(15 + step * 2, 23 + y0, 3, 6, a.pants);
    o.rect(13 - step * 2, 28 + y0, 4, 2, shoe);
    o.rect(14 + step * 2, 28 + y0, 4, 2, shoe);
  } else {
    const lift = (l) => (step === l ? 1 : 0);
    o.rect(12, 23 + y0, 3, 6 - lift(1), a.pants);
    o.rect(17, 23 + y0, 3, 6 - lift(-1), sh(a.pants, 0.9));
    o.rect(12, 28 + y0 - lift(1), 3, 2, shoe);
    o.rect(17, 28 + y0 - lift(-1), 3, 2, shoe);
  }
  // torso
  const tx = side ? 12 : 10;
  const tw = side ? 9 : 12;
  o.rect(tx, 15 + y0, tw, 9, a.shirt);
  o.rect(tx, 15 + y0, tw, 1, sh(a.shirt, 1.2));
  o.rect(tx + tw - 2, 16 + y0, 2, 8, sh(a.shirt, 0.82));
  o.rect(tx, 23 + y0, tw, 1, sh(a.shirt, 0.75));
  if (dir === 'down') o.rect(15, 15 + y0, 2, 2, skin);
  // arms
  if (side) {
    o.rect(15 + step * 2, 16 + y0, 3, 6, sh(a.shirt, 0.9));
    o.rect(15 + step * 2, 22 + y0, 3, 2, skin);
  } else {
    o.rect(8, 16 + y0 + (step === 1 ? 1 : 0), 2, 6, sh(a.shirt, 0.9));
    o.rect(22, 16 + y0 + (step === -1 ? 1 : 0), 2, 6, sh(a.shirt, 0.8));
    o.rect(8, 22 + y0 + (step === 1 ? 1 : 0), 2, 2, skin);
    o.rect(22, 22 + y0 + (step === -1 ? 1 : 0), 2, 2, sh(skin, 0.9));
  }

  // head
  const hx = side ? 15 : 16;
  const hy = 9 + y0;
  o.ellipse(hx, hy, 7.5, 7, skin);
  for (let j = -4; j < 6; j++) o.set(hx + (side ? -7 : 6), hy + j, sh(skin, 0.88));
  const hair = a.hair;
  const hairHi = sh(hair, 1.35);

  if (a.style === 'long' || a.style === 'ponytail' || a.style === 'bun' || a.style === 'curly') {
    if (dir === 'up' && a.style === 'long') o.rect(hx - 7, hy, 15, 9, hair);
    if (dir !== 'up' && a.style === 'long') {
      if (side) o.rect(hx + 1, hy - 2, 7, 11, hair);
      else {
        o.rect(hx - 8, hy - 2, 3, 11, hair);
        o.rect(hx + 5, hy - 2, 3, 11, hair);
      }
    }
  }
  // hair cap over the head
  if (dir === 'up') {
    o.ellipse(hx, hy - 0.5, 7.5, 7.5, hair);
    o.ellipse(hx - 2, hy - 4, 3, 1.5, hairHi);
  } else if (side) {
    o.ellipse(hx + 1, hy - 4, 7, 4, hair);
    o.rect(hx + 1, hy - 4, 7, 7, hair);
    o.rect(hx - 6, hy - 4, 4, 2, hair);
    o.rect(hx - 1, hy - 6, 4, 1, hairHi);
  } else {
    o.ellipse(hx, hy - 4, 7.5, 4, hair);
    o.rect(hx - 7, hy - 4, 2, 5, hair);
    o.rect(hx + 5, hy - 4, 2, 5, hair);
    o.rect(hx - 3, hy - 3, 5, 1, hair);
    o.rect(hx - 3, hy - 6, 4, 1, hairHi);
  }
  if (a.style === 'curly') {
    const pts = dir === 'up' ? [[-7, 2], [6, 2], [-5, 5], [4, 5], [-1, 6]] : side ? [[6, 2], [5, 5], [-6, -4]] : [[-8, 0], [7, 0], [-8, 3], [7, 3]];
    for (const [dx, dy] of pts) o.ellipse(hx + dx + 0.5, hy + dy, 2.2, 2.2, hair);
    o.ellipse(hx, hy - 6, 6, 2.5, hair);
  }
  if (a.style === 'ponytail') {
    if (dir === 'up') o.rect(hx - 1, hy + 3, 3, 8, sh(hair, 0.85));
    else if (side) o.rect(hx + 7, hy - 1, 3, 8, hair);
  }
  if (a.style === 'bun') {
    if (dir === 'down') o.ellipse(hx, hy - 7, 3, 2.5, hair);
    else if (dir === 'up') o.ellipse(hx, hy - 5, 3.5, 3, sh(hair, 0.85));
    else o.ellipse(hx + 6, hy - 5, 3, 3, hair);
  }
  if (a.style === 'cap') {
    if (dir === 'up') o.ellipse(hx, hy - 2, 7.5, 5.5, a.cap);
    else if (side) {
      o.ellipse(hx + 1, hy - 3, 7, 4.5, a.cap);
      o.rect(hx - 9, hy - 2, 6, 2, sh(a.cap, 0.8));
    } else {
      o.ellipse(hx, hy - 3, 7.5, 4.5, a.cap);
      o.rect(hx - 6, hy - 1, 12, 2, sh(a.cap, 0.8));
    }
    o.set(hx - 2, hy - 6, sh(a.cap, 1.3));
  }

  // face
  if (dir === 'up') return;
  const eye = [34, 30, 40];
  if (side) {
    o.rect(hx - 4, hy + 1, 1, 2, eye);
    o.set(hx - 6, hy + 4, sh(skin, 0.8));
    o.set(hx - 3, hy + 4, [236, 140, 140]);
    if (a.glasses) {
      o.rect(hx - 6, hy, 4, 1, GLASSES);
      o.rect(hx - 2, hy, 4, 1, GLASSES);
    }
  } else {
    o.rect(hx - 3, hy + 1, 1, 2, eye);
    o.rect(hx + 2, hy + 1, 1, 2, eye);
    o.set(hx - 5, hy + 3, [240, 150, 150]);
    o.set(hx + 4, hy + 3, [240, 150, 150]);
    o.rect(hx - 1, hy + 4, 2, 1, sh(skin, 0.7));
    if (a.glasses) {
      o.rect(hx - 5, hy, 4, 1, GLASSES);
      o.rect(hx + 1, hy, 4, 1, GLASSES);
      o.rect(hx - 1, hy, 2, 1, GLASSES);
      o.set(hx - 5, hy + 1, GLASSES);
      o.set(hx + 4, hy + 1, GLASSES);
    }
  }
}

const sheet = canvas(DIRS.length * FRAMES * T, AVATARS.length * T);
AVATARS.forEach((a, row) => {
  DIRS.forEach((dir, d) => {
    for (let f = 0; f < FRAMES; f++) {
      const frame = canvas(T, T);
      const body = canvas(T, T);
      drawAvatar(body, a, dir === 'right' ? 'left' : dir, f);
      body.outline();
      frame.ellipse(16, 29.5, 7, 2, [0, 0, 0, 70]);
      frame.paste(body, 0, 0, dir === 'right');
      sheet.paste(frame, (d * FRAMES + f) * T, row * T);
    }
  });
});

mkdirSync('content/tilesets', { recursive: true });
mkdirSync('content/sprites', { recursive: true });
writeFileSync('content/tilesets/tiles.png', png(tiles));
writeFileSync('content/sprites/avatars.png', png(sheet));
console.log('wrote content/tilesets/tiles.png and content/sprites/avatars.png');
