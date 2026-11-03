// Typed event bus between Phaser scenes and React overlays.
// Neither side reaches into the other's internals; everything crosses here.
import { Emitter } from '../lib/emitter';

/** Something the player can use with E: a door (to a roomId or 'lobby') or a puzzle object. */
export type Interactable = { kind: 'door'; doorTo: string } | { kind: 'puzzle'; puzzleId: string };

export interface GameEvents {
  /** The World scene finished building `mapKey`; React re-sends state the scene displays. */
  'scene:ready': { scene: string };
  /** The local player stepped onto an interactable, or off one (null). */
  'interact:changed': { target: Interactable | null };
  /** The local player pressed E while on an interactable. */
  'interact:use': { target: Interactable };
  /** React -> scene: puzzles to mark as solved on the map. */
  'puzzles:solved': { ids: readonly string[] };
}

export const bus = new Emitter<GameEvents>();
