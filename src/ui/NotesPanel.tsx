import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NOTE_MAX_LENGTH, type Notebook, type NoteView } from '../net/notebook';
import { useEmitterValue } from './useStore';

/** The team's shared notes: add, edit, cross off, reorder (drag or ↑/↓) and delete. */
export function NotesPanel({ notebook }: { notebook: Notebook }) {
  const { t } = useTranslation();
  const notes = useEmitterValue(notebook.events, 'notes', () => notebook.list());
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (notebook.add(draft)) setDraft('');
  };

  return (
    <section className="overlay notes-panel" aria-label={t('notes.title', { count: notes.length })}>
      <button type="button" className="people-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('notes.title', { count: notes.length })}
      </button>
      {open && (
        <>
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
                  <button type="button" className="note-text" title={t('notes.edit')} onClick={() => setEditing(note.id)}>
                    {note.text}
                  </button>
                )}
                <span className="note-actions">
                  <button type="button" aria-label={t('notes.moveUp')} disabled={i === 0} onClick={() => notebook.move(note.id, i - 1)}>
                    ↑
                  </button>
                  <button type="button" aria-label={t('notes.moveDown')} disabled={i === notes.length - 1} onClick={() => notebook.move(note.id, i + 1)}>
                    ↓
                  </button>
                  <button type="button" aria-label={t('notes.delete')} onClick={() => notebook.remove(note.id)}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <form onSubmit={add}>
            <input value={draft} maxLength={NOTE_MAX_LENGTH} placeholder={t('notes.add')} aria-label={t('notes.add')} onChange={(e) => setDraft(e.target.value)} />
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
