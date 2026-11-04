import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

/** `finished`: the team escaped, so there's nothing to come back to. */
export function LeaveRoomDialog({ finished, onLeave, onStay }: { finished: boolean; onLeave: () => void; onStay: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal title={t('room.leaveTitle')} onClose={onStay}>
      <p>{t(finished ? 'room.leaveBodyFinished' : 'room.leaveBody')}</p>
      <div className="modal-actions">
        <button type="button" onClick={onStay}>
          {t('room.stay')}
        </button>
        <button type="button" className="primary" onClick={onLeave}>
          {t('room.leaveConfirm')}
        </button>
      </div>
    </Modal>
  );
}
