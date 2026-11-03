import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createGame } from '../game/createGame';
import { bus } from '../game/events';
import { LanguageSwitch } from './LanguageSwitch';

export function App() {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<string | null>(null);

  useEffect(() => {
    const off = bus.on('scene:ready', ({ scene }) => setScene(scene));
    const game = createGame(containerRef.current!);
    return () => {
      off();
      game.destroy(true);
    };
  }, []);

  return (
    <div className="app">
      <div ref={containerRef} className="game" />
      <header className="overlay top-bar">
        <h1>{t('app.title')}</h1>
        <LanguageSwitch />
      </header>
      <div className="overlay status">{scene === 'Lobby' ? t('lobby.welcome') : t('app.loading')}</div>
    </div>
  );
}
