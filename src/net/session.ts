import type { Profile } from '../player/profile';
import { Chat } from './chat';
import { CodeShare } from './codeShare';
import { InstructorChannel, type InstructorConfig } from './instructor';
import { Media, type MediaMode } from './media';
import { Notebook, type Notes } from './notebook';
import { Presence } from './presence';
import { Proximity, type Area } from './proximity';
import { RunSync, type RunState } from './run';
import { Runs } from './runs';
import { Scores } from './scores';
import { roomScope, Teams } from './teams';
import type { NetRoom, Transport } from './transport';

/** Outside private areas, nearby chat and A/V reach peers within this many pixels: 5 tiles. */
export const NEARBY_RADIUS = 5 * 32;

/** Everything networked about being in one space: presence, chat and voice/video. */
export class Session {
  readonly presence: Presence;
  readonly chat: Chat;
  readonly proximity: Proximity;
  readonly media: Media;
  protected readonly room: NetRoom;
  private left = false;

  /** `areas` are the map's private areas (Tiled `area` objects); `mediaMode` whom A/V reaches. */
  constructor(transport: Transport, scope: string, profile: Profile, areas: readonly Area[] = [], mediaMode: MediaMode = 'proximity', password?: string) {
    this.room = transport.join(scope, { password });
    this.proximity = new Proximity(NEARBY_RADIUS, areas);
    this.presence = new Presence(this.room, profile);
    this.chat = new Chat(this.room, this.presence, profile, this.proximity);
    this.media = new Media(this.room, this.presence, this.proximity, mediaMode);
  }

  /** Idempotent: called both on unmount and on page hide. */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.dispose();
    this.media.destroy();
    this.chat.destroy();
    this.presence.destroy();
    this.room.leave();
  }

  /** Subclasses release what they built on `room`. */
  protected dispose(): void {}
}

/** The shared lobby. Players stay connected to it while in a room (presence marks them away). */
export class LobbySession extends Session {
  readonly kind = 'lobby';
  readonly teams: Teams;
  readonly runs: Runs;
  readonly scores: Scores;
  readonly instructor: InstructorChannel;

  /** `instructor`: the public instructor config; null means instructor messages are ignored. */
  constructor(transport: Transport, profile: Profile, areas: readonly Area[] = [], instructor: InstructorConfig | null = null) {
    super(transport, 'lobby', profile, areas);
    this.teams = new Teams(this.room);
    this.runs = new Runs(this.room);
    this.scores = new Scores(this.room, this.runs);
    this.instructor = new InstructorChannel(this.room, instructor);
  }

  protected override dispose(): void {
    this.instructor.destroy();
    this.scores.destroy();
    this.runs.destroy();
    this.teams.destroy();
  }
}

export interface RunInfo {
  roomId: string;
  teamId: string;
  state: RunState;
  /** The team's shared notes; missing in runs saved before notes existed. */
  notes?: Notes;
  /** Set for password-protected teams: the room's connection is encrypted with it. */
  password?: string;
  /** The leader's nickname, for "<leader>'s team" on the scoreboard and for instructors. */
  leader?: string;
  group?: string | null;
}

export class RoomSession extends Session {
  readonly kind = 'room';
  readonly run: RunSync;
  readonly notebook: Notebook;
  readonly codeShare: CodeShare;

  constructor(
    transport: Transport,
    profile: Profile,
    readonly info: RunInfo,
    areas: readonly Area[] = [],
  ) {
    // Inside a room the whole team is always connected.
    super(transport, roomScope(info.roomId, info.teamId), profile, areas, 'team', info.password);
    this.run = new RunSync(this.room, info.state);
    this.notebook = new Notebook(this.room, info.notes ?? {}, this.room.selfId);
    this.codeShare = new CodeShare(this.room);
  }

  protected override dispose(): void {
    this.codeShare.destroy();
    this.notebook.destroy();
    this.run.destroy();
  }
}
