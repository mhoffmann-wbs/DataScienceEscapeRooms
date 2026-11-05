import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NOTE_MAX_LENGTH, type Notebook, type NoteView } from '../net/notebook';
import { useEmitterValue } from './useStore';

const COLLAPSED_KEY = 'dser.notes.collapsed';
// Notes shown as one line. A view setting per player, not shared with the team.
const FOLDED_KEY = 'dser.notes.folded';

function loadOpen(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) !== '1';
  } catch {
    return true;
  }
}

function loadFolded(): Set<string> {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]');
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

/** The team's shared notes: add, edit, cross off, reorder (drag or ↑/↓) and delete. */
export function NotesPanel({ notebook }: { notebook: Notebook }) {
  const { t } = useTranslation();
  const notes = useEmitterValue(notebook.events, 'notes', () => notebook.list());
  const trash = useEmitterValue(notebook.events, 'notes', () => notebook.trash());
  const [showTrash, setShowTrash] = useState(false);
  // The note whose delete (or, in the trash, delete for good) waits for a yes.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [open, setOpenState] = useState(loadOpen);
  const setOpen = (value: boolean) => {
    setOpenState(value);
    try {
      localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1');
    } catch {
      // a convenience only
    }
  };
  const [folded, setFolded] = useState(loadFolded);
  const saveFolded = (next: Set<string>) => {
    setFolded(next);
    try {
      localStorage.setItem(FOLDED_KEY, JSON.stringify([...next]));
    } catch {
      // a convenience only
    }
  };
  const toggleFold = (id: string) => {
    const next = new Set([...folded].filter((f) => notes.some((n) => n.id === f)));
    if (folded.has(id)) next.delete(id);
    else next.add(id);
    saveFolded(next);
  };
  const allFolded = notes.length > 0 && notes.every((n) => folded.has(n.id));
  const confirmButtons = (question: string, onYes: () => void) => (
    <span className="note-confirm" role="group" aria-label={question}>
      {question}
      <button type="button" onClick={() => {
          onYes();
          setConfirming(null);
        }}>
        {t('notes.yes')}
      </button>
      <button type="button" onClick={() => setConfirming(null)}>
        {t('notes.no')}
      </button>
    </span>
  );
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const addInput = useRef<HTMLInputElement>(null);

  // Enter adds the note (if any) and returns to walking, like the chat.
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (notebook.add(draft)) setDraft('');
    addInput.current?.blur();
  };
  const cancel = () => {
    setDraft('');
    addInput.current?.blur();
  };

  return (
    <section className="overlay notes-panel" aria-label={t('notes.title', { count: notes.length })}>
      <button type="button" className="people-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('notes.title', { count: notes.length })}
      </button>
      {open && (
        <>
          {(notes.length > 0 || trash.length > 0 || showTrash) && (
            <div className="notes-tools">
              {notes.length > 0 && (
                <button type="button" onClick={() => saveFolded(allFolded ? new Set() : new Set(notes.map((n) => n.id)))}>
                  {allFolded ? `▾ ${t('notes.unfoldAll')}` : `▸ ${t('notes.foldAll')}`}
                </button>
              )}
              {(trash.length > 0 || showTrash) && (
                <button type="button" aria-expanded={showTrash} onClick={() => setShowTrash(!showTrash)}>
                  {t('notes.trash', { count: trash.length })}
                </button>
              )}
            </div>
          )}
          {notes.length === 0 && <p className="muted notes-empty">{t('notes.empty')}</p>}
          <ol className="notes-list">
            {notes.map((note, i) => (
              <li
                key={note.id}
                className={[note.crossed && 'crossed', dragging === note.id && 'dragging'].filter(Boolean).join(' ') || undefined}
                draggable={editing !== note.id}
                onDragStart={(e) => {
                  setDragging(note.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(e) => dragging && e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragging && dragging !== note.id) notebook.move(dragging, i);
                  setDragging(null);
                }}
              >
                <input type="checkbox" checked={note.crossed} onChange={(e) => notebook.setCrossed(note.id, e.target.checked)} aria-label={t('notes.crossOff')} />
                {editing === note.id ? (
                  <EditNote note={note} onDone={(text) => {
                      if (text !== null) notebook.edit(note.id, text);
                      setEditing(null);
                    }} />
                ) : (
                  <button type="button" className={folded.has(note.id) ? 'note-text folded' : 'note-text'} title={t('notes.edit')} onClick={() => setEditing(note.id)}>
                    {note.text}
                  </button>
                )}
                {confirming === note.id ? (
                  confirmButtons(t('notes.confirmDelete'), () => notebook.remove(note.id))
                ) : (
                  <span className="note-actions">
                    <button type="button" aria-label={t(folded.has(note.id) ? 'notes.unfold' : 'notes.fold')} title={t(folded.has(note.id) ? 'notes.unfold' : 'notes.fold')} aria-expanded={!folded.has(note.id)} onClick={() => toggleFold(note.id)}>
                      {folded.has(note.id) ? '▸' : '▾'}
                    </button>
                    <button type="button" aria-label={t('notes.moveUp')} disabled={i === 0} onClick={() => notebook.move(note.id, i - 1)}>
                      ↑
                    </button>
                    <button type="button" aria-label={t('notes.moveDown')} disabled={i === notes.length - 1} onClick={() => notebook.move(note.id, i + 1)}>
                      ↓
                    </button>
                    <button type="button" aria-label={t('notes.delete')} title={t('notes.delete')} onClick={() => setConfirming(note.id)}>
                      ✕
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ol>
          {showTrash && (
            <section className="notes-trash" aria-label={t('notes.trashTitle')}>
              <h3>{t('notes.trashTitle')}</h3>
              {trash.length === 0 && <p className="muted notes-empty">{t('notes.trashEmpty')}</p>}
              <ol className="notes-list">
                {trash.map((note) => (
                  <li key={note.id}>
                    <span className="note-text folded" title={note.text}>
                      {note.text}
                    </span>
                    {confirming === note.id ? (
                      confirmButtons(t('notes.confirmPurge'), () => notebook.purge(note.id))
                    ) : (
                      <span className="note-actions">
                        <button type="button" aria-label={t('notes.restore')} title={t('notes.restore')} onClick={() => notebook.restore(note.id)}>
                          ↺
                        </button>
                        <button type="button" aria-label={t('notes.purge')} title={t('notes.purge')} onClick={() => setConfirming(note.id)}>
                          ✕
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          )}
          <form className="notes-add" onSubmit={add}>
            <input
              ref={addInput}
              value={draft}
              maxLength={NOTE_MAX_LENGTH}
              placeholder={t('notes.add')}
              aria-label={t('notes.add')}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={() => setAdding(true)}
              onBlur={() => setAdding(false)}
              onKeyDown={(e) => e.key === 'Escape' && cancel()}
            />
            {(adding || draft) && (
              <>
                {/* preventDefault on mousedown keeps the input focused until the click lands. */}
                <button type="submit" aria-label={t('notes.save')} title={t('notes.save')} onMouseDown={(e) => e.preventDefault()}>
                  ✓
                </button>
                <button type="button" aria-label={t('notes.cancel')} title={t('notes.cancel')} onMouseDown={(e) => e.preventDefault()} onClick={cancel}>
                  ✕
                </button>
              </>
            )}
          </form>
        </>
      )}
    </section>
  );
}

/** Inline editor: Enter or leaving the field saves, Esc cancels (null). */
function EditNote({ note, onDone }: { note: NoteView; onDone: (text: string | null) => void }) {
  const [text, setText] = useState(note.text);
  return (
    <input
      className="note-edit"
      autoFocus
      value={text}
      maxLength={NOTE_MAX_LENGTH}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onDone(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(text);
        if (e.key === 'Escape') onDone(null);
      }}
    />
  );
}

/** Turns manifest text (paragraphs, `code`, **bold**) into one plain line for a note. */
export function plainNote(title: string, text: string): string {
  const body = text
    .replace(/\*\*|`/g, '')
    .split(/\n\s*\n|\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' · ');
  return `${title}: ${body}`.slice(0, NOTE_MAX_LENGTH);
}

/** "📌 Pin to notes" for clue cards and reveals; shows a short confirmation. */
export function PinButton({ text, onPin }: { text: string; onPin: (text: string) => boolean }) {
  const { t } = useTranslation();
  const [pinned, setPinned] = useState(false);
  return (
    <button type="button" className="pin-button" disabled={pinned} onClick={() => setPinned(onPin(text))}>
      {pinned ? t('notes.pinned') : t('notes.pin')}
    </button>
  );
}
