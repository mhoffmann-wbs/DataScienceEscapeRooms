import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { legacyLook } from '../game/avatars';
import { bus } from '../game/events';
import { LOBBY, MAPS } from '../game/maps';
import { parseMapObjects, tiledMapSchema } from '../game/tiled';
import type { Invite } from '../net/help';
import { emptyRun } from '../net/run';
import { INSTRUCTOR_CONFIG } from '../net/instructorConfig';
import { LobbySession } from '../net/session';
import { createTrysteroTransport } from '../net/trysteroTransport';
import type { StartedTeam } from '../net/teams';
import { loadProfile, saveProfile, type Profile } from '../player/profile';
import { clearRun, loadRun, saveRun, type SavedRun } from '../player/run';
import { ROOMS } from '../rooms';
import { Announcements } from './Announcements';
import { HelpDialog, helpSeen, markHelpSeen } from './HelpDialog';
import { InstructorPanel, InstructorUnlock } from './InstructorPanel';
import { JoinScreen } from './JoinScreen';
import { loadGroup } from './TeamDialog';
import { LanguageSwitch } from './LanguageSwitch';
import { useEmitterValue } from './useStore';
import { World, type Place } from './World';

const AUTHOR_PROFILE: Profile = { nickname: 'Author', look: legacyLook(0)! };
const LOBBY_AREAS = parseMapObjects(tiledMapSchema.parse(MAPS[LOBBY])).areas;

/**
 * Author shortcut: `#/room/<roomId>` or `#/room/<roomId>?puzzle=<id or 1-based index>` jumps straight
 * into an offline copy of the room, optionally with a puzzle open. Only in dev, or builds with VITE_AUTHOR=1.
 */
function authorPlace(): Place | null {
  if (!import.meta.env.DEV && import.meta.env.VITE_AUTHOR !== '1') return null;
  const m = /^#\/room\/([\w-]+)(?:\?puzzle=([\w-]+))?$/.exec(window.location.hash);
  const room = m && ROOMS[m[1]!];
  if (!m || !room) return null;
  const sel = m[2];
  const puzzleId = sel && /^\d+$/.test(sel) ? room.puzzles[Number(sel) - 1]?.id : sel;
  return { kind: 'room', run: { roomId: m[1]!, teamId: 'author', state: emptyRun(Date.now()) }, author: { puzzleId } };
}

export function App() {
  const { t } = useTranslation();
  const [initialAuthor] = useState(authorPlace);
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile() ?? (initialAuthor ? AUTHOR_PROFILE : null));
  const [place, setPlace] = useState<Place | null>(initialAuthor);
  const transport = useMemo(() => createTrysteroTransport(), []);
  // The lobby connection lives as long as the player is in the world, including while in a
  // room, so the scoreboard, instructors and rejoining see everyone. Author mode stays offline.
  const online = place !== null && !(place.kind === 'room' && place.author);
  const [lobby, setLobby] = useState<LobbySession | null>(null);
  useEffect(() => {
    if (!online || !profile) return;
    const s = new LobbySession(transport, profile, LOBBY_AREAS, INSTRUCTOR_CONFIG);
    // The session only exists once the effect runs (it opens network connections).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLobby(s);
    // Closing connections explicitly lets peers see us leave at once instead of
    // after WebRTC's ~10 s disconnect timeout.
    const onPageHide = () => s.leave();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      s.leave();
      setLobby(null);
    };
  }, [online, profile, transport]);

  // Instructor mode: the signing key, only in memory (a reload locks it again).
  const [instructorKey, setInstructorKey] = useState<CryptoKey | null>(null);
  const [instructorOpen, setInstructorOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = () => {
    markHelpSeen();
    setHelpOpen(true);
  };
  const group = place?.kind === 'room' ? (place.run.group ?? null) : loadGroup() || null;

  // Once unlocked, everyone sees 🎓 over our head (a signed claim, so students can't copy it).
  useEffect(() => {
    if (lobby && instructorKey) void lobby.instructor.showPresence(instructorKey);
  }, [lobby, instructorKey]);
  // Tell the scene who the instructors are, also whenever it (re)starts.
  useEffect(() => {
    if (!lobby) return;
    const send = () => {
      const ids = lobby.instructor.instructors();
      bus.emit('instructors:changed', { ids, self: ids.includes(lobby.selfId) });
    };
    send();
    const offs = [lobby.instructor.events.on('instructors', send), bus.on('scene:ready', send)];
    return () => offs.forEach((off) => off());
  }, [lobby]);

  const join = (p: Profile) => {
    saveProfile(p);
    setProfile(p);
    // First visit: show how to play right away.
    if (!helpSeen()) openHelp();
    // Resume a run that was interrupted by a refresh.
    const run = loadRun();
    setPlace(run ? { kind: 'room', run } : { kind: 'lobby' });
  };

  const enterRoom = ({ team, password }: StartedTeam, leader: string) => {
    if (!profile) return;
    const run: SavedRun = { roomId: team.roomId, teamId: team.id, password, leader, creator: team.leader === lobby?.selfId, group: team.group, state: emptyRun(team.startedAt) };
    saveRun(run);
    setPlace({ kind: 'room', run });
  };

  /** Back to the lobby. An unfinished run stays saved, so the player can rejoin it from the door. */
  const leaveRoom = (finished: boolean) => {
    // A visiting instructor's own saved run (if any) isn't the one they leave.
    if (finished && !(place?.kind === 'room' && place.observer)) clearRun();
    setPlace({ kind: 'lobby', from: place?.kind === 'room' ? place.run.roomId : undefined });
  };

  /** Solo practice: an offline copy of the room, saved like a team run. */
  const practise = (roomId: string) => {
    if (!profile) return;
    const run: SavedRun = { roomId, teamId: `solo-${Date.now().toString(36)}`, solo: true, leader: profile.nickname, creator: true, state: emptyRun(Date.now()) };
    saveRun(run);
    setPlace({ kind: 'room', run });
  };

  /** Instructor: into a team's room as a visitor, with the invite a member sent. */
  const visit = (invite: Invite) => {
    setInstructorOpen(false);
    const { roomId, teamId, password, leader, group } = invite;
    setPlace({ kind: 'room', run: { roomId, teamId, password: password ?? undefined, leader: leader ?? undefined, group, state: emptyRun() }, observer: true });
  };

  // Instructors: go to a player. On this map the scene jumps there; a player in the lobby means
  // leaving the room first; a player in a room means visiting their team (as from the panel).
  const pendingGoto = useRef<string | null>(null);
  useEffect(
    () =>
      bus.on('scene:ready', () => {
        if (pendingGoto.current) bus.emit('player:goto', { peerId: pendingGoto.current });
        pendingGoto.current = null;
      }),
    [],
  );
  const goTo = async (peerId: string): Promise<boolean> => {
    const target = lobby?.presence.get(peerId);
    if (!lobby || !instructorKey || !target || !place) return false;
    const here = place.kind === 'room' ? place.run.teamId : null;
    if (!target.away) {
      if (here === null) bus.emit('player:goto', { peerId });
      else {
        pendingGoto.current = peerId;
        leaveRoom(false);
      }
      return true;
    }
    const run = lobby.runs.list().find((r) => r.peers?.includes(peerId));
    if (!run) return false;
    if (run.teamId === here) {
      bus.emit('player:goto', { peerId });
      return true;
    }
    const invite = await lobby.help.visit(instructorKey, run.teamId);
    if (!invite || invite.roomId !== run.roomId) return false;
    pendingGoto.current = peerId;
    visit(invite);
    return true;
  };

  const rejoin = () => {
    const run = loadRun();
    if (run) setPlace({ kind: 'room', run });
  };

  return (
    <div className="app">
      {place && profile ? (
        // Until the lobby connection exists (one render), show nothing rather than the join screen.
        (lobby || !online) && <World profile={profile} place={place} lobby={lobby} transport={transport} onEnterRoom={enterRoom} onLeaveRoom={leaveRoom} onRejoin={rejoin} onPractise={practise} instructorKey={instructorKey} onGoTo={instructorKey ? goTo : null} />
      ) : (
        <JoinScreen initial={profile} onJoin={join} />
      )}
      {lobby && <Announcements instructor={lobby.instructor} group={group} teamId={place?.kind === 'room' ? place.run.teamId : null} />}
      {lobby && instructorOpen && INSTRUCTOR_CONFIG && !instructorKey && (
        <InstructorUnlock config={INSTRUCTOR_CONFIG} onUnlock={setInstructorKey} onClose={() => setInstructorOpen(false)} />
      )}
      {lobby && instructorOpen && instructorKey && <InstructorPanel lobby={lobby} signingKey={instructorKey} onVisit={visit} onClose={() => setInstructorOpen(false)} />}
      <header className="overlay top-bar">
        <h1>{t('app.title')}</h1>
        <div className="top-bar-actions">
          {lobby && INSTRUCTOR_CONFIG && <InstructorButton lobby={lobby} unlocked={!!instructorKey} onOpen={() => setInstructorOpen(true)} />}
          {place && (
            <button type="button" onClick={() => setPlace(null)}>
              {t('lobby.profile')}
            </button>
          )}
          <LanguageSwitch />
          <button type="button" className="help-button" onClick={openHelp} aria-label={t('help.open')} title={t('help.open')}>
            ?
          </button>
        </div>
      </header>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

/** Opens instructor mode; once unlocked it also counts the teams calling for help. */
function InstructorButton({ lobby, unlocked, onOpen }: { lobby: LobbySession; unlocked: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  const calls = useEmitterValue(lobby.help.events, 'calls', () => lobby.help.list());
  const waiting = unlocked ? calls.length : 0;
  return (
    <button type="button" className={waiting ? 'calling' : undefined} onClick={onOpen} aria-label={waiting ? t('instructor.titleCalls', { count: waiting }) : undefined}>
      {unlocked ? '🎓 ' : ''}
      {t('instructor.title')}
      {waiting > 0 && ` · 🙋 ${waiting}`}
    </button>
  );
}
