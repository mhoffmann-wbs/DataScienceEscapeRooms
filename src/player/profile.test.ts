import { beforeEach, describe, expect, it } from 'vitest';
import { loadProfile, profileSchema, saveProfile } from './profile';

describe('profile', () => {
  beforeEach(() => localStorage.clear());

  it('rejects invalid profiles', () => {
    expect(profileSchema.safeParse({ nickname: '', avatar: 0 }).success).toBe(false);
    expect(profileSchema.safeParse({ nickname: 'Ada', avatar: 99 }).success).toBe(false);
  });

  it('round-trips through storage and ignores corrupt data', () => {
    saveProfile({ nickname: 'Ada', avatar: 2 });
    expect(loadProfile()).toEqual({ nickname: 'Ada', avatar: 2 });
    localStorage.setItem('dser.profile', '{not json');
    expect(loadProfile()).toBeNull();
  });

  it('still loads profiles saved with the old class code', () => {
    localStorage.setItem('dser.profile', JSON.stringify({ nickname: 'Ada', avatar: 1, classCode: 'DS-01' }));
    expect(loadProfile()).toEqual({ nickname: 'Ada', avatar: 1 });
  });
});
