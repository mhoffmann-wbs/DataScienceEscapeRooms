// Typed event bus between Phaser scenes and React overlays.
// Neither side reaches into the other's internals; everything crosses here.
import { Emitter } from '../lib/emitter';

/** Something the player can use with E: a door (to a roomId or 'lobby'), a puzzle object, a clue to look at or the room's handbook. */
export type Interactable = { kind: 'door'; doorTo: string } | { kind: 'puzzle'; puzzleId: string } | { kind: 'clue'; clueId: string } | { kind: 'reference' };

export interface GameEvents {
  /** The World scene finished building `mapKey`; React re-sends state the scene displays. */
  'scene:ready': { scene: string };
  /** The local player stepped onto an interactable, or off one (null). */
  'interact:changed': { target: Interactable | null };
  /** The local player pressed E while on an interactable. */
  'interact:use': { target: Interactable };
  /** React -> scene: puzzles to mark as solved on the map. */
  'puzzles:solved': { ids: readonly string[] };
  /** React -> scene: peers that are instructors (signed, see InstructorChannel), and whether we are one. */
  'instructors:changed': { ids: readonly string[]; self: boolean };
  /** React -> scene: a chat message to show as a speech bubble (`self` for our own). */
  'chat:bubble': { peerId: string; self: boolean; text: string };
  /** React -> scene: move the local player next to this peer (instructors), once it is on the map. */
  'player:goto': { peerId: string };
}

export const bus = new Emitter<GameEvents>();
