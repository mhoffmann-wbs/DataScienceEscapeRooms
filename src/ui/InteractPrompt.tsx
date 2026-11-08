import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bus, type Interactable } from '../game/events';
import { LOBBY } from '../game/maps';
import { getClue, getPuzzle, loc, ROOMS } from '../rooms';
import { getDoor } from '../rooms/doors';

interface Props {
  /** Room whose puzzles are on this map (undefined in the lobby). */
  roomId?: string;
  solved?: Record<string, number>;
  onUse: (target: Interactable) => void;
  /** Called on stepping onto an interactable, before any E press. */
  onEnter?: (target: Interactable) => void;
  onLeave: () => void;
}

/** Shows the controls, or what the door or object under the player is. */
export function InteractPrompt({ roomId, solved, onUse, onEnter, onLeave }: Props) {
  const { t, i18n } = useTranslation();
  const [target, setTarget] = useState<Interactable | null>(null);

  useEffect(() => {
    const offs = [
      bus.on('interact:changed', ({ target }) => {
        setTarget(target);
        if (target) onEnter?.(target);
        else onLeave();
      }),
      bus.on('interact:use', ({ target }) => onUse(target)),
    ];
    return () => offs.forEach((off) => off());
  }, [onUse, onEnter, onLeave]);

  if (!target) return <div className="overlay status">{t('lobby.controls')}</div>;

  let label: string;
  let hint: string;
  if (target.kind === 'door') {
    const isExit = target.doorTo === LOBBY;
    const door = getDoor(target.doorTo);
    label = isExit ? t('room.exit') : door ? `${door.icon} ${loc(door.title, i18n.language)}` : target.doorTo;
    hint = isExit ? t('room.exitPrompt') : t('lobby.doorPrompt');
  } else if (target.kind === 'clue') {
    const clue = roomId ? getClue(roomId, target.clueId) : undefined;
    label = clue ? loc(clue.title, i18n.language) : target.clueId;
    hint = t('interact.cluePrompt');
  } else if (target.kind === 'reference') {
    const reference = roomId ? ROOMS[roomId]?.reference : undefined;
    label = reference ? `📖 ${loc(reference.title, i18n.language)}` : '📖';
    hint = t('interact.referencePrompt');
  } else {
    const puzzle = roomId ? getPuzzle(roomId, target.puzzleId) : undefined;
    label = puzzle ? loc(puzzle.title, i18n.language) : target.puzzleId;
    hint = solved && target.puzzleId in solved ? `${t('interact.solvedTag')} · ${t('interact.puzzlePrompt')}` : t('interact.puzzlePrompt');
  }
  return (
    <div className="overlay status door-prompt" role="status">
      <strong>{label}</strong>
      <span>{hint}</span>
    </div>
  );
}
