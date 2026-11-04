import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createGame } from '../game/createGame';
import { bus, type Interactable } from '../game/events';
import { LOBBY, MAPS } from '../game/maps';
import { parseMapObjects, tiledMapSchema } from '../game/tiled';
import { createMemoryTransport, MemoryHub } from '../net/memoryTransport';
import { LobbySession, RoomSession } from '../net/session';
import type { Team } from '../net/teams';
import { createTrysteroTransport } from '../net/trysteroTransport';
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
  onEnterRoom: (team: Team) => void;
  onLeaveRoom: () => void;
}

/** One place in the world: owns its network session and Phaser game for as long as it is shown. */
export function World({ profile, place, onEnterRoom, onLeaveRoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const offline = place.kind === 'room' && !!place.author;
  const transport = useMemo(
    () => (offline ? createMemoryTransport(new MemoryHub(), 'author') : createTrysteroTransport(profile.classCode)),
    [offline, profile.classCode],
  );
  const [session, setSession] = useState<LobbySession | RoomSession | null>(null);

  useEffect(() => {
    const mapKey = place.kind === 'lobby' ? LOBBY : place.run.roomId;
    const { areas } = parseMapObjects(tiledMapSchema.parse(MAPS[mapKey]));
    const s = place.kind === 'lobby' ? new LobbySession(transport, profile, areas) : new RoomSession(transport, profile, place.run, areas);
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
    // Closing connections explicitly lets peers see us leave at once instead of
    // after WebRTC's ~10 s disconnect timeout.
    const onPageHide = () => s.leave();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      offs.forEach((off) => off());
      game.destroy(true);
      s.leave();
      setSession(null);
    };
  }, [transport, profile, place]);

  return (
    <>
      <div ref={containerRef} className="game" />
      {session instanceof LobbySession && <LobbyOverlays session={session} profile={profile} onEnterRoom={onEnterRoom} />}
      {session instanceof RoomSession && place.kind === 'room' && (
        <RoomOverlays session={session} profile={profile} author={place.author} onLeaveRoom={onLeaveRoom} />
      )}
    </>
  );
}

function LobbyOverlays({ session, profile, onEnterRoom }: { session: LobbySession; profile: Profile; onEnterRoom: (team: Team) => void }) {
  const { t } = useTranslation();
  const [dialogRoom, setDialogRoom] = useState<string | null>(null);
  useEffect(() => session.teams.events.on('started', onEnterRoom), [session, onEnterRoom]);
  const use = useCallback((target: Interactable) => target.kind === 'door' && setDialogRoom(target.doorTo), []);
  const leave = useCallback(() => setDialogRoom(null), []);

  return (
    <>
      <InteractPrompt onUse={use} onLeave={leave} />
      <TeamBar teams={session.teams} presence={session.presence} profile={profile} />
      {dialogRoom && <TeamDialog roomId={dialogRoom} teams={session.teams} presence={session.presence} profile={profile} onClose={leave} />}
      <ChatPanel chat={session.chat} />
      <ChatBubbles chat={session.chat} />
      <PeoplePanel presence={session.presence} self={profile} heading={(n) => `${t('people.title', { count: n })} · ${profile.classCode}`} aloneText={t('people.alone')} />
      <AvDock media={session.media} presence={session.presence} scope="proximity" />
    </>
  );
}

type RoomDialog = { kind: 'puzzle'; puzzleId: string } | { kind: 'clue'; clueId: string } | { kind: 'leave' } | { kind: 'intro' } | { kind: 'escaped' } | null;

interface RoomOverlaysProps {
  session: RoomSession;
  profile: Profile;
  author?: { puzzleId?: string };
  onLeaveRoom: () => void;
}

function RoomOverlays({ session, profile, author, onLeaveRoom }: RoomOverlaysProps) {
  const { t } = useTranslation();
  const { roomId } = session.info;
  const { run } = session;
  const state = useEmitterValue(run.events, 'state', () => run.state);
  const [dialog, setDialog] = useState<RoomDialog>(() => {
    if (author?.puzzleId) return { kind: 'puzzle', puzzleId: author.puzzleId };
    return author || Object.keys(run.state.solved).length > 0 ? null : { kind: 'intro' };
  });

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
      {dialog?.kind === 'leave' && <LeaveRoomDialog onLeave={onLeaveRoom} onStay={close} />}
      {dialog?.kind === 'intro' && <IntroDialog roomId={roomId} onClose={close} />}
      {dialog?.kind === 'escaped' && <DebriefDialog roomId={roomId} state={state} onLobby={onLeaveRoom} onClose={close} />}
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
