// Avatars are put together from content/sprites/avatar-parts.png (see scripts/generate-art.mjs):
// one body row per hair style x shirt style, then one overlay row per accessory; columns =
// direction x 3 frames (idle, step, other step). Hair, skin, shirt and trousers are drawn in
// marker colours that recolorParts swaps for the colours of a player's look.
import { z } from 'zod';
import avatarPartsUrl from '../../content/sprites/avatar-parts.png';

export const AVATAR_PARTS_URL = avatarPartsUrl;
export const AVATAR_FRAME_SIZE = 32;
export const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export type Direction = (typeof DIRECTIONS)[number];

const FRAMES_PER_DIRECTION = 3;
export const AVATAR_SHEET_COLUMNS = DIRECTIONS.length * FRAMES_PER_DIRECTION;

type Rgb = readonly [number, number, number];

/** Same order as in the generator. */
export const HAIR_STYLES = ['short', 'long', 'curly', 'ponytail', 'bun'] as const;
export const SHIRT_STYLES = ['tshirt', 'longsleeve', 'striped', 'hoodie', 'jacket'] as const;
/** Every accessory but 'none' has an overlay row; the cap takes the top's colour. */
export const ACCESSORIES = ['none', 'glasses', 'cap', 'headphones', 'goggles'] as const;
export const SKIN_COLORS: readonly Rgb[] = [[250, 218, 186], [236, 190, 150], [204, 150, 108], [160, 106, 70], [118, 76, 50]];
export const HAIR_COLORS = { black: [30, 28, 36], brown: [88, 58, 36], ginger: [200, 90, 40], blonde: [214, 162, 70], silver: [205, 205, 212] } satisfies Record<string, Rgb>;
export const SHIRT_COLORS = { teal: [46, 170, 150], coral: [232, 110, 92], purple: [140, 100, 212], yellow: [234, 192, 62], blue: [70, 150, 232] } satisfies Record<string, Rgb>;
export const PANTS_COLORS = { denim: [64, 80, 130], charcoal: [48, 48, 60], khaki: [180, 160, 120], brown: [120, 96, 70], olive: [86, 96, 60] } satisfies Record<string, Rgb>;

const option = (count: number) => z.number().int().min(0).max(count - 1);

/** A player's avatar: an index into each option list above. */
export const lookSchema = z.object({
  skin: option(SKIN_COLORS.length),
  hairStyle: option(HAIR_STYLES.length),
  hairColor: option(Object.keys(HAIR_COLORS).length),
  shirtStyle: option(SHIRT_STYLES.length),
  shirtColor: option(Object.keys(SHIRT_COLORS).length),
  pantsColor: option(Object.keys(PANTS_COLORS).length),
  accessory: option(ACCESSORIES.length),
});
export type Look = z.infer<typeof lookSchema>;

/** How many options each part of a look has. */
export const LOOK_OPTIONS = {
  skin: SKIN_COLORS.length,
  hairStyle: HAIR_STYLES.length,
  hairColor: Object.keys(HAIR_COLORS).length,
  shirtStyle: SHIRT_STYLES.length,
  shirtColor: Object.keys(SHIRT_COLORS).length,
  pantsColor: Object.keys(PANTS_COLORS).length,
  accessory: ACCESSORIES.length,
} as const satisfies Record<keyof Look, number>;

/** The twelve fixed avatars of earlier versions, so saved profiles keep their character. */
const LEGACY_LOOKS: readonly (readonly [number, number, number, number, number, number, number])[] = [
  [0, 0, 1, 1, 0, 1, 0],
  [1, 1, 3, 0, 1, 0, 0],
  [3, 2, 0, 3, 2, 1, 0],
  [1, 3, 2, 1, 3, 0, 0],
  [4, 0, 0, 4, 4, 3, 1],
  [0, 4, 4, 2, 0, 1, 0],
  [2, 1, 0, 0, 1, 1, 0],
  [2, 0, 1, 3, 4, 0, 2],
  [3, 4, 0, 1, 3, 3, 1],
  [1, 2, 1, 2, 0, 2, 0],
  [4, 3, 0, 0, 4, 0, 0],
  [0, 0, 2, 4, 1, 1, 1],
];

export function legacyLook(avatar: number): Look | null {
  const l = LEGACY_LOOKS[avatar];
  if (!l) return null;
  return { skin: l[0], hairStyle: l[1], hairColor: l[2], shirtStyle: l[3], shirtColor: l[4], pantsColor: l[5], accessory: l[6] };
}

export function randomLook(random = Math.random): Look {
  const pick = (n: number) => Math.floor(random() * n);
  return {
    skin: pick(LOOK_OPTIONS.skin),
    hairStyle: pick(LOOK_OPTIONS.hairStyle),
    hairColor: pick(LOOK_OPTIONS.hairColor),
    shirtStyle: pick(LOOK_OPTIONS.shirtStyle),
    shirtColor: pick(LOOK_OPTIONS.shirtColor),
    pantsColor: pick(LOOK_OPTIONS.pantsColor),
    // half of the random looks wear nothing extra
    accessory: random() < 0.5 ? 0 : 1 + pick(LOOK_OPTIONS.accessory - 1),
  };
}

/** A short id of a look, for texture and cache keys. */
export function lookKey(l: Look): string {
  return `${l.skin}${l.hairStyle}${l.hairColor}${l.shirtStyle}${l.shirtColor}${l.pantsColor}${l.accessory}`;
}

/** The rows of the parts sheet a look is drawn from: its body, then its accessory (if any) on top. */
export function partsRows(l: Look): number[] {
  const body = l.hairStyle * SHIRT_STYLES.length + l.shirtStyle;
  const bodies = HAIR_STYLES.length * SHIRT_STYLES.length;
  return l.accessory === 0 ? [body] : [body, bodies + l.accessory - 1];
}

/** Lightens (f > 1) or darkens (f < 1) a colour, like `sh` in the generator. */
function shade([r, g, b]: Rgb, f: number): Rgb {
  return f >= 1
    ? [r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1)]
    : [r * f, g * f, b * f];
}

/** The colour at `i` of a palette (looks are validated, so `i` is in range). */
const colorAt = (palette: Readonly<Record<string, Rgb>> | readonly Rgb[], i: number): Rgb => Object.values(palette)[i] ?? [0, 0, 0];

/** Swaps the marker colours in RGBA pixels of the parts sheet for the colours of `look`, in place. */
export function recolorParts(px: Uint8ClampedArray, look: Look): void {
  const hair = colorAt(HAIR_COLORS, look.hairColor);
  const shirt = colorAt(SHIRT_COLORS, look.shirtColor);
  const pants = colorAt(PANTS_COLORS, look.pantsColor);
  const skin = colorAt(SKIN_COLORS, look.skin);
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] !== 255) continue;
    const r = px[i]!;
    const g = px[i + 1]!;
    const b = px[i + 2]!;
    let base: Rgb;
    let v: number;
    if (r > 0 && g === 0 && b === 0) [base, v] = [hair, r];
    else if (r === 0 && g > 0 && b === 0) [base, v] = [shirt, g];
    else if (r === 0 && g === 0 && b > 0) [base, v] = [pants, b];
    else if (r > 0 && g === 0 && r === b) [base, v] = [skin, r];
    else continue;
    const [nr, ng, nb] = shade(base, v / 100);
    px[i] = nr;
    px[i + 1] = ng;
    px[i + 2] = nb;
  }
}

/** Draws the sprite strip of a look (one row of AVATAR_SHEET_COLUMNS frames). Browser only. */
export function renderLook(parts: CanvasImageSource, look: Look): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SHEET_COLUMNS * AVATAR_FRAME_SIZE;
  canvas.height = AVATAR_FRAME_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  for (const row of partsRows(look)) ctx.drawImage(parts, 0, -row * AVATAR_FRAME_SIZE);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  recolorParts(image.data, look);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function frameIndex(dir: Direction, frame = 0): number {
  return DIRECTIONS.indexOf(dir) * FRAMES_PER_DIRECTION + frame;
}

/** The walk cycle: step, idle, other step, idle. */
export const WALK_FRAMES = [1, 0, 2, 0];

export function walkAnimKey(textureKey: string, dir: Direction): string {
  return `${textureKey}-walk-${dir}`;
}
