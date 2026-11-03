import type Phaser from 'phaser';
import type { Session } from '../net/session';
import type { Profile } from '../player/profile';

// Typed access to values React hands to the game at creation time.
const PROFILE = 'profile';
const SESSION = 'session';

export function setGameContext(game: Phaser.Game, profile: Profile, session: Session): void {
  game.registry.set(PROFILE, profile);
  game.registry.set(SESSION, session);
}

function get<T>(scene: Phaser.Scene, key: string): T {
  const value = scene.registry.get(key) as T | undefined;
  if (value === undefined) throw new Error(`Game started without ${key}`);
  return value;
}

export const getProfile = (scene: Phaser.Scene) => get<Profile>(scene, PROFILE);
export const getSession = (scene: Phaser.Scene) => get<Session>(scene, SESSION);
