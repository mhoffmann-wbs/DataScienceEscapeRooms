import { useTranslation } from 'react-i18next';
import { INSTRUCTOR_CONFIG } from '../net/instructorConfig';
import { Modal } from './Modal';
import { RichText } from './RichText';

/** Help sections in reading order; their text is `help.<id>.title` and `help.<id>.body`. */
const SECTIONS = ['goal', 'controls', 'lobby', 'teams', 'room', 'puzzles', 'together', 'instructor', 'after'] as const;

/** Set once the help has been shown, so it opens by itself only on a player's first visit. */
const SEEN_KEY = 'dser.helpSeen';

export function helpSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // without storage, don't pop it up on every visit
  }
}

export function markHelpSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore
  }
}

/** Everything a new player needs to know, in one place (the ? in the top bar). */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  // Calling the instructor only exists when instructor mode is set up.
  const sections = SECTIONS.filter((id) => id !== 'instructor' || INSTRUCTOR_CONFIG);
  return (
    <Modal title={t('help.title')} onClose={onClose} wide>
      <div className="help">
        {sections.map((id) => (
          <section key={id}>
            <h3>{t(`help.${id}.title`)}</h3>
            <RichText text={t(`help.${id}.body`)} />
          </section>
        ))}
      </div>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {t('team.close')}
        </button>
      </div>
    </Modal>
  );
}
