import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emptyRun } from '../net/run';
import type { StartedTeam } from '../net/teams';
import { loadProfile, saveProfile, type Profile } from '../player/profile';
import { clearRun, loadRun, saveRun, type SavedRun } from '../player/run';
import { ROOMS } from '../rooms';
import { JoinScreen } from './JoinScreen';
import { LanguageSwitch } from './LanguageSwitch';
import { World, type Place } from './World';

const AUTHOR_PROFILE: Profile = { nickname: 'Author', avatar: 0 };

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

  const join = (p: Profile) => {
    saveProfile(p);
    setProfile(p);
    // Resume a run that was interrupted by a refresh.
    const run = loadRun();
    setPlace(run ? { kind: 'room', run } : { kind: 'lobby' });
  };

  const enterRoom = ({ team, password }: StartedTeam) => {
    if (!profile) return;
    const run: SavedRun = { roomId: team.roomId, teamId: team.id, password, state: emptyRun(team.startedAt) };
    saveRun(run);
    setPlace({ kind: 'room', run });
  };

  const leaveRoom = () => {
    clearRun();
    setPlace({ kind: 'lobby' });
  };

  return (
    <div className="app">
      {place && profile ? (
        <World profile={profile} place={place} onEnterRoom={enterRoom} onLeaveRoom={leaveRoom} />
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
