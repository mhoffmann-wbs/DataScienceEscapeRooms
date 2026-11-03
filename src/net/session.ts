import type { Profile } from '../player/profile';
import { Chat } from './chat';
import { Presence } from './presence';
import type { NetRoom, Transport } from './transport';

/** Nearby chat (and later proximity A/V) reaches peers within this many pixels: 5 tiles. */
export const NEARBY_RADIUS = 5 * 32;

/** Everything networked about being in one space (the lobby now, room instances later). */
export class Session {
  readonly presence: Presence;
  readonly chat: Chat;
  private readonly room: NetRoom;
  private left = false;

  constructor(transport: Transport, scope: string, profile: Profile) {
    this.room = transport.join(scope);
    this.presence = new Presence(this.room, profile);
    this.chat = new Chat(this.room, this.presence, profile, NEARBY_RADIUS);
  }

  /** Idempotent: called both on unmount and on page hide. */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.chat.destroy();
    this.presence.destroy();
    this.room.leave();
  }
}
