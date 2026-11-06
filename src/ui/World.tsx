import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createGame } from '../game/createGame';
import { bus, type Interactable } from '../game/events';
import { LOBBY, MAPS } from '../game/maps';
import { parseMapObjects, tiledMapSchema } from '../game/tiled';
import { createMemoryTransport, MemoryHub } from '../net/memoryTransport';
import { attemptsPerPuzzle, type RunState } from '../net/run';
import type { RunSummary } from '../net/runs';
import { INSTRUCTOR_CONFIG } from '../net/instructorConfig';
import { LobbySession, RoomSession } from '../net/session';
import type { StartedTeam } from '../net/teams';
import type { Transport } from '../net/transport';
import type { Profile } from '../player/profile';
import { saveRun, type SavedRun } from '../player/run';
import { finalPuzzleId, getPuzzle, ROOMS } from '../rooms';
import { AvDock } from './AvDock';
import { ChatBubbles } from './ChatBubbles';
import { ChatPanel } from './ChatPanel';
import { ClueDialog, DebriefDialog, IntroDialog } from './RoomDialogs';
import { InteractPrompt } from './InteractPrompt';
import { LeaveRoomDialog, RunEndedDialog } from './LeaveRoomDialog';
import { NotesPanel } from './NotesPanel';
import { PeoplePanel } from './PeoplePanel';
import { PuzzleDialog } from './PuzzleDialog';
import { RoomHud } from './RoomHud';
import { ScoreboardDialog } from './ScoreboardDialog';
import { TeamBar } from './TeamBar';
import { TeamDialog } from './TeamDialog';
import { nameOf } from './names';
import { useEmitterValue } from './useStore';

export type Place =
  /** `from`: the room just left, so the player arrives in front of its door. */
  | { kind: 'lobby'; from?: string }
  | {
      kind: 'room';
      run: SavedRun;
      /** Author mode (dev only): offline, locks ignored, run not saved, optionally opens a puzzle. */
      author?: { puzzleId?: string };
      /** An instructor visiting a team's room: run not saved, not counted as a member. */
      observer?: boolean;
    };

interface Props {
  profile: Profile;
  place: Place;
  /** The shared lobby connection (App owns it); null when offline (author mode). */
  lobby: LobbySession | null;
  transport: Transport;
  onEnterRoom: (started: StartedTeam, leader: string) => void;
  /** `finished`: the team escaped, so the saved run can go. */
  onLeaveRoom: (finished: boolean) => void;
  /** Go back into the saved, unfinished run. */
  onRejoin: () => void;
  /** Play a room alone, offline. */
  onPractise: (roomId: string) => void;
  /** The unlocked instructor key, if any. */
  instructorKey: CryptoKey | null;
  /** Instructors: go to a player (see PeoplePanel). */
  onGoTo: ((peerId: string) => Promise<boolean>) | null;
}

/** One place in the world: its Phaser game, and for rooms the room's network session. */
export function World({ profile, place, lobby, transport, onEnterRoom, onLeaveRoom, onRejoin, onPractise, instructorKey, onGoTo }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  // Author mode and solo practice play the room offline, on an in-process network of one.
  const solo = place.kind === 'room' && !!place.run.solo;
  const offline = place.kind === 'room' && (!!place.author || solo);
  const roomTransport = useMemo(() => (offline ? createMemoryTransport(new MemoryHub(), 'offline') : transport), [offline, transport]);
  const [session, setSession] = useState<LobbySession | RoomSession | null>(null);

  useEffect(() => {
    const mapKey = place.kind === 'lobby' ? LOBBY : place.run.roomId;
    let s: LobbySession | RoomSession;
    if (place.kind === 'lobby') {
      if (!lobby) return;
      s = lobby;
    } else {
      const { areas } = parseMapObjects(tiledMapSchema.parse(MAPS[mapKey]));
      s = new RoomSession(roomTransport, profile, place.run, areas);
    }
    // In the lobby we're on the map; in a room we stay connected to the lobby but away.
    lobby?.presence.setAway(place.kind === 'room' ? place.run.roomId : null);
    const offs: (() => void)[] = [];
    if (s instanceof RoomSession && place.kind === 'room' && !place.author && !place.observer) {
      const save = () => saveRun({ ...place.run, state: s.run.state, notes: s.notebook.state });
      offs.push(s.run.events.on('state', save), s.notebook.events.on('notes', save));
    }
    const game = createGame(containerRef.current!, { profile, presence: s.presence, mapKey, arriveAt: place.kind === 'lobby' && place.from ? ROOMS[place.from]?.category : undefined });
    // The session only exists once the effect runs (it opens network connections).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(s);
    // Typing starts on the canvas, not on whatever button was last clicked.
    (document.activeElement as HTMLElement | null)?.blur();
    // The room session is ours to close (App closes the lobby). Closing explicitly lets peers
    // see us leave at once instead of after WebRTC's ~10 s disconnect timeout.
    const own = s !== lobby;
    const onPageHide = () => own && s.leave();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      offs.forEach((off) => off());
      game.destroy(true);
      if (own) s.leave();
      setSession(null);
    };
  }, [roomTransport, lobby, profile, place]);

  return (
    <>
      {/* Clicking the map ends typing in any field (chat, notes), so walking works again. */}
      <div ref={containerRef} className="game" role="region" aria-label={t('app.map')} onPointerDown={() => (document.activeElement as HTMLElement | null)?.blur?.()} />
      {session instanceof LobbySession && <LobbyOverlays session={session} profile={profile} instructorKey={instructorKey} onGoTo={onGoTo} onEnterRoom={onEnterRoom} onRejoin={onRejoin} onPractise={onPractise} />}
      {session instanceof RoomSession && place.kind === 'room' && (
        // A solo run has no team to report to the lobby.
        <RoomOverlays session={session} lobby={solo ? null : lobby} solo={solo} observer={!!place.observer} profile={profile} author={place.author} onGoTo={onGoTo} onLeaveRoom={onLeaveRoom} />
      )}
    </>
  );
}

interface LobbyOverlaysProps {
  session: LobbySession;
  profile: Profile;
  instructorKey: CryptoKey | null;
  onGoTo: ((peerId: string) => Promise<boolean>) | null;
  onEnterRoom: (started: StartedTeam, leader: string) => void;
  onRejoin: () => void;
  onPractise: (roomId: string) => void;
}

function LobbyOverlays({ session, profile, instructorKey, onGoTo, onEnterRoom, onRejoin, onPractise }: LobbyOverlaysProps) {
  const { t } = useTranslation();
  const [dialogDoor, setDialogDoor] = useState<string | null>(null);
  const [scoreboard, setScoreboard] = useState(false);
  useEffect(
    () => session.teams.events.on('started', (started) => onEnterRoom(started, nameOf(started.team.leader, session.presence, profile))),
    [session, onEnterRoom, profile],
  );
  // Stepping onto a lobby door opens its dialog; E reopens it after closing it there.
  const use = useCallback((target: Interactable) => target.kind === 'door' && setDialogDoor(target.doorTo), []);
  const leave = useCallback(() => setDialogDoor(null), []);

  return (
    <>
      <InteractPrompt onUse={use} onEnter={use} onLeave={leave} />
      <div className="overlay lobby-actions">
        <button type="button" onClick={() => setScoreboard(true)}>
          🏆 {t('scores.title')}
        </button>
      </div>
      {scoreboard && (
        <ScoreboardDialog
          scores={session.scores}
          instructor={instructorKey && { channel: session.instructor, signingKey: instructorKey }}
          onClose={() => setScoreboard(false)}
        />
      )}
      <TeamBar teams={session.teams} presence={session.presence} profile={profile} />
      {dialogDoor && (
        <TeamDialog
          doorId={dialogDoor}
          teams={session.teams}
          runs={session.runs}
          presence={session.presence}
          profile={profile}
          onRejoin={onRejoin}
          onPractise={onPractise}
          onClose={leave}
        />
      )}
      <ChatPanel chat={session.chat} />
      <ChatBubbles chat={session.chat} />
      <div className="side-column">
        <PeoplePanel presence={session.presence} self={profile} heading={(n) => t('people.title', { count: n })} aloneText={t('people.alone')} onGoTo={onGoTo} />
        <AvDock media={session.media} presence={session.presence} scope="proximity" />
      </div>
    </>
  );
}

const END_SEND_MS = 400;

type RoomDialog = { kind: 'puzzle'; puzzleId: string } | { kind: 'clue'; clueId: string } | { kind: 'leave' } | { kind: 'intro' } | { kind: 'escaped' } | null;

interface RoomOverlaysProps {
  session: RoomSession;
  /** Where the run's summary is published (null offline). */
  lobby: LobbySession | null;
  /** Solo practice: no chat or voice, nobody to talk to. */
  solo: boolean;
  /** A visiting instructor: neither reports the run nor calls for help. */
  observer: boolean;
  profile: Profile;
  author?: { puzzleId?: string };
  onGoTo: ((peerId: string) => Promise<boolean>) | null;
  onLeaveRoom: (finished: boolean) => void;
}

function RoomOverlays({ session, lobby, solo, observer, profile, author, onGoTo, onLeaveRoom }: RoomOverlaysProps) {
  const { t } = useTranslation();
  const { roomId } = session.info;
  const { run } = session;
  const state = useEmitterValue(run.events, 'state', () => run.state);
  const [dialog, setDialog] = useState<RoomDialog>(() => {
    if (author?.puzzleId) return { kind: 'puzzle', puzzleId: author.puzzleId };
    return author || observer || Object.keys(run.state.solved).length > 0 ? null : { kind: 'intro' };
  });

  // Tell the lobby how the run is going (scoreboard, instructors), and stop when we leave.
  // A visiting instructor isn't a member, and doesn't report.
  const reporter = observer ? null : lobby;
  const roster = useEmitterValue(session.presence.events, 'roster', () => session.presence.list());
  useEffect(() => {
    if (!reporter || state.endedAt !== null) return;
    const members = roster.filter((p) => !reporter.help.isVisitor(p.id));
    const names = [profile.nickname, ...members.map((p) => p.nickname)];
    reporter.runs.publish(summarize(session, state, names, [reporter.selfId, ...members.map((p) => p.id)], profile.nickname));
  }, [reporter, session, state, roster, profile.nickname]);
  useEffect(() => () => reporter?.runs.withdraw(), [reporter]);
  // Members record themselves in the run (again after a reset), so the result names everyone who played.
  useEffect(() => {
    if (!author && !observer) run.join(profile.nickname);
  }, [run, state, author, observer, profile.nickname]);

  // Players can call the instructor, and answer the instructor's visit (see HelpDesk).
  const help = reporter && INSTRUCTOR_CONFIG ? reporter.help : null;
  useEffect(() => {
    if (!help) return;
    help.setPlaying(session.info);
    return () => help.setPlaying(null);
  }, [help, session]);

  // An instructor reset starts this team's run over (signed; see InstructorChannel). The
  // banner (Announcements) tells the players.
  useEffect(() => {
    if (!lobby) return;
    return lobby.instructor.events.on('reset', ({ teamId, epoch }) => teamId === session.info.teamId && session.run.reset(epoch));
  }, [lobby, session]);

  // Keep the map's ✓ markers in sync, including after the scene (re)starts.
  useEffect(() => {
    const send = () => bus.emit('puzzles:solved', { ids: Object.keys(run.state.solved) });
    send();
    const offs = [run.events.on('state', send), bus.on('scene:ready', send)];
    return () => offs.forEach((off) => off());
  }, [run]);

  // Show the escape screen once, when the final puzzle gets solved (by anyone on the team).
  const finalId = finalPuzzleId(roomId);
  const escaped = finalId !== undefined && finalId in state.solved;
  const [seenEscape, setSeenEscape] = useState(escaped);
  if (escaped && !seenEscape) {
    setSeenEscape(true);
    setDialog({ kind: 'escaped' });
  }

  // The creator can end the run for everyone; it then can't be rejoined.
  const ended = state.endedAt !== null && !escaped;
  useEffect(() => {
    if (ended) reporter?.runs.withdraw();
  }, [ended, reporter]);
  const canEnd = !!session.info.creator && !author && !observer;
  const [ending, setEnding] = useState(false);
  const endRun = () => {
    setEnding(true);
    run.end();
    // Leaving closes the connections at once; give the message a moment to reach the team.
    setTimeout(() => onLeaveRoom(true), END_SEND_MS);
  };

  const use = useCallback((target: Interactable) => {
    if (target.kind === 'door') setDialog({ kind: 'leave' });
    else if (target.kind === 'clue') setDialog({ kind: 'clue', clueId: target.clueId });
    else setDialog({ kind: 'puzzle', puzzleId: target.puzzleId });
  }, []);
  // Walking away closes a dialog opened from an object, but not the intro or escape screens.
  const leave = useCallback(() => setDialog((d) => (d?.kind === 'puzzle' || d?.kind === 'clue' || d?.kind === 'leave' ? null : d)), []);
  const close = useCallback(() => setDialog(null), []);
  const openDebrief = useCallback(() => setDialog({ kind: 'escaped' }), []);
  const puzzle = dialog?.kind === 'puzzle' ? getPuzzle(roomId, dialog.puzzleId) : undefined;

  return (
    <>
      <RoomHud roomId={roomId} run={run} solo={solo} observer={observer} help={help} onDebrief={openDebrief} />
      <InteractPrompt roomId={roomId} solved={state.solved} onUse={use} onLeave={leave} />
      {puzzle && <PuzzleDialog key={puzzle.id} roomId={roomId} puzzle={puzzle} run={run} author={!!author} notebook={session.notebook} codeShare={session.codeShare} presence={session.presence} onClose={close} />}
      {dialog?.kind === 'clue' && <ClueDialog roomId={roomId} clueId={dialog.clueId} notebook={session.notebook} onClose={close} />}
      {dialog?.kind === 'leave' && !ending && <LeaveRoomDialog finished={escaped} solo={solo} onEnd={canEnd ? endRun : undefined} onLeave={() => onLeaveRoom(escaped)} onStay={close} />}
      {ended && !ending && <RunEndedDialog onLobby={() => onLeaveRoom(true)} />}
      {dialog?.kind === 'intro' && <IntroDialog roomId={roomId} onClose={close} />}
      {dialog?.kind === 'escaped' && <DebriefDialog roomId={roomId} state={state} onLobby={() => onLeaveRoom(true)} onClose={close} />}
      {!solo && <ChatPanel chat={session.chat} />}
      {!solo && <ChatBubbles chat={session.chat} />}
      <div className="side-column">
        <PeoplePanel presence={session.presence} self={profile} heading={(n) => t('room.team', { count: n })} aloneText={t('room.alone')} onGoTo={onGoTo} />
        <NotesPanel notebook={session.notebook} />
        {!author && !solo && <AvDock media={session.media} presence={session.presence} scope="team" />}
      </div>
    </>
  );
}

/** The lobby-facing summary of this team's run. */
function summarize(session: RoomSession, state: RunState, members: string[], peers: string[], self: string): RunSummary {
  const { roomId, teamId, leader, group } = session.info;
  const hints: Record<string, number> = {};
  for (const key of Object.keys(state.hints)) {
    const puzzleId = key.split('#')[0]!;
    hints[puzzleId] = (hints[puzzleId] ?? 0) + 1;
  }
  return {
    teamId,
    roomId,
    leader: leader ?? self,
    group: group ?? null,
    members,
    left: Object.keys(state.players).filter((name) => !members.includes(name)),
    peers,
    epoch: state.epoch,
    startedAt: state.startedAt,
    solved: state.solved,
    hints,
    attempts: attemptsPerPuzzle(state),
    escapedAt: state.solved[finalPuzzleId(roomId) ?? ''] ?? null,
    at: Date.now(),
  };
}
