import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LOBBY, MAPS } from '../game/maps';
import { parseMapObjects, tiledMapSchema } from '../game/tiled';
import { emptyRun } from '../net/run';
import { LobbySession } from '../net/session';
import { createTrysteroTransport } from '../net/trysteroTransport';
import type { StartedTeam } from '../net/teams';
import { loadProfile, saveProfile, type Profile } from '../player/profile';
import { clearRun, loadRun, saveRun, type SavedRun } from '../player/run';
import { ROOMS } from '../rooms';
import { JoinScreen } from './JoinScreen';
import { LanguageSwitch } from './LanguageSwitch';
import { World, type Place } from './World';

const AUTHOR_PROFILE: Profile = { nickname: 'Author', avatar: 0 };
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
    const s = new LobbySession(transport, profile, LOBBY_AREAS);
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

  const join = (p: Profile) => {
    saveProfile(p);
    setProfile(p);
    // Resume a run that was interrupted by a refresh.
    const run = loadRun();
    setPlace(run ? { kind: 'room', run } : { kind: 'lobby' });
  };

  const enterRoom = ({ team, password }: StartedTeam, leader: string) => {
    if (!profile) return;
    const run: SavedRun = { roomId: team.roomId, teamId: team.id, password, leader, group: team.group, state: emptyRun(team.startedAt) };
    saveRun(run);
    setPlace({ kind: 'room', run });
  };

  /** Back to the lobby. An unfinished run stays saved, so the player can rejoin it from the door. */
  const leaveRoom = (finished: boolean) => {
    if (finished) clearRun();
    setPlace({ kind: 'lobby' });
  };

  const rejoin = () => {
    const run = loadRun();
    if (run) setPlace({ kind: 'room', run });
  };

  return (
    <div className="app">
      {place && profile ? (
        // Until the lobby connection exists (one render), show nothing rather than the join screen.
        (lobby || !online) && <World profile={profile} place={place} lobby={lobby} transport={transport} onEnterRoom={enterRoom} onLeaveRoom={leaveRoom} onRejoin={rejoin} />
      ) : (
        <JoinScreen initial={profile} onJoin={join} />
      )}
      <header className="overlay top-bar">
        <h1>{t('app.title')}</h1>
        <div className="top-bar-actions">
          {place && (
            <button type="button" onClick={() => setPlace(null)}>
              {t('lobby.changeProfile')}
            </button>
          )}
          <LanguageSwitch />
        </div>
      </header>
    </div>
  );
}
