import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HelpDesk } from '../net/help';
import type { RunSync } from '../net/run';
import { finalPuzzleId, ROOMS, roomTitle } from '../rooms';
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

interface Props {
  roomId: string;
  run: RunSync;
  solo?: boolean;
  /** We're an instructor visiting this team. */
  observer?: boolean;
  /** Where to call the instructor; null without instructor mode, solo or as a visitor. */
  help?: HelpDesk | null;
  onDebrief: () => void;
}

/**
 * Room name, progress, the team's run timer (frozen once the team escapes, with a way back to
 * the debrief), and a button to call the instructor.
 */
export function RoomHud({ roomId, run, solo = false, observer = false, help = null, onDebrief }: Props) {
  const { t, i18n } = useTranslation();
  const state = useEmitterValue(run.events, 'state', () => run.state);
  const now = useNow(1000);
  const total = ROOMS[roomId]?.puzzles.length ?? 0;
  const solved = Object.keys(state.solved).length;
  const escapedAt = state.solved[finalPuzzleId(roomId) ?? ''];

  return (
    <section className="overlay room-hud" aria-label={roomTitle(roomId, i18n.language)}>
      <strong>{roomTitle(roomId, i18n.language)}</strong>
      {solo && <span className="team-group">{t('room.practice')}</span>}
      {observer && <span className="team-group">{t('room.visiting')}</span>}
      <span>{t('room.progress', { solved, total })}</span>
      {state.startedAt !== null && (
        <span className={escapedAt !== undefined ? 'room-timer escaped' : 'room-timer'} aria-label={t('room.timer')}>
          ⏱ {formatDuration((escapedAt ?? now) - state.startedAt)}
        </span>
      )}
      {escapedAt !== undefined && (
        <button type="button" className="hud-button" onClick={onDebrief}>
          {t('debrief.open')}
        </button>
      )}
      {help && <CallButton help={help} />}
    </section>
  );
}

function CallButton({ help }: { help: HelpDesk }) {
  const { t } = useTranslation();
  const calling = useEmitterValue(help.events, 'calling', () => help.calling());
  return calling ? (
    <button type="button" className="hud-button calling" onClick={() => help.cancel()} title={t('room.cancelCall')}>
      🙋 {t('room.called')}
    </button>
  ) : (
    <button type="button" className="hud-button" onClick={() => help.call()}>
      🙋 {t('room.callInstructor')}
    </button>
  );
}
