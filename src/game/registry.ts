import type Phaser from 'phaser';
import type { Presence } from '../net/presence';
import type { Profile } from '../player/profile';

// Typed access to values React hands to the game at creation time.
const PROFILE = 'profile';
const PRESENCE = 'presence';
const MAP_KEY = 'mapKey';

export interface GameContext {
  profile: Profile;
  presence: Presence;
  /** Which map to show: 'lobby' or a roomId (see maps.ts). */
  mapKey: string;
}

export function setGameContext(game: Phaser.Game, ctx: GameContext): void {
  game.registry.set(PROFILE, ctx.profile);
  game.registry.set(PRESENCE, ctx.presence);
  game.registry.set(MAP_KEY, ctx.mapKey);
}

function get<T>(scene: Phaser.Scene, key: string): T {
  const value = scene.registry.get(key) as T | undefined;
  if (value === undefined) throw new Error(`Game started without ${key}`);
  return value;
}

export const getProfile = (scene: Phaser.Scene) => get<Profile>(scene, PROFILE);
export const getPresence = (scene: Phaser.Scene) => get<Presence>(scene, PRESENCE);
export const getMapKey = (scene: Phaser.Scene) => get<string>(scene, MAP_KEY);
