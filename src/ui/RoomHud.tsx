import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RunSync } from '../net/run';
import { useEmitterValue } from './useStore';

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Room name and the team's run timer. */
export function RoomHud({ roomId, run }: { roomId: string; run: RunSync }) {
  const { t } = useTranslation();
  const state = useEmitterValue(run.events, 'state', () => run.state);
  const now = useNow(1000);

  return (
    <section className="overlay room-hud" aria-label={t(`rooms.${roomId}`)}>
      <strong>{t(`rooms.${roomId}`, { defaultValue: roomId })}</strong>
      {state.startedAt !== null && (
        <span className="room-timer" aria-label={t('room.timer')}>
          ⏱ {formatDuration(now - state.startedAt)}
        </span>
      )}
    </section>
  );
}
