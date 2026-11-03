import type Phaser from 'phaser';
import type { Profile } from '../player/profile';

// Typed access to values React hands to the game at creation time.
const PROFILE = 'profile';

export function setProfile(game: Phaser.Game, profile: Profile): void {
  game.registry.set(PROFILE, profile);
}

export function getProfile(scene: Phaser.Scene): Profile {
  const profile = scene.registry.get(PROFILE) as Profile | undefined;
  if (!profile) throw new Error('Game started without a profile');
  return profile;
}
