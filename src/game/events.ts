// Typed event bus between Phaser scenes and React overlays.
// Neither side reaches into the other's internals; everything crosses here.
import { Emitter } from '../lib/emitter';

export interface GameEvents {
  'scene:ready': { scene: string };
  /** The local player stepped onto a door (its `doorTo`: a roomId or 'lobby') or off one (null). */
  'door:changed': { doorTo: string | null };
  /** The local player pressed the interact key while standing on a door. */
  'door:interact': { doorTo: string };
}

export const bus = new Emitter<GameEvents>();
