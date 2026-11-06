// Layout of content/sprites/avatars.png (see scripts/generate-art.mjs):
// one row per avatar, columns = direction x 3 frames (idle, step, other step).
import avatarSheetUrl from '../../content/sprites/avatars.png';

export const AVATAR_SHEET_URL = avatarSheetUrl;
export const AVATAR_COUNT = 12;
export const AVATAR_FRAME_SIZE = 32;
export const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export type Direction = (typeof DIRECTIONS)[number];

const FRAMES_PER_DIRECTION = 3;
export const AVATAR_SHEET_COLUMNS = DIRECTIONS.length * FRAMES_PER_DIRECTION;

export function frameIndex(avatar: number, dir: Direction, frame = 0): number {
  return avatar * AVATAR_SHEET_COLUMNS + DIRECTIONS.indexOf(dir) * FRAMES_PER_DIRECTION + frame;
}

/** The walk cycle: step, idle, other step, idle. */
export const WALK_FRAMES = [1, 0, 2, 0];

export function walkAnimKey(avatar: number, dir: Direction): string {
  return `avatar${avatar}-walk-${dir}`;
}
