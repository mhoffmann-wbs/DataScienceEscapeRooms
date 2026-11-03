// Typed event bus between Phaser scenes and React overlays.
// Neither side reaches into the other's internals; everything crosses here.

export interface GameEvents {
  'scene:ready': { scene: string };
  /** The local player stepped onto (roomId) or off (null) a door. */
  'door:changed': { roomId: string | null };
  /** The local player pressed the interact key while standing on a door. */
  'door:interact': { roomId: string };
}

type Handler<K extends keyof GameEvents> = (payload: GameEvents[K]) => void;

class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<never>>>();

  on<K extends keyof GameEvents>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof GameEvents>(event: K, payload: GameEvents[K]): void {
    this.handlers.get(event)?.forEach((h) => (h as Handler<K>)(payload));
  }
}

export const bus = new EventBus();
