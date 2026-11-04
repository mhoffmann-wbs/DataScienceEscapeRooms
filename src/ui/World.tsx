import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createGame } from '../game/createGame';
import { bus, type Interactable } from '../game/events';
import { LOBBY, MAPS } from '../game/maps';
import { parseMapObjects, tiledMapSchema } from '../game/tiled';
import { createMemoryTransport, MemoryHub } from '../net/memoryTransport';
import type { RunState } from '../net/run';
import type { RunSummary } from '../net/runs';
import { LobbySession, RoomSession } from '../net/session';
import type { StartedTeam } from '../net/teams';
import type { Transport } from '../net/transport';
import type { Profile } from '../player/profile';
import { saveRun, type SavedRun } from '../player/run';
import { finalPuzzleId, getPuzzle } from '../rooms';
import { AvDock } from './AvDock';
import { ChatBubbles } from './ChatBubbles';
import { ChatPanel } from './ChatPanel';
import { ClueDialog, DebriefDialog, IntroDialog } from './RoomDialogs';
import { InteractPrompt } from './InteractPrompt';
import { LeaveRoomDialog } from './LeaveRoomDialog';
import { NotesPanel } from './NotesPanel';
import { PeoplePanel } from './PeoplePanel';
import { PuzzleDialog } from './PuzzleDialog';
import { RoomHud } from './RoomHud';
import { TeamBar } from './TeamBar';
import { TeamDialog } from './TeamDialog';
import { nameOf } from './names';
import { useEmitterValue } from './useStore';

export type Place =
  | { kind: 'lobby' }
  | {
      kind: 'room';
      run: SavedRun;
      /** Author mode (dev only): offline, locks ignored, run not saved, optionally opens a puzzle. */
      author?: { puzzleId?: string };
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
}

/** One place in the world: its Phaser game, and for rooms the room's network session. */
export function World({ profile, place, lobby, transport, onEnterRoom, onLeaveRoom, onRejoin }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const offline = place.kind === 'room' && !!place.author;
  const roomTransport = useMemo(() => (offline ? createMemoryTransport(new MemoryHub(), 'author') : transport), [offline, transport]);
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
    if (s instanceof RoomSession && place.kind === 'room' && !place.author) {
      const save = () => saveRun({ ...place.run, state: s.run.state, notes: s.notebook.state });
      offs.push(s.run.events.on('state', save), s.notebook.events.on('notes', save));
    }
    const game = createGame(containerRef.current!, { profile, presence: s.presence, mapKey });
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
      <div ref={containerRef} className="game" onPointerDown={() => (document.activeElement as HTMLElement | null)?.blur?.()} />
      {session instanceof LobbySession && <LobbyOverlays session={session} profile={profile} onEnterRoom={onEnterRoom} onRejoin={onRejoin} />}
      {session instanceof RoomSession && place.kind === 'room' && (
        <RoomOverlays session={session} lobby={lobby} profile={profile} author={place.author} onLeaveRoom={onLeaveRoom} />
      )}
    </>
  );
}

interface LobbyOverlaysProps {
  session: LobbySession;
  profile: Profile;
  onEnterRoom: (started: StartedTeam, leader: string) => void;
  onRejoin: () => void;
}

function LobbyOverlays({ session, profile, onEnterRoom, onRejoin }: LobbyOverlaysProps) {
  const { t } = useTranslation();
  const [dialogRoom, setDialogRoom] = useState<string | null>(null);
  useEffect(
    () => session.teams.events.on('started', (started) => onEnterRoom(started, nameOf(started.team.leader, session.presence, profile))),
    [session, onEnterRoom, profile],
  );
  const use = useCallback((target: Interactable) => target.kind === 'door' && setDialogRoom(target.doorTo), []);
  const leave = useCallback(() => setDialogRoom(null), []);

  return (
    <>
      <InteractPrompt onUse={use} onLeave={leave} />
      <TeamBar teams={session.teams} presence={session.presence} profile={profile} />
      {dialogRoom && (
        <TeamDialog roomId={dialogRoom} teams={session.teams} runs={session.runs} presence={session.presence} profile={profile} onRejoin={onRejoin} onClose={leave} />
      )}
      <ChatPanel chat={session.chat} />
      <ChatBubbles chat={session.chat} />
      <PeoplePanel presence={session.presence} self={profile} heading={(n) => t('people.title', { count: n })} aloneText={t('people.alone')} />
      <AvDock media={session.media} presence={session.presence} scope="proximity" />
    </>
  );
}

type RoomDialog = { kind: 'puzzle'; puzzleId: string } | { kind: 'clue'; clueId: string } | { kind: 'leave' } | { kind: 'intro' } | { kind: 'escaped' } | null;

interface RoomOverlaysProps {
  session: RoomSession;
  /** Where the run's summary is published (null offline). */
  lobby: LobbySession | null;
  profile: Profile;
  author?: { puzzleId?: string };
  onLeaveRoom: (finished: boolean) => void;
}

function RoomOverlays({ session, lobby, profile, author, onLeaveRoom }: RoomOverlaysProps) {
  const { t } = useTranslation();
  const { roomId } = session.info;
  const { run } = session;
  const state = useEmitterValue(run.events, 'state', () => run.state);
  const [dialog, setDialog] = useState<RoomDialog>(() => {
    if (author?.puzzleId) return { kind: 'puzzle', puzzleId: author.puzzleId };
    return author || Object.keys(run.state.solved).length > 0 ? null : { kind: 'intro' };
  });

  // Tell the lobby how the run is going (scoreboard, instructors), and stop when we leave.
  const roster = useEmitterValue(session.presence.events, 'roster', () => session.presence.list());
  useEffect(() => {
    if (!lobby) return;
    lobby.runs.publish(summarize(session, state, [profile.nickname, ...roster.map((p) => p.nickname)], profile.nickname));
  }, [lobby, session, state, roster, profile.nickname]);
  useEffect(() => () => lobby?.runs.withdraw(), [lobby]);

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

  const use = useCallback((target: Interactable) => {
    if (target.kind === 'door') setDialog({ kind: 'leave' });
    else if (target.kind === 'clue') setDialog({ kind: 'clue', clueId: target.clueId });
    else setDialog({ kind: 'puzzle', puzzleId: target.puzzleId });
  }, []);
  // Walking away closes a dialog opened from an object, but not the intro or escape screens.
  const leave = useCallback(() => setDialog((d) => (d?.kind === 'puzzle' || d?.kind === 'clue' || d?.kind === 'leave' ? null : d)), []);
  const close = useCallback(() => setDialog(null), []);
  const openDebrief = useCallback(() => setDialog({ kind: 'escaped' }), []);
  const pin = useCallback((text: string) => session.notebook.add(text), [session]);
  const puzzle = dialog?.kind === 'puzzle' ? getPuzzle(roomId, dialog.puzzleId) : undefined;

  return (
    <>
      <RoomHud roomId={roomId} run={run} onDebrief={openDebrief} />
      <InteractPrompt roomId={roomId} solved={state.solved} onUse={use} onLeave={leave} />
      {puzzle && <PuzzleDialog key={puzzle.id} roomId={roomId} puzzle={puzzle} run={run} author={!!author} onPin={pin} codeShare={session.codeShare} presence={session.presence} onClose={close} />}
      {dialog?.kind === 'clue' && <ClueDialog roomId={roomId} clueId={dialog.clueId} onPin={pin} onClose={close} />}
      {dialog?.kind === 'leave' && <LeaveRoomDialog finished={escaped} onLeave={() => onLeaveRoom(escaped)} onStay={close} />}
      {dialog?.kind === 'intro' && <IntroDialog roomId={roomId} onClose={close} />}
      {dialog?.kind === 'escaped' && <DebriefDialog roomId={roomId} state={state} onLobby={() => onLeaveRoom(true)} onClose={close} />}
      <ChatPanel chat={session.chat} />
      <ChatBubbles chat={session.chat} />
      <div className="side-column">
        <PeoplePanel presence={session.presence} self={profile} heading={(n) => t('room.team', { count: n })} aloneText={t('room.alone')} />
        <NotesPanel notebook={session.notebook} />
      </div>
      {!author && <AvDock media={session.media} presence={session.presence} scope="team" />}
    </>
  );
}

/** The lobby-facing summary of this team's run. */
function summarize(session: RoomSession, state: RunState, members: string[], self: string): RunSummary {
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
    epoch: 0,
    startedAt: state.startedAt,
    solved: state.solved,
    hints,
    attempts: {},
    escapedAt: state.solved[finalPuzzleId(roomId) ?? ''] ?? null,
    at: Date.now(),
  };
}
