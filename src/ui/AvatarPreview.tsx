import { AVATAR_COUNT, AVATAR_FRAME_SIZE, AVATAR_SHEET_COLUMNS, AVATAR_SHEET_URL, frameIndex } from '../game/avatars';

/** Shows the idle front-facing frame of an avatar from the sprite sheet. */
export function AvatarPreview({ avatar, scale = 2 }: { avatar: number; scale?: number }) {
  const index = frameIndex(avatar, 'down');
  const size = AVATAR_FRAME_SIZE * scale;
  return (
    <span
      className="avatar-preview"
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${AVATAR_SHEET_URL})`,
        backgroundSize: `${AVATAR_SHEET_COLUMNS * size}px ${AVATAR_COUNT * size}px`,
        backgroundPosition: `-${(index % AVATAR_SHEET_COLUMNS) * size}px -${Math.floor(index / AVATAR_SHEET_COLUMNS) * size}px`,
      }}
    />
  );
}
