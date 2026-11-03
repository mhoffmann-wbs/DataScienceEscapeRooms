import { python } from '@codemirror/lang-python';
import { SQLite, sql } from '@codemirror/lang-sql';
import { Compartment, EditorState, Prec } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'react';

interface Props {
  initial: string;
  language: 'python' | 'sql';
  onChange: (code: string) => void;
  /** Ctrl/Cmd+Enter. */
  onRun: () => void;
  label: string;
  /** SQL only: tables and columns for autocompletion. */
  schema?: { name: string; columns: string[] }[];
}

function languageSupport(language: 'python' | 'sql', schema: Props['schema']) {
  if (language === 'python') return python();
  return sql({ dialect: SQLite, upperCaseKeywords: true, schema: Object.fromEntries((schema ?? []).map((t) => [t.name, t.columns])) });
}

/** Uncontrolled CodeMirror editor; `initial` is only read on mount. */
export function CodeEditor({ initial, language, onChange, onRun, label, schema }: Props) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const languageConf = useRef(new Compartment());
  const callbacks = useRef({ onChange, onRun });
  useEffect(() => {
    callbacks.current = { onChange, onRun };
  }, [onChange, onRun]);

  useEffect(() => {
    const v = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: initial,
        extensions: [
          basicSetup,
          languageConf.current.of(languageSupport(language, undefined)),
          oneDark,
          EditorView.contentAttributes.of({ 'aria-label': label }),
          Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (callbacks.current.onRun(), true) }])),
          EditorView.updateListener.of((u) => u.docChanged && callbacks.current.onChange(u.state.doc.toString())),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // Re-creating the editor would lose the cursor and undo history; `initial` is mount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, label]);

  // The schema arrives after mount; swap it in without re-creating the editor.
  useEffect(() => {
    view.current?.dispatch({ effects: languageConf.current.reconfigure(languageSupport(language, schema)) });
  }, [language, schema]);

  return <div className="code-editor" ref={parent} />;
}
