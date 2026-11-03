import { useTranslation } from 'react-i18next';
import type { RunState } from '../net/run';
import { finalPuzzleId, loc, ROOMS } from '../rooms';
import { Modal } from './Modal';
import { RichText } from './RichText';
import { formatDuration } from './RoomHud';

export function IntroDialog({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const room = ROOMS[roomId]!;
  return (
    <Modal title={loc(room.title, i18n.language)} onClose={onClose}>
      <RichText text={loc(room.intro, i18n.language)} />
      <div className="modal-actions">
        <button type="button" className="primary" onClick={onClose}>
          {t('room.introStart')}
        </button>
      </div>
    </Modal>
  );
}

/** Shown when the final puzzle is solved. The full debrief comes with plan step 6. */
export function EscapeDialog({ roomId, state, onLobby, onClose }: { roomId: string; state: RunState; onLobby: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const escapedAt = state.solved[finalPuzzleId(roomId) ?? ''];
  const time = state.startedAt !== null && escapedAt !== undefined ? formatDuration(escapedAt - state.startedAt) : '–';
  return (
    <Modal title={t('room.escapedTitle')} onClose={onClose}>
      <p>{t('room.escapedBody', { time, count: Object.keys(state.hints).length })}</p>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {t('room.keepLooking')}
        </button>
        <button type="button" className="primary" onClick={onLobby}>
          {t('room.backToLobby')}
        </button>
      </div>
    </Modal>
  );
}
