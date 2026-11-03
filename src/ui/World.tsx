import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createGame } from '../game/createGame';
import { LOBBY } from '../game/maps';
import { LobbySession, RoomSession } from '../net/session';
import type { Team } from '../net/teams';
import { createTrysteroTransport } from '../net/trysteroTransport';
import type { Profile } from '../player/profile';
import { saveRun, type SavedRun } from '../player/run';
import { ChatPanel } from './ChatPanel';
import { DoorPrompt } from './DoorPrompt';
import { LeaveRoomDialog } from './LeaveRoomDialog';
import { PeoplePanel } from './PeoplePanel';
import { RoomHud } from './RoomHud';
import { TeamBar } from './TeamBar';
import { TeamDialog } from './TeamDialog';

export type Place = { kind: 'lobby' } | { kind: 'room'; run: SavedRun };

interface Props {
  profile: Profile;
  place: Place;
  onEnterRoom: (team: Team) => void;
  onLeaveRoom: () => void;
}

/** One place in the world: owns its network session and Phaser game for as long as it is shown. */
export function World({ profile, place, onEnterRoom, onLeaveRoom }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transport = useMemo(() => createTrysteroTransport(profile.classCode), [profile.classCode]);
  const [session, setSession] = useState<LobbySession | RoomSession | null>(null);

  useEffect(() => {
    const s = place.kind === 'lobby' ? new LobbySession(transport, profile) : new RoomSession(transport, profile, place.run);
    const offs: (() => void)[] = [];
    if (s instanceof RoomSession && place.kind === 'room') {
      offs.push(s.run.events.on('state', (state) => saveRun({ ...place.run, state })));
    }
    const game = createGame(containerRef.current!, { profile, presence: s.presence, mapKey: place.kind === 'lobby' ? LOBBY : place.run.roomId });
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
      {session instanceof RoomSession && <RoomOverlays session={session} profile={profile} onLeaveRoom={onLeaveRoom} />}
    </>
  );
}

function LobbyOverlays({ session, profile, onEnterRoom }: { session: LobbySession; profile: Profile; onEnterRoom: (team: Team) => void }) {
  const { t } = useTranslation();
  const [dialogRoom, setDialogRoom] = useState<string | null>(null);
  useEffect(() => session.teams.events.on('started', onEnterRoom), [session, onEnterRoom]);

  return (
    <>
      <DoorPrompt onInteract={setDialogRoom} onLeaveDoor={() => setDialogRoom(null)} />
      <TeamBar teams={session.teams} presence={session.presence} profile={profile} />
      {dialogRoom && <TeamDialog roomId={dialogRoom} teams={session.teams} presence={session.presence} profile={profile} onClose={() => setDialogRoom(null)} />}
      <ChatPanel chat={session.chat} />
      <PeoplePanel presence={session.presence} self={profile} heading={(n) => `${t('people.title', { count: n })} · ${profile.classCode}`} />
    </>
  );
}

function RoomOverlays({ session, profile, onLeaveRoom }: { session: RoomSession; profile: Profile; onLeaveRoom: () => void }) {
  const { t } = useTranslation();
  const [confirmLeave, setConfirmLeave] = useState(false);

  return (
    <>
      <RoomHud roomId={session.info.roomId} run={session.run} />
      <DoorPrompt onInteract={() => setConfirmLeave(true)} onLeaveDoor={() => setConfirmLeave(false)} />
      {confirmLeave && <LeaveRoomDialog onLeave={onLeaveRoom} onStay={() => setConfirmLeave(false)} />}
      <ChatPanel chat={session.chat} />
      <PeoplePanel presence={session.presence} self={profile} heading={(n) => t('room.team', { count: n })} />
    </>
  );
}
