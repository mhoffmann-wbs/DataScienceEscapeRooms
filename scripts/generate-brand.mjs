// Draws the logo and the banner for advertising the app, from the game's own tileset and
// avatar parts, so they look like the lobby. Run generate-art.mjs first if the art changed.
// Usage: node scripts/generate-brand.mjs   (writes docs/brand/ and the site icons and preview in public/)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { decode, encode } from './maps/pngio.mjs';

const REPO = new URL('..', import.meta.url).pathname;
const T = 32;
const tiles = decode(readFileSync(REPO + 'content/tilesets/tiles.png'));
const parts = decode(readFileSync(REPO + 'content/sprites/avatar-parts.png'));

const NAVY = [29, 34, 48];
const MINT = [110, 231, 183];
const GOLD = [222, 170, 72];
const TEXT = [232, 236, 244];
const SHADOW = [14, 16, 24];

function canvas(w, h) {
  const px = new Uint8Array(w * h * 4);
  const set = (x, y, [r, g, b, a = 255]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4, s = a / 255, d = 1 - s;
    px[i] = r * s + px[i] * d;
    px[i + 1] = g * s + px[i + 1] * d;
    px[i + 2] = b * s + px[i + 2] * d;
    px[i + 3] = Math.max(px[i + 3], a);
  };
  const get = (x, y) => [...px.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];
  const rect = (x, y, rw, rh, col) => {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, col);
  };
  return { w, h, px, set, get, rect };
}

/** Pastes a region of a source image; `map` may recolour each pixel. */
function blit(dst, src, sx, sy, sw, sh, dx, dy, map = (p) => p) {
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const i = ((sy + y) * src.w + sx + x) * 4;
      if (src.px[i + 3]) dst.set(dx + x, dy + y, map([...src.px.subarray(i, i + 4)]));
    }
}
const tile = (dst, gid, dx, dy, map) => {
  const id = gid - 1;
  blit(dst, tiles, (id % (tiles.w / T)) * T, Math.floor(id / (tiles.w / T)) * T, T, T, dx, dy, map);
};
const tilePart = (dst, gid, sx, sy, sw, sh, dx, dy) => {
  const id = gid - 1;
  blit(dst, tiles, (id % (tiles.w / T)) * T + sx, Math.floor(id / (tiles.w / T)) * T + sy, sw, sh, dx, dy);
};

// --- Colour helpers --------------------------------------------------------------

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl([h, s, l]) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}
/** Turns the blue door into a door of another hue, keeping its shading. */
const hue = (h, sat = 1) => ([r, g, b, a]) => {
  const [oh, s, l] = toHsl([r, g, b]);
  return s < 0.12 || Math.abs(oh - 215) > 40 ? [r, g, b, a] : [...fromHsl([h, Math.min(1, s * sat), l]), a];
};

// --- Avatars (layout as in src/game/avatars.ts) -------------------------------------

const SKIN = [[250, 218, 186], [236, 190, 150], [204, 150, 108], [160, 106, 70], [118, 76, 50]];
const HAIR = [[30, 28, 36], [88, 58, 36], [200, 90, 40], [214, 162, 70], [205, 205, 212]];
const SHIRT = [[46, 170, 150], [232, 110, 92], [140, 100, 212], [234, 192, 62], [70, 150, 232]];
const PANTS = [[64, 80, 130], [48, 48, 60], [180, 160, 120], [120, 96, 70], [86, 96, 60]];
const shade = (c, f) => (f >= 1 ? c.map((v) => v + (255 - v) * (f - 1)) : c.map((v) => v * f)).map(Math.round);
const DIRS = { down: 0, left: 1, right: 2, up: 3 };

function avatar(dst, look, dir, frame, dx, dy) {
  const recolor = ([r, g, b, a]) => {
    if (a !== 255) return [r, g, b, a];
    if (r > 0 && g === 0 && b === 0) return [...shade(HAIR[look.hairColor], r / 100), a];
    if (r === 0 && g > 0 && b === 0) return [...shade(SHIRT[look.shirt], g / 100), a];
    if (r === 0 && g === 0 && b > 0) return [...shade(PANTS[look.pants], b / 100), a];
    if (r > 0 && g === 0 && r === b) return [...shade(SKIN[look.skin], r / 100), a];
    return [r, g, b, a];
  };
  const col = DIRS[dir] * 3 + frame;
  // Soft shadow under the feet.
  for (let x = -7; x <= 7; x++) for (let y = -2; y <= 2; y++)
    if ((x / 7.5) ** 2 + (y / 2.5) ** 2 <= 1) dst.set(dx + 16 + x, dy + 30 + y, [0, 0, 0, 60]);
  blit(dst, parts, col * T, (look.hairStyle * 5 + look.shirtStyle) * T, T, T, dx, dy, recolor);
  if (look.accessory) blit(dst, parts, col * T, (25 + look.accessory - 1) * T, T, T, dx, dy, recolor);
}

// --- Pixel fonts -------------------------------------------------------------------

const FONT5 = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10011 10101 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00110 01000 10000 11111', 3: '11110 00001 00001 01110 00001 00001 11110', 4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  '-': '00000 00000 00000 01110 00000 00000 00000', '·': '00000 00000 00000 00100 00000 00000 00000',
  ',': '00000 00000 00000 00000 00000 00100 01000', '.': '00000 00000 00000 00000 00000 00000 00100',
  ' ': '00000 00000 00000 00000 00000 00000 00000',
};
const FONT3 = {
  A: '010 101 111 101 101', C: '011 100 100 100 011', D: '110 101 101 101 110', E: '111 100 110 100 111',
  I: '111 010 010 010 111', M: '101 111 111 101 101', N: '110 101 101 101 101', O: '010 101 101 101 010',
  P: '110 101 110 100 100', R: '110 101 110 101 101', S: '011 100 010 001 110', T: '111 010 010 010 010',
  ' ': '000 000 000 000 000',
};

/** Writes text at pixel scale `z`, with a 1-cell drop shadow; returns its width. */
function text(dst, font, str, x, y, col, z = 1, shadow = SHADOW) {
  const gw = Object.values(font)[0].split(' ')[0].length;
  const width = str.length * (gw + 1) * z - z;
  for (const [ox, oy, c] of shadow ? [[z, z, shadow], [0, 0, col]] : [[0, 0, col]])
    [...str].forEach((ch, n) => {
      const rows = font[ch].split(' ');
      rows.forEach((row, j) => [...row].forEach((bit, i) => {
        if (bit === '1') dst.rect(x + ox + (n * (gw + 1) + i) * z, y + oy + j * z, z, z, c);
      }));
    });
  return width;
}
const textWidth = (font, str, z = 1) => str.length * (Object.values(font)[0].split(' ')[0].length + 1) * z - z;
const centered = (dst, font, str, cx, y, col, z, shadow) => text(dst, font, str, Math.round(cx - textWidth(font, str, z) / 2), y, col, z, shadow);

/** Scales a canvas up by an integer factor, keeping the pixels sharp. */
function upscale(src, k) {
  const out = canvas(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++)
    for (let x = 0; x < out.w; x++) {
      const i = (((y / k) | 0) * src.w + ((x / k) | 0)) * 4;
      out.px.set(src.px.subarray(i, i + 4), (y * out.w + x) * 4);
    }
  return out;
}

/** A door whose glass shows a rising bar chart: the app in one picture. */
function chartDoor(dst, dx, dy, h) {
  tile(dst, 6, dx, dy, hue(h, 0.9));
  dst.rect(dx + 3, dy + 5, 26, 21, [22, 30, 38]);
  for (let x = dx + 4; x < dx + 28; x += 4) dst.rect(x, dy + 6, 1, 19, [34, 46, 56]);
  const bars = [4, 7, 6, 11, 15];
  bars.forEach((bh, n) => {
    const x = dx + 5 + n * 5;
    dst.rect(x, dy + 24 - bh, 3, bh, MINT);
    dst.rect(x, dy + 24 - bh, 3, 1, shade(MINT, 1.35));
    dst.rect(x + 2, dy + 25 - bh, 1, bh - 1, shade(MINT, 0.75));
  });
  dst.rect(dx + 4, dy + 24, 24, 1, [150, 170, 180]);
}

// --- Logo: 64x64 pixels, shown at 8x ------------------------------------------------

const STEEL = [168, 182, 196];
const SCREEN = [22, 30, 38];

/** A navy tile with rounded corners and a darker rim. */
function roundedTile(c, r = 8) {
  const inside = (x, y) => {
    const cx = Math.min(Math.max(x + 0.5, r), c.w - r), cy = Math.min(Math.max(y + 0.5, r), c.h - r);
    return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
  };
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++)
    if (inside(x, y)) c.set(x, y, !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1) ? shade(NAVY, 0.6) : NAVY);
}

/** Fills the pixels a predicate picks, lighter on the top-left rim and darker on the bottom-right. */
function shape(c, inside, col) {
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++)
    if (inside(x, y)) {
      const dark = !inside(x + 1, y) || !inside(x, y + 1), light = !inside(x - 1, y) || !inside(x, y - 1);
      c.set(x, y, dark ? shade(col, 0.6) : light ? shade(col, 1.3) : col);
    }
}

/** The two padlock sizes: shackle centre and radii, legs, body box, screen box in the body, trend points. */
const LOCKS = {
  large: { ring: [22, 14, 8.5], legs: [[18, 24], [40, 46]], body: [12, 28, 40, 29], screen: [4, 4, 32, 20],
    points: [[18, 19], [24, 16], [29, 18], [34, 12], [39, 13], [45, 7]] },
  small: { ring: [11, 10, 6], legs: [[22, 26], [38, 42]], body: [16, 15, 32, 22], screen: [3, 3, 26, 14],
    points: [[21, 13], [26, 10], [30, 12], [34, 7], [38, 8], [43, 4]] },
};

/** A padlock whose body is a screen with a rising trend line: data that opens the lock. */
function padlock(c, size, dy = 0) {
  const { ring: [ry, R, r], legs, body: [bx, by, bw, bh], screen: [sx, sy, sw, sh], points } = LOCKS[size];
  const top = by + dy;
  shape(c, (x, y) => {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - ry - dy);
    return (y < ry + dy && d <= R && d >= r) || (y >= ry + dy && y < top + 2 && legs.some(([a, b]) => x >= a && x < b));
  }, STEEL);
  shape(c, (x, y) => x >= bx && x < bx + bw && y >= top && y < top + bh && !((x === bx || x === bx + bw - 1) && (y === top || y === top + bh - 1)), GOLD);
  c.rect(bx + sx, top + sy, sw, sh, SCREEN);
  for (let x = bx + sx + 2; x < bx + sx + sw - 2; x += 4) c.rect(x, top + sy + 1, 1, sh - 2, [32, 44, 54]);
  const pts = points.map(([x, y]) => [x, top + y]);
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx2, by2] = pts[k + 1];
    for (let t = 0; t <= 1; t += 0.02) c.set(Math.round(ax + (bx2 - ax) * t), Math.round(ay + (by2 - ay) * t), MINT);
  }
  for (const [x, y] of pts) c.rect(x - 1, y - 1, 3, 3, shade(MINT, 1.3));
  c.rect(30, top + bh - 4, 4, 2, shade(GOLD, 0.5));
  return top + bh;
}

/** The logo: the padlock over the name, the topic small in mint and ESCAPE large in gold. */
function logo() {
  const c = canvas(64, 64);
  roundedTile(c);
  const y = padlock(c, 'small', 4) + 4;
  centered(c, FONT3, 'DATA SCIENCE', 32, y, MINT, 1);
  centered(c, FONT5, 'ESCAPE', 32, y + 7, GOLD, 1);
  return c;
}

/** The icon: the padlock alone, for small places such as a browser tab. */
function icon() {
  const c = canvas(64, 64);
  roundedTile(c);
  padlock(c, 'large');
  return c;
}

// --- Banner: 16x9 tiles, shown at 3x ------------------------------------------------

function banner() {
  const W = 17, H = 9, c = canvas(W * T, H * T);
  for (let y = 2; y < H; y++) for (let x = 0; x < W; x++) tile(c, 1, x * T, y * T);
  for (let x = 0; x < W; x++) tile(c, 3, x * T, 0);
  for (let x = 0; x < W; x++) tile(c, 4, x * T, T);
  // The door wall: rooms in their colours around the chart door, lamps between, pictures
  // from the aurora and the fair at the ends.
  const wall = ['42', 'L', 'D210', 'L', 'D350', 'L', 'D150', 'L', 'C', 'L', 'D30', 'L', 'D270', 'L', 'D185', 'L', '76'];
  wall.forEach((w, x) => {
    if (w === 'L') tile(c, 136, x * T, T);
    else if (w === 'C') chartDoor(c, x * T, T, 160);
    else if (w[0] === 'D') {
      const h = Number(w.slice(1));
      tile(c, 6, x * T, T, h === 210 ? undefined : hue(h, h === 30 ? 1.2 : 0.9));
    } else tile(c, Number(w), x * T, T);
    if (w[0] === 'D') tile(c, 2, x * T, 2 * T);
    if (w === 'C') tile(c, 8, x * T, 2 * T);
  });
  // Plants in the corners and a carpet runner along the bottom.
  for (let x = 0; x < W; x++) {
    tile(c, x === 0 ? 154 : x === W - 1 ? 148 : 146, x * T, 7 * T);
    tile(c, x === 0 ? 157 : x === W - 1 ? 151 : 149, x * T, 8 * T);
  }
  tile(c, 8, 0, 2 * T);
  tile(c, 8, (W - 1) * T, 2 * T);

  // The sign: a navy plate with a gold frame, like the lobby's carpet trim.
  const px = 88, py = 100, pw = W * T - 2 * px, ph = 114;
  c.rect(px + 4, py + 5, pw, ph, [0, 0, 0, 90]);
  c.rect(px, py, pw, ph, shade(GOLD, 0.55));
  c.rect(px + 1, py + 1, pw - 2, ph - 2, GOLD);
  c.rect(px + 3, py + 3, pw - 6, ph - 6, shade(GOLD, 0.6));
  c.rect(px + 4, py + 4, pw - 8, ph - 8, NAVY);
  const cx = (W * T) / 2;
  centered(c, FONT5, 'DATA SCIENCE', cx, py + 14, MINT, 4);
  centered(c, FONT5, 'ESCAPE ROOMS', cx, py + 48, GOLD, 4);
  c.rect(px + 30, py + 83, pw - 60, 1, shade(NAVY, 1.6));
  centered(c, FONT5, 'SQL · PYTHON · PANDAS · STATS · TIME SERIES · ML', cx, py + 88, TEXT, 1);
  centered(c, FONT5, 'TEAMS OF 2-5 · ABOUT 30 MINUTES · IN THE BROWSER', cx, py + 99, shade(TEXT, 0.7), 1);

  // A few players: some heading for the doors, two teams chatting on the carpet.
  const look = (skin, hairStyle, hairColor, shirtStyle, shirt, pants, accessory = 0) =>
    ({ skin, hairStyle, hairColor, shirtStyle, shirt, pants, accessory });
  avatar(c, look(1, 1, 3, 0, 1, 0), 'up', 1, 2 * T + 4, 2 * T - 4);
  avatar(c, look(3, 2, 0, 3, 2, 1, 2), 'up', 2, 6 * T + 2, 2 * T - 8);
  avatar(c, look(0, 0, 2, 4, 0, 1, 1), 'up', 0, 10 * T - 2, 2 * T - 6);
  avatar(c, look(4, 3, 0, 1, 3, 3, 3), 'up', 1, 14 * T + 2, 2 * T - 4);
  avatar(c, look(2, 4, 1, 2, 4, 2), 'right', 0, 0 * T + 10, 6 * T + 18);
  avatar(c, look(1, 0, 4, 0, 2, 0, 4), 'left', 0, 1 * T + 12, 6 * T + 18);
  avatar(c, look(0, 1, 0, 3, 3, 4), 'right', 0, 14 * T + 14, 6 * T + 18);
  avatar(c, look(3, 0, 1, 4, 0, 1, 1), 'left', 0, 15 * T + 16, 6 * T + 18);
  return c;
}

export { canvas, blit, tile, tilePart, hue, shade, avatar, text, centered, upscale, chartDoor, encode, FONT5, FONT3, NAVY, MINT, GOLD, TEXT, SHADOW, T };

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = REPO + 'docs/brand/';
  mkdirSync(out, { recursive: true });
  writeFileSync(out + 'logo.png', encode(upscale(logo(), 8)));
  writeFileSync(out + 'logo-icon.png', encode(upscale(icon(), 8)));
  writeFileSync(out + 'banner.png', encode(upscale(banner(), 3)));
  // The site's tab icon, home-screen icon and link preview image (index.html links them).
  const pub = REPO + 'public/';
  mkdirSync(pub, { recursive: true });
  writeFileSync(pub + 'favicon.png', encode(icon()));
  writeFileSync(pub + 'apple-touch-icon.png', encode(upscale(icon(), 3)));
  writeFileSync(pub + 'social.png', encode(upscale(banner(), 3)));
  console.log('wrote docs/brand/logo.png and logo-icon.png (512x512) and docs/brand/banner.png (1632x864)');
  console.log('wrote public/favicon.png (64x64), apple-touch-icon.png (192x192) and social.png (1632x864)');
}
