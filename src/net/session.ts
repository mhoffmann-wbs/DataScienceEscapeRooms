import type { Profile } from '../player/profile';
import { Chat } from './chat';
import { Presence } from './presence';
import { Proximity, type Area } from './proximity';
import { RunSync, type RunState } from './run';
import { roomScope, Teams } from './teams';
import type { NetRoom, Transport } from './transport';

/** Outside private areas, nearby chat and A/V reach peers within this many pixels: 5 tiles. */
export const NEARBY_RADIUS = 5 * 32;

/** Everything networked about being in one space: presence and chat. */
export class Session {
  readonly presence: Presence;
  readonly chat: Chat;
  readonly proximity: Proximity;
  protected readonly room: NetRoom;
  private left = false;

  /** `areas` are the map's private areas (Tiled `area` objects). */
  constructor(transport: Transport, scope: string, profile: Profile, areas: readonly Area[] = []) {
    this.room = transport.join(scope);
    this.proximity = new Proximity(NEARBY_RADIUS, areas);
    this.presence = new Presence(this.room, profile);
    this.chat = new Chat(this.room, this.presence, profile, this.proximity);
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

  constructor(transport: Transport, profile: Profile, areas: readonly Area[] = []) {
    super(transport, 'lobby', profile, areas);
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
    areas: readonly Area[] = [],
  ) {
    super(transport, roomScope(info.roomId, info.teamId), profile, areas);
    this.run = new RunSync(this.room, info.state);
  }

  protected override dispose(): void {
    this.run.destroy();
  }
}
