import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bus } from '../game/events';
import { LOBBY } from '../game/maps';

interface Props {
  onInteract: (doorTo: string) => void;
  onLeaveDoor: () => void;
}

/** Shows the controls, or what the door under the player leads to. */
export function DoorPrompt({ onInteract, onLeaveDoor }: Props) {
  const { t } = useTranslation();
  const [doorTo, setDoorTo] = useState<string | null>(null);

  useEffect(() => {
    const offs = [
      bus.on('door:changed', ({ doorTo }) => {
        setDoorTo(doorTo);
        if (!doorTo) onLeaveDoor();
      }),
      bus.on('door:interact', ({ doorTo }) => onInteract(doorTo)),
    ];
    return () => offs.forEach((off) => off());
  }, [onInteract, onLeaveDoor]);

  if (!doorTo) return <div className="overlay status">{t('lobby.controls')}</div>;
  const isExit = doorTo === LOBBY;
  return (
    <div className="overlay status door-prompt" role="status">
      <strong>{isExit ? t('room.exit') : t(`rooms.${doorTo}`, { defaultValue: doorTo })}</strong>
      <span>{isExit ? t('room.exitPrompt') : t('lobby.doorPrompt')}</span>
    </div>
  );
}
