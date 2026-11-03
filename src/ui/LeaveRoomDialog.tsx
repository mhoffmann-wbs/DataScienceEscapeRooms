import { useTranslation } from 'react-i18next';
import { Modal } from './Modal';

export function LeaveRoomDialog({ onLeave, onStay }: { onLeave: () => void; onStay: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal title={t('room.leaveTitle')} onClose={onStay}>
      <p>{t('room.leaveBody')}</p>
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
