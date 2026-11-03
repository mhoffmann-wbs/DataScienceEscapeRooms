// Typed event bus between Phaser scenes and React overlays.
// Neither side reaches into the other's internals; everything crosses here.
import { Emitter } from '../lib/emitter';

export interface GameEvents {
  'scene:ready': { scene: string };
  /** The local player stepped onto (roomId) or off (null) a door. */
  'door:changed': { roomId: string | null };
  /** The local player pressed the interact key while standing on a door. */
  'door:interact': { roomId: string };
}

export const bus = new Emitter<GameEvents>();
