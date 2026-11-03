import { z } from 'zod';
import { AVATAR_COUNT } from '../game/avatars';

export const profileSchema = z.object({
  nickname: z.string().trim().min(1).max(20),
  avatar: z.number().int().min(0).max(AVATAR_COUNT - 1),
  // Keeps cohorts apart: players only see others with the same code.
  classCode: z.string().regex(/^[A-Z0-9-]{3,16}$/),
});

export type Profile = z.infer<typeof profileSchema>;

const STORAGE_KEY = 'dser.profile';

export function normalizeClassCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '-');
}

export function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = profileSchema.safeParse(JSON.parse(raw));
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
