import { indentWithTab } from '@codemirror/commands';
import { indentUnit } from '@codemirror/language';
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
          // Tab indents (4 spaces, as in PEP 8). Keyboard users leave the editor with Esc, then Tab.
          keymap.of([indentWithTab]),
          indentUnit.of('    '),
          EditorState.tabSize.of(4),
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

/** Read-only, highlighted view of code that changes from outside (a teammate's live editor). */
export function CodeViewer({ code, language, label }: { code: string; language: 'python' | 'sql'; label: string }) {
  const parent = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(code);
  useEffect(() => {
    latest.current = code;
    const v = view.current;
    if (v && v.state.doc.toString() !== code) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: code } });
  }, [code]);

  useEffect(() => {
    const v = new EditorView({
      parent: parent.current!,
      state: EditorState.create({
        doc: latest.current,
        extensions: [basicSetup, languageSupport(language, undefined), oneDark, EditorState.readOnly.of(true), EditorView.editable.of(false), EditorView.contentAttributes.of({ 'aria-label': label })],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
  }, [language, label]);

  return <div className="code-editor code-viewer" ref={parent} />;
}
