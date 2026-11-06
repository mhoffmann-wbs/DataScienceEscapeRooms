import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

interface Props {
  /** The team escaped, so there's nothing to come back to. */
  finished: boolean;
  /** The team's creator may also end the run for everyone instead of leaving it open. */
  onEnd?: () => void;
  solo?: boolean;
  onLeave: () => void;
  onStay: () => void;
}

export function LeaveRoomDialog({ finished, onEnd, solo, onLeave, onStay }: Props) {
  const { t } = useTranslation();
  const canEnd = !finished && !!onEnd;
  return (
    <Modal title={t('room.leaveTitle')} onClose={onStay}>
      <p>{t(finished ? 'room.leaveBodyFinished' : 'room.leaveBody')}</p>
      {canEnd && <p className="muted">{t(solo ? 'room.endBodySolo' : 'room.endBody')}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onStay}>
          {t('room.stay')}
        </button>
        {canEnd && (
          <button type="button" className="danger" onClick={onEnd}>
            {t('room.endConfirm')}
          </button>
        )}
        <button type="button" className="primary" onClick={onLeave}>
          {t('room.leaveConfirm')}
        </button>
      </div>
    </Modal>
  );
}

/** Shown to the rest of the team when the creator ended the run. */
export function RunEndedDialog({ onLobby }: { onLobby: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal title={t('room.endedTitle')} onClose={onLobby}>
      <p>{t('room.endedBody')}</p>
      <div className="modal-actions">
        <button type="button" className="primary" onClick={onLobby}>
          {t('room.endedLobby')}
        </button>
      </div>
    </Modal>
  );
}
