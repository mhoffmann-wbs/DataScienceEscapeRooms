import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { loadProfile, saveProfile, type Profile } from '../player/profile';
import { GameView } from './GameView';
import { JoinScreen } from './JoinScreen';
import { LanguageSwitch } from './LanguageSwitch';

export function App() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile | null>(loadProfile);
  const [joined, setJoined] = useState(false);

  const join = (p: Profile) => {
    saveProfile(p);
    setProfile(p);
    setJoined(true);
  };

  return (
    <div className="app">
      {joined && profile ? <GameView profile={profile} /> : <JoinScreen initial={profile} onJoin={join} />}
      <header className="overlay top-bar">
        <h1>{t('app.title')}</h1>
        <div className="top-bar-actions">
          {joined && (
            <button type="button" onClick={() => setJoined(false)}>
              {t('lobby.changeProfile')}
            </button>
          )}
          <LanguageSwitch />
        </div>
      </header>
    </div>
  );
}
