import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { hintKey, type RunSync } from '../net/run';
import { canonicalRows, hashAnswer, normalizeAnswer } from '../rooms/answers';
import { getPuzzle, isUnlocked, loadDataFile, loc, ROOMS } from '../rooms';
import type { Puzzle } from '../rooms/manifest';
import { RUN_TIMEOUT_MS, RunTimeout, runners } from '../runners';
import type { SqlTable } from '../runners/protocol';
import type { CodeShare } from '../net/codeShare';
import type { Presence } from '../net/presence';
import { CodeEditor, CodeViewer } from './CodeEditor';
import { Modal } from './Modal';
import { PinButton, plainNote } from './NotesPanel';
import { RichText } from './RichText';
import { useEmitterValue } from './useStore';

type Output = { kind: 'text'; text: string; error?: string } | { kind: 'table'; table: SqlTable | null; error?: string } | { kind: 'error'; error: string };

const MAX_ROWS = 200;
const draftKey = (roomId: string, puzzleId: string) => `dser.draft.${roomId}.${puzzleId}`;

function loadDraft(roomId: string, puzzle: Puzzle, lang: string): string {
  const starter = typeof puzzle.starter === 'string' ? puzzle.starter : loc(puzzle.starter, lang);
  try {
    return localStorage.getItem(draftKey(roomId, puzzle.id)) ?? starter;
  } catch {
    return starter;
  }
}

interface Props {
  roomId: string;
  puzzle: Puzzle;
  run: RunSync;
  /** Author mode ignores locks. */
  author: boolean;
  /** Adds a note to the team notebook (for pinning the reveal). */
  onPin: (text: string) => boolean;
  /** Live view of teammates' editors on the same puzzle. */
  codeShare: CodeShare;
  presence: Presence;
  onClose: () => void;
}

export function PuzzleDialog({ roomId, puzzle, run, author, onPin, codeShare, presence, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { salt } = ROOMS[roomId]!;
  const state = useEmitterValue(run.events, 'state', () => run.state);
  const solved = puzzle.id in state.solved;
  const locked = !author && !isUnlocked(puzzle, state.solved);
  const workspace = puzzle.workspace === 'none' ? null : puzzle.workspace;

  const [code, setCode] = useState(() => loadDraft(roomId, puzzle, lang));
  const [setup, setSetup] = useState<string | null>(puzzle.data ? null : '');
  const [schema, setSchema] = useState<{ name: string; columns: string[] }[]>([]);
  const [runtimeReady, setRuntimeReady] = useState(workspace === null);
  const [output, setOutput] = useState<Output | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [watching, setWatching] = useState<string | null>(null);

  // Share our editor with the team while this puzzle is open.
  const sharedCode = useRef(code);
  const sharing = !!workspace && !locked;
  useEffect(() => {
    if (!sharing) return;
    codeShare.open(puzzle.id, sharedCode.current);
    return () => codeShare.close();
  }, [codeShare, puzzle.id, sharing]);
  // Re-render when teammates' code changes.
  useEmitterValue(codeShare.events, 'change', () => codeShare.snapshot());
  const teammates = codeShare.working(puzzle.id);
  const watched = teammates.find((m) => m.peerId === watching);
  const nameOf = (peerId: string) => presence.get(peerId)?.nickname ?? '?';

  useEffect(() => {
    if (!workspace) return;
    let cancelled = false;
    runners
      .warmUp(workspace)
      .then(() => !cancelled && setRuntimeReady(true))
      .catch((e: unknown) => !cancelled && setOutput({ kind: 'error', error: String(e) }));
    if (puzzle.data)
      void loadDataFile(roomId, puzzle.data).then(async (data) => {
        if (cancelled) return;
        setSetup(data);
        if (workspace === 'sql') {
          const tables = await runners.sqlSchema(data).catch(() => []);
          if (!cancelled) setSchema(tables);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, puzzle.data, workspace]);

  const changeCode = useCallback(
    (value: string) => {
      setCode(value);
      sharedCode.current = value;
      codeShare.update(value);
      try {
        localStorage.setItem(draftKey(roomId, puzzle.id), value);
      } catch {
        // drafts are a convenience
      }
    },
    [roomId, puzzle.id, codeShare],
  );

  const copyWatched = () => {
    if (!watched) return;
    changeCode(watched.code);
    setEditorKey((k) => k + 1);
    setWatching(null);
  };

  const accept = async (canonical: string) => {
    if ((await hashAnswer(salt, puzzle.id, canonical)) === puzzle.check.hash) {
      run.markSolved(puzzle.id);
      setWrong(false);
    } else setWrong(true);
  };

  const execute = async (check: boolean) => {
    if (!workspace || setup === null || busy) return;
    setBusy(true);
    setWrong(false);
    try {
      if (workspace === 'python') {
        const expr = check && puzzle.check.type === 'python' ? puzzle.check.expr : undefined;
        const res = await runners.python(code, setup, expr);
        setOutput({ kind: 'text', text: res.stdout, error: res.ok ? undefined : res.error });
        if (check && res.ok && res.check !== null) await accept(res.check);
      } else {
        const res = await runners.sql(setup, code);
        setOutput(res.ok ? { kind: 'table', table: res.result } : { kind: 'error', error: res.error });
        if (check && res.ok && res.result && puzzle.check.type === 'sql') await accept(canonicalRows(res.result.rows, puzzle.check.ordered));
        else if (check && res.ok) setWrong(true);
      }
    } catch (e) {
      setOutput({ kind: 'error', error: e instanceof RunTimeout ? t('puzzle.timeout', { s: RUN_TIMEOUT_MS / 1000 }) : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const submitAnswer = async (e: FormEvent) => {
    e.preventDefault();
    if (puzzle.check.type !== 'answer' || !answer.trim()) return;
    await accept(normalizeAnswer(answer, puzzle.check.mode));
  };

  const revealed = puzzle.hints.map((_, i) => hintKey(puzzle.id, i) in state.hints);
  const nextHint = revealed.indexOf(false);
  const title = loc(puzzle.title, lang);

  if (locked) {
    const missing = puzzle.requires.filter((r) => !(r in state.solved)).map((r) => loc(getPuzzle(roomId, r)!.title, lang));
    return (
      <Modal title={title} onClose={onClose}>
        <p>{t('puzzle.locked', { list: missing.join(', ') })}</p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t('puzzle.close')}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className={workspace ? 'puzzle-layout' : undefined}>
        <div className="puzzle-text">
          {solved && <p className="solved-banner">{t('puzzle.solved')}</p>}
          {solved && puzzle.reveal && (
            <section className="reveal" aria-label={t('puzzle.reveal')}>
              <RichText text={loc(puzzle.reveal, lang)} />
              <p>
                <PinButton text={plainNote(loc(puzzle.title, lang), loc(puzzle.reveal, lang))} onPin={onPin} />
              </p>
            </section>
          )}
          <RichText text={loc(puzzle.text, lang)} />

          {revealed.some(Boolean) && (
            <section aria-label={t('puzzle.hints')}>
              <h3>{t('puzzle.hints')}</h3>
              <ol className="hint-list">
                {puzzle.hints.map((h, i) => revealed[i] && <li key={i}><RichText text={loc(h, lang)} /></li>)}
              </ol>
            </section>
          )}
          {!solved && nextHint >= 0 && (
            <p>
              <button type="button" onClick={() => run.revealHint(puzzle.id, nextHint)}>
                {t('puzzle.hint', { n: nextHint + 1, total: puzzle.hints.length })}
              </button>{' '}
              <small className="muted">{t('puzzle.hintNote')}</small>
            </p>
          )}

          {puzzle.check.type === 'answer' && !solved && (
            <form className="answer-form" onSubmit={(e) => void submitAnswer(e)}>
              <label>
                <span>{t('puzzle.answerLabel')}</span>
                <input value={answer} onChange={(e) => setAnswer(e.target.value)} />
              </label>
              <button type="submit" className="primary">
                {t('puzzle.unlock')}
              </button>
            </form>
          )}
          {wrong && <p className="error" role="alert">{t('puzzle.wrong')}</p>}

          {workspace === 'sql' && schema.length > 0 && (
            <section aria-label={t('puzzle.tables')}>
              <h3>{t('puzzle.tables')}</h3>
              <ul className="schema-list">
                {schema.map((tbl) => (
                  <li key={tbl.name}>
                    <code>{tbl.name}</code> <span className="muted">({tbl.columns.join(', ')})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {workspace && (
          <div className="puzzle-workspace">
            {teammates.length > 0 && (
              <div className="code-tabs" role="tablist" aria-label={t('share.tabs')}>
                <button type="button" role="tab" aria-selected={!watched} className={watched ? undefined : 'active'} onClick={() => setWatching(null)}>
                  {t('share.mine')}
                </button>
                {teammates.map((m) => (
                  <button key={m.peerId} type="button" role="tab" aria-selected={watched?.peerId === m.peerId} className={watched?.peerId === m.peerId ? 'active' : undefined} onClick={() => setWatching(m.peerId)}>
                    👀 {nameOf(m.peerId)}
                  </button>
                ))}
              </div>
            )}
            {watched && (
              <>
                <CodeViewer code={watched.code} language={workspace} label={t('share.viewerLabel', { name: nameOf(watched.peerId) })} />
                <div className="workspace-actions">
                  <button type="button" onClick={copyWatched}>
                    {t('share.copy')}
                  </button>
                  <small className="muted">{t('share.readOnly', { name: nameOf(watched.peerId) })}</small>
                </div>
              </>
            )}
            <div hidden={!!watched} className="own-editor">
              <CodeEditor key={editorKey} initial={code} language={workspace} schema={schema} onChange={changeCode} onRun={() => void execute(false)} label={t('puzzle.editor')} />
              <div className="workspace-actions">
                <button type="button" onClick={() => void execute(false)} disabled={busy || !runtimeReady || setup === null}>
                  {t('puzzle.run')}
                </button>
                {(puzzle.check.type === 'python' || puzzle.check.type === 'sql') && !solved && (
                  <button type="button" className="primary" onClick={() => void execute(true)} disabled={busy || !runtimeReady || setup === null}>
                    {t('puzzle.check')}
                  </button>
                )}
                <small className="muted">{runtimeReady ? t('puzzle.runShortcut') : t(workspace === 'python' ? 'puzzle.loadingPython' : 'puzzle.loadingSql')}</small>
              </div>
            </div>
            <OutputView output={output} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function OutputView({ output }: { output: Output | null }) {
  const { t } = useTranslation();
  if (!output) return <div className="output muted">{t('puzzle.output')}</div>;
  if (output.kind === 'error') return <pre className="output error">{output.error}</pre>;
  if (output.kind === 'text')
    return (
      <pre className="output">
        {output.text || (!output.error && <span className="muted">{t('puzzle.empty')}</span>)}
        {output.error && <span className="error">{(output.text ? '\n' : '') + output.error}</span>}
      </pre>
    );
  const { table } = output;
  if (!table) return <div className="output muted">{t('puzzle.noResult')}</div>;
  if (table.rows.length === 0) return <div className="output muted">{t('puzzle.noRows')}</div>;
  return (
    <div className="output table-output">
      <table>
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.slice(0, MAX_ROWS).map((row, i) => (
            <tr key={i}>
              {row.map((v, j) => (
                <td key={j}>{v === null ? <span className="muted">NULL</span> : String(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {table.rows.length > MAX_ROWS && <small className="muted">{t('puzzle.rowsTruncated', { n: MAX_ROWS, total: table.rows.length })}</small>}
    </div>
  );
}
