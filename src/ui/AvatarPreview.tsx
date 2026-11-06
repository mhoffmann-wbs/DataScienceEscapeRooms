import { useEffect, useState } from 'react';
import { AVATAR_FRAME_SIZE, AVATAR_PARTS_URL, AVATAR_SHEET_COLUMNS, frameIndex, lookKey, renderLook, type Direction, type Look } from '../game/avatars';

let parts: Promise<HTMLImageElement> | null = null;
const strips = new Map<string, string>();

function loadParts(): Promise<HTMLImageElement> {
  parts ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = AVATAR_PARTS_URL;
  });
  return parts;
}

/** A data URL of the look's sprite strip, once the parts sheet has loaded. */
function useLookStrip(look: Look): string | null {
  const key = lookKey(look);
  // bumped when a strip finishes, so the cache is read again
  const [, setMade] = useState(0);
  useEffect(() => {
    if (strips.has(key)) return;
    let live = true;
    loadParts()
      .then((img) => {
        strips.set(key, renderLook(img, look).toDataURL());
        if (live) setMade((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // the key covers every field of the look
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return strips.get(key) ?? null;
}

/** Shows the idle frame of an avatar, facing the viewer unless `dir` says otherwise. */
export function AvatarPreview({ look, scale = 2, dir = 'down' }: { look: Look; scale?: number; dir?: Direction }) {
  const url = useLookStrip(look);
  const size = AVATAR_FRAME_SIZE * scale;
  return (
    <span
      className="avatar-preview"
      style={{
        width: size,
        height: size,
        backgroundImage: url ? `url(${url})` : undefined,
        backgroundSize: `${AVATAR_SHEET_COLUMNS * size}px ${size}px`,
        backgroundPosition: `-${frameIndex(dir) * size}px 0`,
      }}
    />
  );
}
