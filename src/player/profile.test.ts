import { beforeEach, describe, expect, it } from 'vitest';
import { legacyLook } from '../game/avatars';
import { loadProfile, profileSchema, saveProfile } from './profile';

const look = legacyLook(2)!;

describe('profile', () => {
  beforeEach(() => localStorage.clear());

  it('rejects invalid profiles', () => {
    expect(profileSchema.safeParse({ nickname: '', look }).success).toBe(false);
    expect(profileSchema.safeParse({ nickname: 'Ada', look: { ...look, hairStyle: 5 } }).success).toBe(false);
  });

  it('round-trips through storage and ignores corrupt data', () => {
    saveProfile({ nickname: 'Ada', look });
    expect(loadProfile()).toEqual({ nickname: 'Ada', look });
    localStorage.setItem('dser.profile', '{not json');
    expect(loadProfile()).toBeNull();
  });

  it('still loads profiles saved with the old class code', () => {
    localStorage.setItem('dser.profile', JSON.stringify({ nickname: 'Ada', look, classCode: 'DS-01' }));
    expect(loadProfile()).toEqual({ nickname: 'Ada', look });
  });

  it('turns an old fixed avatar into a look', () => {
    localStorage.setItem('dser.profile', JSON.stringify({ nickname: 'Ada', avatar: 2 }));
    expect(loadProfile()).toEqual({ nickname: 'Ada', look });
    localStorage.setItem('dser.profile', JSON.stringify({ nickname: 'Ada', avatar: 99 }));
    expect(loadProfile()).toBeNull();
  });
});
