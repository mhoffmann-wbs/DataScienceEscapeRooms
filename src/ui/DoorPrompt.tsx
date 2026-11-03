import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bus } from '../game/events';

export function DoorPrompt() {
  const { t } = useTranslation();
  const [roomId, setRoomId] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    const offChanged = bus.on('door:changed', ({ roomId }) => {
      setRoomId(roomId);
      setNotice(false);
    });
    // Team formation arrives in plan step 4; until then entering just shows a notice.
    const offInteract = bus.on('door:interact', () => setNotice(true));
    return () => {
      offChanged();
      offInteract();
    };
  }, []);

  if (!roomId) return <div className="overlay status">{t('lobby.controls')}</div>;
  const room = t(`rooms.${roomId}`, { defaultValue: roomId });
  return (
    <div className="overlay status door-prompt" role="status">
      <strong>{room}</strong>
      <span>{notice ? t('lobby.roomsComingSoon') : t('lobby.doorPrompt')}</span>
    </div>
  );
}
