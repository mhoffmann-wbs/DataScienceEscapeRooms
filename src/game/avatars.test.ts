import { describe, expect, it } from 'vitest';
import { AVATAR_FRAME_SIZE, AVATAR_SHEET_COLUMNS, HAIR_COLORS, LOOK_OPTIONS, lookSchema, partsRows, randomLook, recolorParts, SKIN_COLORS, legacyLook } from './avatars';
import partsDataUrl from '../../content/sprites/avatar-parts.png?inline';

describe('avatar looks', () => {
  it('recolours marker pixels and leaves fixed colours alone', () => {
    const look = { ...legacyLook(0)!, hairColor: 3, skin: 2 };
    // hair at f=1, skin darkened to f=0.5, the outline, and a translucent shadow
    const px = new Uint8ClampedArray([100, 0, 0, 255, 50, 0, 50, 255, 36, 30, 44, 255, 0, 0, 0, 70]);
    recolorParts(px, look);
    expect([...px.slice(0, 3)]).toEqual(HAIR_COLORS.blonde);
    expect([...px.slice(4, 7)]).toEqual(SKIN_COLORS[2]!.map((c) => Math.round(c / 2)));
    expect([...px.slice(8)]).toEqual([36, 30, 44, 255, 0, 0, 0, 70]);
  });

  it('uses every row of the parts sheet, and a distinct set of rows per look', () => {
    const rows = new Set<number>();
    const sets = new Set<string>();
    for (let h = 0; h < LOOK_OPTIONS.hairStyle; h++)
      for (let s = 0; s < LOOK_OPTIONS.shirtStyle; s++)
        for (let a = 0; a < LOOK_OPTIONS.accessory; a++) {
          const used = partsRows({ ...legacyLook(0)!, hairStyle: h, shirtStyle: s, accessory: a });
          used.forEach((r) => rows.add(r));
          sets.add(used.join());
        }
    expect([...rows].sort((a, b) => a - b)).toEqual([...Array(29).keys()]);
    expect(sets.size).toBe(LOOK_OPTIONS.hairStyle * LOOK_OPTIONS.shirtStyle * LOOK_OPTIONS.accessory);
    // the PNG header holds width and height; the generator must draw exactly these rows
    const png = new DataView(Uint8Array.from(atob(partsDataUrl.split(',')[1] ?? ''), (c) => c.charCodeAt(0)).buffer);
    expect([png.getUint32(16), png.getUint32(20)]).toEqual([AVATAR_SHEET_COLUMNS * AVATAR_FRAME_SIZE, rows.size * AVATAR_FRAME_SIZE]);
  });

  it('makes valid random looks', () => {
    for (let i = 0; i < 20; i++) expect(lookSchema.safeParse(randomLook()).success).toBe(true);
    expect(lookSchema.safeParse(randomLook(() => 0.999)).success).toBe(true);
  });
});
