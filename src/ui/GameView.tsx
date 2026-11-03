import { useEffect, useRef, useState } from 'react';
import { createGame } from '../game/createGame';
import { Session } from '../net/session';
import { createTrysteroTransport } from '../net/trysteroTransport';
import type { Profile } from '../player/profile';
import { ChatPanel } from './ChatPanel';
import { DoorPrompt } from './DoorPrompt';
import { PeoplePanel } from './PeoplePanel';

export function GameView({ profile }: { profile: Profile }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const s = new Session(createTrysteroTransport(profile.classCode), 'lobby', profile);
    const game = createGame(containerRef.current!, profile, s);
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
      game.destroy(true);
      s.leave();
      setSession(null);
    };
  }, [profile]);

  return (
    <>
      <div ref={containerRef} className="game" />
      <DoorPrompt />
      {session && (
        <>
          <ChatPanel chat={session.chat} />
          <PeoplePanel presence={session.presence} self={profile} />
        </>
      )}
    </>
  );
}
