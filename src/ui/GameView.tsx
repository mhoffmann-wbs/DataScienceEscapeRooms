import { useEffect, useRef } from 'react';
import { createGame } from '../game/createGame';
import type { Profile } from '../player/profile';
import { DoorPrompt } from './DoorPrompt';

export function GameView({ profile }: { profile: Profile }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = createGame(containerRef.current!, profile);
    // Typing starts on the canvas, not on whatever button was last clicked.
    (document.activeElement as HTMLElement | null)?.blur();
    return () => game.destroy(true);
  }, [profile]);

  return (
    <>
      <div ref={containerRef} className="game" />
      <DoorPrompt />
    </>
  );
}
