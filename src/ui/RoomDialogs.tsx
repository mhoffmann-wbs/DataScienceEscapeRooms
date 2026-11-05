import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RunState } from '../net/run';
import { finalPuzzleId, getClue, loadSolutions, loc, ROOMS } from '../rooms';
import type { ReferenceSolution } from '../rooms/solutions';
import { debriefRows } from '../rooms/debrief';
import { Modal } from './Modal';
import { PinButton, plainNote } from './NotesPanel';
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

/** A clue object up close: read-only text from the manifest. */
export function ClueDialog({ roomId, clueId, onPin, onClose }: { roomId: string; clueId: string; onPin: (text: string) => boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const clue = getClue(roomId, clueId);
  if (!clue) return null;
  return (
    <Modal title={loc(clue.title, i18n.language)} onClose={onClose}>
      <div className="clue-text">
        <RichText text={loc(clue.text, i18n.language)} />
      </div>
      <div className="modal-actions">
        <PinButton text={plainNote(loc(clue.title, i18n.language), loc(clue.text, i18n.language))} onPin={onPin} />
        <button type="button" onClick={onClose}>
          {t('puzzle.close')}
        </button>
      </div>
    </Modal>
  );
}

/** Shown when the final puzzle is solved: the team's result and, per puzzle, what it practised and a model solution. */
export function DebriefDialog({ roomId, state, onLobby, onClose }: { roomId: string; state: RunState; onLobby: () => void; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const manifest = ROOMS[roomId]!;
  const rows = debriefRows(manifest, state);
  const [solutions, setSolutions] = useState<Record<string, ReferenceSolution> | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadSolutions(roomId).then((s) => !cancelled && setSolutions(s));
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const escapedAt = state.solved[finalPuzzleId(roomId) ?? ''];
  const time = state.startedAt !== null && escapedAt !== undefined ? formatDuration(escapedAt - state.startedAt) : '–';
  return (
    <Modal title={t('room.escapedTitle')} onClose={onClose} wide>
      <p>{t('room.escapedBody', { time, count: Object.keys(state.hints).length })}</p>
      <ol className="debrief-list">
        {rows.map(({ puzzle, solvedAfter, hintsUsed, wrongAttempts }) => {
          const solution = solutions?.[puzzle.id];
          return (
            <li key={puzzle.id}>
              <div className="debrief-head">
                <strong>{loc(puzzle.title, lang)}</strong>
                <span className="muted">
                  {solvedAfter === null ? t('debrief.notSolved') : t('debrief.solvedAfter', { time: formatDuration(solvedAfter) })} ·{' '}
                  {t('debrief.hints', { count: hintsUsed, total: puzzle.hints.length })} · {t('debrief.wrong', { count: wrongAttempts })}
                </span>
              </div>
              <div className="debrief-practised">
                <span className="muted">{t('debrief.practised')}</span> <RichText text={loc(puzzle.practises, lang)} />
              </div>
              {solution !== undefined && (
                <details>
                  <summary>{t('debrief.solution')}</summary>
                  {typeof solution !== 'string' ? (
                    <>
                      <pre className="output">{solution.code.trimEnd()}</pre>
                      <p>
                        <code>{solution.answer}</code>
                      </p>
                    </>
                  ) : puzzle.check.type === 'answer' ? (
                    <p>
                      <code>{solution}</code>
                    </p>
                  ) : (
                    <pre className="output">{solution.trimEnd()}</pre>
                  )}
                </details>
              )}
            </li>
          );
        })}
      </ol>
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
