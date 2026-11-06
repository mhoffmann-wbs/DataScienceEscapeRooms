import { z } from 'zod';
import { legacyLook, lookSchema } from '../game/avatars';

export const profileSchema = z.object({
  nickname: z.string().trim().min(1).max(20),
  look: lookSchema,
});

export type Profile = z.infer<typeof profileSchema>;

const STORAGE_KEY = 'dser.profile';

/** Profiles saved before looks could be customized name one of twelve fixed avatars. */
const storedSchema = z.preprocess((raw) => {
  if (raw && typeof raw === 'object' && !('look' in raw) && 'avatar' in raw && typeof raw.avatar === 'number') {
    return { ...raw, look: legacyLook(raw.avatar) };
  }
  return raw;
}, profileSchema);

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // storage unavailable; the profile just won't be remembered
  }
}
