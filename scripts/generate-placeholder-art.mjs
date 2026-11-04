// Generates placeholder pixel art until a real CC0 tileset replaces it (plan step 9).
// Usage: node scripts/generate-placeholder-art.mjs
// The avatar layout here must match src/game/avatars.ts. Tile indices are referenced by the
// maps (gid = index + 1), so append new tiles instead of reordering.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const T = 32;

function canvas(w, h) {
  const px = new Uint8Array(w * h * 4);
  const set = (x, y, [r, g, b, a = 255]) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = a;
  };
  const rect = (x, y, rw, rh, c) => {
    for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) set(i, j, c);
  };
  const ellipse = (cx, cy, rx, ry, c) => {
    for (let j = Math.floor(cy - ry); j <= cy + ry; j++)
      for (let i = Math.floor(cx - rx); i <= cx + rx; i++)
        if (((i - cx) / rx) ** 2 + ((j - cy) / ry) ** 2 <= 1) set(i, j, c);
  };
  return { w, h, px, set, rect, ellipse };
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

// --- Tileset: 8 columns x 4 rows of 32px tiles -------------------------------
const tiles = canvas(8 * T, 4 * T);
const at = (index) => [(index % 8) * T, Math.floor(index / 8) * T];

function drawTile(index, draw) {
  const [ox, oy] = at(index);
  draw({
    rect: (x, y, w, h, c) => tiles.rect(ox + x, oy + y, w, h, c),
    ellipse: (cx, cy, rx, ry, c) => tiles.ellipse(ox + cx, oy + cy, rx, ry, c),
  });
}

// 0 floor: wooden planks
drawTile(0, ({ rect }) => {
  rect(0, 0, T, T, [176, 136, 96]);
  for (let y = 0; y < T; y += 8) rect(0, y, T, 1, [150, 112, 78]);
  rect(10, 0, 1, 8, [150, 112, 78]);
  rect(24, 8, 1, 8, [150, 112, 78]);
  rect(6, 16, 1, 8, [150, 112, 78]);
  rect(20, 24, 1, 8, [150, 112, 78]);
});
// 1 floor alt: tiles
drawTile(1, ({ rect }) => {
  rect(0, 0, T, T, [200, 204, 212]);
  rect(0, 0, T, 1, [170, 174, 184]);
  rect(0, 0, 1, T, [170, 174, 184]);
  rect(16, 0, 1, T, [170, 174, 184]);
  rect(0, 16, T, 1, [170, 174, 184]);
});
// 2 wall top
drawTile(2, ({ rect }) => {
  rect(0, 0, T, T, [58, 64, 84]);
  rect(0, T - 4, T, 4, [44, 48, 64]);
});
// 3 wall front: bricks
drawTile(3, ({ rect }) => {
  rect(0, 0, T, T, [112, 120, 146]);
  for (let y = 0; y < T; y += 8) rect(0, y, T, 1, [88, 94, 118]);
  for (let y = 0; y < T; y += 16) {
    rect(8, y, 1, 8, [88, 94, 118]);
    rect(24, y, 1, 8, [88, 94, 118]);
    rect(16, y + 8, 1, 8, [88, 94, 118]);
  }
});
// 4 carpet
drawTile(4, ({ rect }) => {
  rect(0, 0, T, T, [120, 52, 64]);
  for (let i = 0; i < T; i += 4) rect(i, i, 2, 2, [140, 70, 82]);
});
// 5 door: Python lab (blue)
// 6 door: SQL hotel (amber)
for (const [index, frame, glow] of [
  [5, [40, 90, 160], [110, 180, 255]],
  [6, [150, 96, 30], [255, 196, 90]],
]) {
  drawTile(index, ({ rect }) => {
    rect(0, 0, T, T, frame);
    rect(4, 2, T - 8, T - 2, [30, 26, 34]);
    rect(6, 4, T - 12, T - 4, glow.map((v) => Math.round(v * 0.35)));
    rect(6, T - 4, T - 12, 4, glow);
  });
}
// 7 plant
drawTile(7, ({ rect, ellipse }) => {
  rect(10, 22, 12, 9, [150, 84, 50]);
  rect(9, 21, 14, 3, [120, 66, 40]);
  ellipse(16, 13, 10, 9, [46, 130, 70]);
  ellipse(12, 10, 5, 5, [70, 160, 90]);
  ellipse(20, 15, 4, 4, [70, 160, 90]);
});
// 8 table
drawTile(8, ({ rect }) => {
  rect(2, 6, T - 4, 16, [120, 84, 52]);
  rect(2, 6, T - 4, 3, [150, 108, 70]);
  rect(4, 22, 3, 8, [90, 62, 38]);
  rect(T - 7, 22, 3, 8, [90, 62, 38]);
});
// 9 noticeboard on wall front
drawTile(9, ({ rect }) => {
  rect(0, 0, T, T, [112, 120, 146]);
  rect(3, 5, T - 6, T - 10, [150, 110, 70]);
  rect(6, 8, 9, 7, [240, 236, 220]);
  rect(17, 9, 8, 10, [255, 240, 150]);
  rect(7, 17, 8, 6, [200, 230, 255]);
});

// 10 terminal on a desk
drawTile(10, ({ rect }) => {
  rect(2, 14, T - 4, 10, [120, 84, 52]);
  rect(4, 24, 3, 7, [90, 62, 38]);
  rect(T - 7, 24, 3, 7, [90, 62, 38]);
  rect(7, 2, 18, 13, [40, 44, 56]);
  rect(9, 4, 14, 9, [40, 200, 120]);
  rect(10, 6, 6, 1, [200, 255, 220]);
  rect(10, 9, 9, 1, [200, 255, 220]);
  rect(14, 15, 4, 2, [40, 44, 56]);
});
// 11 safe
drawTile(11, ({ rect, ellipse }) => {
  rect(4, 4, T - 8, T - 6, [90, 96, 110]);
  rect(6, 6, T - 12, T - 10, [120, 128, 146]);
  ellipse(16, 15, 5, 5, [60, 64, 76]);
  ellipse(16, 15, 2, 2, [220, 190, 80]);
  rect(21, 20, 3, 4, [60, 64, 76]);
});
// 12 bookshelf
drawTile(12, ({ rect }) => {
  rect(2, 0, T - 4, T, [110, 74, 44]);
  const books = [[200, 70, 70], [70, 120, 200], [220, 180, 70], [90, 160, 100], [160, 90, 180]];
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 2 + shelf * 10;
    rect(4, y + 8, T - 8, 2, [80, 52, 30]);
    for (let i = 0; i < 6; i++) rect(5 + i * 4, y + 1 + (i % 2), 3, 7 - (i % 2), books[(i + shelf) % books.length]);
  }
});
// 13 keypad on wall front
drawTile(13, ({ rect }) => {
  rect(0, 0, T, T, [112, 120, 146]);
  rect(9, 6, 14, 20, [40, 44, 56]);
  rect(11, 8, 10, 4, [120, 220, 160]);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) rect(11 + c * 4, 14 + r * 4, 2, 2, [200, 204, 212]);
});

// --- Research lab (python-lab) -----------------------------------------------
const WALL = [112, 120, 146];
const BENCH = [214, 220, 226];
const benchBase = (rect) => {
  rect(1, 12, T - 2, 12, BENCH);
  rect(1, 12, T - 2, 2, [240, 244, 248]);
  rect(3, 24, 3, 7, [140, 146, 156]);
  rect(T - 6, 24, 3, 7, [140, 146, 156]);
};

// 14 lab floor: pale teal tiles
drawTile(14, ({ rect }) => {
  rect(0, 0, T, T, [196, 222, 218]);
  rect(0, 0, T, 1, [168, 198, 194]);
  rect(0, 0, 1, T, [168, 198, 194]);
});
// 15 incubator: cabinet with a warm window
drawTile(15, ({ rect }) => {
  rect(3, 1, T - 6, T - 2, [206, 210, 216]);
  rect(6, 5, T - 12, 14, [70, 40, 30]);
  rect(8, 7, T - 16, 10, [250, 150, 60]);
  rect(8, 22, 6, 4, [40, 44, 56]);
  rect(9, 23, 4, 2, [255, 90, 70]);
  rect(18, 22, 6, 2, [140, 146, 156]);
});
// 16 freezer: frosty white chest with a padlock
drawTile(16, ({ rect }) => {
  rect(2, 1, T - 4, T - 2, [232, 240, 248]);
  rect(2, 1, T - 4, 3, [190, 214, 236]);
  rect(4, 15, T - 8, 1, [170, 190, 210]);
  rect(13, 17, 6, 6, [210, 170, 60]);
  rect(14, 14, 4, 4, [120, 120, 130]);
  rect(15, 15, 2, 3, [232, 240, 248]);
  rect(6, 6, 8, 5, [255, 255, 255]);
});
// 17 microscope on a bench
drawTile(17, ({ rect }) => {
  benchBase(rect);
  rect(12, 10, 10, 3, [50, 54, 66]);
  rect(18, 1, 4, 10, [50, 54, 66]);
  rect(13, 3, 6, 3, [50, 54, 66]);
  rect(13, 6, 3, 4, [80, 84, 96]);
  rect(12, 8, 6, 1, [120, 255, 160]);
});
// 18 laptop on a bench
drawTile(18, ({ rect }) => {
  benchBase(rect);
  rect(7, 2, 18, 11, [40, 44, 56]);
  rect(9, 4, 14, 7, [30, 30, 40]);
  for (let y = 5; y < 10; y += 2) rect(10, y, 4 + ((y * 3) % 8), 1, [120, 255, 160]);
  rect(5, 12, 22, 2, [90, 94, 106]);
});
// 19 desk with a photo frame
drawTile(19, ({ rect }) => {
  rect(2, 14, T - 4, 10, [120, 84, 52]);
  rect(4, 24, 3, 7, [90, 62, 38]);
  rect(T - 7, 24, 3, 7, [90, 62, 38]);
  rect(9, 3, 14, 12, [150, 108, 70]);
  rect(11, 5, 10, 8, [190, 220, 240]);
  rect(13, 8, 6, 5, [130, 130, 140]);
  rect(13, 6, 2, 2, [130, 130, 140]);
  rect(17, 6, 2, 2, [130, 130, 140]);
});
// 20 plain lab bench with glassware
drawTile(20, ({ rect }) => {
  benchBase(rect);
  rect(6, 5, 4, 8, [180, 230, 240]);
  rect(19, 7, 7, 6, [180, 230, 240]);
  rect(20, 10, 5, 3, [120, 220, 150]);
});
// 21 shelf of glowing jars
drawTile(21, ({ rect }) => {
  rect(2, 0, T - 4, T, [110, 74, 44]);
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 2 + shelf * 10;
    rect(4, y + 8, T - 8, 2, [80, 52, 30]);
    for (let i = 0; i < 3; i++) {
      rect(5 + i * 8, y + 1, 6, 7, [200, 230, 236]);
      rect(6 + i * 8, y + 4, 4, 3, [130, 255, 150]);
    }
  }
});
// 22 whiteboard on wall front
drawTile(22, ({ rect }) => {
  rect(0, 0, T, T, WALL);
  rect(2, 5, T - 4, 19, [160, 166, 176]);
  rect(3, 6, T - 6, 17, [246, 248, 250]);
  rect(5, 9, 6, 1, [70, 110, 200]);
  rect(19, 15, 6, 1, [200, 70, 70]);
  rect(6, 18, 3, 3, [230, 180, 60]);
  rect(5, 24, 22, 2, [140, 146, 156]);
});
// 23 vent grille on wall front
drawTile(23, ({ rect }) => {
  rect(0, 0, T, T, WALL);
  rect(4, 6, T - 8, 20, [60, 64, 76]);
  for (let y = 8; y < 25; y += 4) rect(6, y, T - 12, 2, [150, 156, 170]);
});
// 24 diploma on wall front
drawTile(24, ({ rect }) => {
  rect(0, 0, T, T, WALL);
  rect(7, 6, 18, 16, [170, 130, 60]);
  rect(9, 8, 14, 12, [250, 244, 224]);
  rect(11, 10, 10, 1, [80, 80, 90]);
  rect(12, 13, 8, 1, [140, 140, 150]);
  rect(15, 16, 3, 3, [200, 60, 60]);
});
// 25 air-quality poster on wall front
drawTile(25, ({ rect }) => {
  rect(0, 0, T, T, WALL);
  rect(8, 3, 16, 24, [250, 250, 250]);
  rect(11, 18, 3, 6, [80, 190, 110]);
  rect(15, 13, 3, 11, [240, 200, 70]);
  rect(19, 8, 3, 16, [220, 80, 70]);
  rect(10, 5, 12, 1, [80, 80, 90]);
});
// 26 clipboard manual on wall front
drawTile(26, ({ rect }) => {
  rect(0, 0, T, T, WALL);
  rect(9, 5, 14, 20, [150, 108, 70]);
  rect(10, 8, 12, 16, [250, 250, 245]);
  rect(13, 4, 6, 3, [160, 166, 176]);
  for (let y = 10; y < 22; y += 3) rect(12, y, 8, 1, [120, 120, 130]);
});

// --- Avatars: rows = avatars, columns = direction x 2 walk frames -------------
// Directions in order: down, left, right, up (see src/game/avatars.ts).
const AVATARS = [
  { shirt: [46, 170, 150], hair: [60, 40, 30], skin: [240, 200, 170] },
  { shirt: [230, 110, 90], hair: [200, 150, 60], skin: [250, 214, 180] },
  { shirt: [140, 100, 210], hair: [30, 30, 40], skin: [200, 150, 110] },
  { shirt: [230, 190, 60], hair: [140, 60, 40], skin: [236, 190, 150] },
  { shirt: [70, 150, 230], hair: [90, 60, 40], skin: [150, 100, 70] },
  { shirt: [130, 200, 80], hair: [220, 220, 220], skin: [230, 180, 140] },
];
const DIRS = ['down', 'left', 'right', 'up'];
const sheet = canvas(DIRS.length * 2 * T, AVATARS.length * T);

AVATARS.forEach((a, row) => {
  DIRS.forEach((dir, d) => {
    for (let f = 0; f < 2; f++) {
      const ox = (d * 2 + f) * T;
      const oy = row * T;
      const r = (x, y, w, h, c) => sheet.rect(ox + x, oy + y, w, h, c);
      const e = (cx, cy, rx, ry, c) => sheet.ellipse(ox + cx, oy + cy, rx, ry, c);
      const bob = f === 1 ? 1 : 0;

      e(16, 29, 8, 2.5, [0, 0, 0, 70]); // shadow
      // legs alternate per frame
      const legL = f === 0 ? 0 : -2;
      const legR = f === 0 ? -2 : 0;
      r(11, 24 + legL + 2, 4, 5 - legL - 2, [50, 52, 70]);
      r(17, 24 + legR + 2, 4, 5 - legR - 2, [50, 52, 70]);
      r(9, 15 + bob, 14, 11, a.shirt); // body
      r(9, 15 + bob, 14, 2, a.shirt.map((v) => Math.min(255, v + 30)));
      e(16, 10 + bob, 7, 7, a.skin); // head
      // hair: full back of head when facing up, cap otherwise
      if (dir === 'up') e(16, 9 + bob, 7, 7, a.hair);
      else r(9, 3 + bob, 14, 4, a.hair);
      if (dir === 'left') r(17, 3 + bob, 6, 8, a.hair);
      if (dir === 'right') r(9, 3 + bob, 6, 8, a.hair);
      const eye = [30, 30, 40];
      if (dir === 'down') {
        r(12, 10 + bob, 2, 2, eye);
        r(18, 10 + bob, 2, 2, eye);
      }
      if (dir === 'left') r(11, 10 + bob, 2, 2, eye);
      if (dir === 'right') r(19, 10 + bob, 2, 2, eye);
    }
  });
});

mkdirSync('content/tilesets', { recursive: true });
mkdirSync('content/sprites', { recursive: true });
writeFileSync('content/tilesets/placeholder.png', png(tiles));
writeFileSync('content/sprites/avatars.png', png(sheet));
console.log('wrote content/tilesets/placeholder.png and content/sprites/avatars.png');
