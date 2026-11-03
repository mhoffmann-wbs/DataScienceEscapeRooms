import { beforeEach, describe, expect, it } from 'vitest';
import { loadProfile, normalizeClassCode, profileSchema, saveProfile } from './profile';

describe('profile', () => {
  beforeEach(() => localStorage.clear());

  it('normalizes class codes', () => {
    expect(normalizeClassCode('  ds 2026 fall ')).toBe('DS-2026-FALL');
  });

  it('rejects invalid profiles', () => {
    expect(profileSchema.safeParse({ nickname: '', avatar: 0, classCode: 'ABC' }).success).toBe(false);
    expect(profileSchema.safeParse({ nickname: 'Ada', avatar: 99, classCode: 'ABC' }).success).toBe(false);
    expect(profileSchema.safeParse({ nickname: 'Ada', avatar: 0, classCode: 'ab' }).success).toBe(false);
  });

  it('round-trips through storage and ignores corrupt data', () => {
    saveProfile({ nickname: 'Ada', avatar: 2, classCode: 'DS-01' });
    expect(loadProfile()).toEqual({ nickname: 'Ada', avatar: 2, classCode: 'DS-01' });
    localStorage.setItem('dser.profile', '{not json');
    expect(loadProfile()).toBeNull();
  });
});
