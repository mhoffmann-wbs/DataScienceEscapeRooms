import type { Profile } from '../player/profile';
import { Chat } from './chat';
import { Presence } from './presence';
import { RunSync, type RunState } from './run';
import { roomScope, Teams } from './teams';
import type { NetRoom, Transport } from './transport';

/** Nearby chat (and later proximity A/V) reaches peers within this many pixels: 5 tiles. */
export const NEARBY_RADIUS = 5 * 32;

/** Everything networked about being in one space: presence and chat. */
export class Session {
  readonly presence: Presence;
  readonly chat: Chat;
  protected readonly room: NetRoom;
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
    this.dispose();
    this.chat.destroy();
    this.presence.destroy();
    this.room.leave();
  }

  /** Subclasses release what they built on `room`. */
  protected dispose(): void {}
}

export class LobbySession extends Session {
  readonly kind = 'lobby';
  readonly teams: Teams;

  constructor(transport: Transport, profile: Profile) {
    super(transport, 'lobby', profile);
    this.teams = new Teams(this.room);
  }

  protected override dispose(): void {
    this.teams.destroy();
  }
}

export interface RunInfo {
  roomId: string;
  teamId: string;
  state: RunState;
}

export class RoomSession extends Session {
  readonly kind = 'room';
  readonly run: RunSync;

  constructor(
    transport: Transport,
    profile: Profile,
    readonly info: RunInfo,
  ) {
    super(transport, roomScope(info.roomId, info.teamId), profile);
    this.run = new RunSync(this.room, info.state);
  }

  protected override dispose(): void {
    this.run.destroy();
  }
}
