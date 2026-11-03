import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emptyRun } from '../net/run';
import type { Team } from '../net/teams';
import { loadProfile, saveProfile, type Profile } from '../player/profile';
import { clearRun, loadRun, saveRun, type SavedRun } from '../player/run';
import { JoinScreen } from './JoinScreen';
import { LanguageSwitch } from './LanguageSwitch';
import { World, type Place } from './World';

export function App() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [place, setPlace] = useState<Place | null>(null);

  const join = (p: Profile) => {
    saveProfile(p);
    setProfile(p);
    // Resume a run that was interrupted by a refresh, if it belongs to this class.
    const run = loadRun();
    setPlace(run?.classCode === p.classCode ? { kind: 'room', run } : { kind: 'lobby' });
  };

  const enterRoom = (team: Team) => {
    if (!profile) return;
    const run: SavedRun = { classCode: profile.classCode, roomId: team.roomId, teamId: team.id, state: emptyRun(team.startedAt) };
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
