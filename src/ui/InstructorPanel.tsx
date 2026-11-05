import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Invite } from '../net/help';
import { unlockInstructor, type InstructorConfig } from '../net/instructor';
import type { RunSummary } from '../net/runs';
import type { LobbySession } from '../net/session';
import { loc, ROOMS, roomTitle } from '../rooms';
import { Modal } from './Modal';
import { formatDuration } from './RoomHud';
import { useEmitterValue } from './useStore';

/** A reset's epoch: its time, so later resets always win. */
const newEpoch = () => Date.now();

/** Asks for the instructor passphrase and hands back the signing key. */
export function InstructorUnlock({ config, onUnlock, onClose }: { config: InstructorConfig; onUnlock: (key: CryptoKey) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const key = await unlockInstructor(config, passphrase);
    setBusy(false);
    if (key) onUnlock(key);
    else setWrong(true);
  };

  return (
    <Modal title={t('instructor.title')} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} className="instructor-unlock">
        <label>
          <span>{t('instructor.passphrase')}</span>
          <input type="password" autoFocus value={passphrase} onChange={(e) => setPassphrase(e.target.value)} aria-invalid={wrong} />
        </label>
        {wrong && (
          <p className="error" role="alert">
            {t('instructor.wrongPassphrase')}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t('team.close')}
          </button>
          <button type="submit" className="primary" disabled={!passphrase || busy}>
            {busy ? t('instructor.unlocking') : t('instructor.unlock')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface PanelProps {
  lobby: LobbySession;
  signingKey: CryptoKey;
  /** A team let us in: go to its room. */
  onVisit: (invite: Invite) => void;
  onClose: () => void;
}

/** Live runs with progress per puzzle and calls for help; messages, visits, resets and announcements. */
export function InstructorPanel({ lobby, signingKey, onVisit, onClose }: PanelProps) {
  const { t, i18n } = useTranslation();
  const runs = useEmitterValue(lobby.runs.events, 'runs', () => lobby.runs.list());
  const calls = useEmitterValue(lobby.help.events, 'calls', () => lobby.help.list());
  const [visiting, setVisiting] = useState<string | null>(null);
  const [visitFailed, setVisitFailed] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [group, setGroup] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState('');
  /** '' everyone, `g:<group>` or `t:<teamId>`. */
  const [target, setTarget] = useState('');
  const [sent, setSent] = useState(false);
  const [now] = useState(Date.now);

  const groups = [...new Set(runs.map((r) => r.group).filter((g): g is string => !!g))].sort();
  const shown = runs.filter((r) => !group || r.group === group);

  const announce = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const group = target.startsWith('g:') ? target.slice(2) : null;
    const teamId = target.startsWith('t:') ? target.slice(2) : null;
    await lobby.instructor.send(signingKey, { type: 'announce', text: text.trim(), group, teamId });
    setText('');
    setSent(true);
  };

  const teamName = (run: RunSummary) => `${t('team.teamOf', { name: run.leader })} · ${roomTitle(run.roomId, i18n.language)}`;

  const message = (run: RunSummary) => {
    setTarget(`t:${run.teamId}`);
    setSent(false);
    textRef.current?.focus();
  };

  const visit = async (run: RunSummary) => {
    setVisiting(run.teamId);
    setVisitFailed(null);
    const invite = await lobby.help.visit(signingKey, run.teamId);
    setVisiting(null);
    // Only an invite into the room the team reports playing.
    if (invite && invite.roomId === run.roomId) onVisit(invite);
    else setVisitFailed(run.teamId);
  };

  const reset = (run: RunSummary) => {
    if (!window.confirm(t('instructor.resetConfirm', { team: t('team.teamOf', { name: run.leader }), room: roomTitle(run.roomId, i18n.language) }))) return;
    void lobby.instructor.send(signingKey, { type: 'reset', teamId: run.teamId, epoch: newEpoch() });
  };

  return (
    <Modal title={t('instructor.title')} onClose={onClose} wide>
      <div className="score-filters">
        <label>
          <span>{t('scores.group')}</span>
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">{t('scores.allGroups')}</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="muted">{t('instructor.noRuns')}</p>
      ) : (
        <table className="score-table instructor-table">
          <thead>
            <tr>
              <th>{t('scores.team')}</th>
              <th>{t('instructor.room')}</th>
              <th>{t('instructor.progress')}</th>
              <th>{t('scores.time')}</th>
              <th>{t('scores.hints')}</th>
              <th>{t('instructor.wrong')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((run) => {
              const room = ROOMS[run.roomId];
              const total = room?.puzzles.length ?? 0;
              const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
              const elapsed = run.startedAt === null ? null : (run.escapedAt ?? now) - run.startedAt;
              const expanded = open === run.teamId;
              const calling = calls.some((c) => c.teamId === run.teamId);
              return [
                <tr key={run.teamId} className={calling ? 'calling' : undefined}>
                  <td>
                    {calling && <div className="call-flag">🙋 {t('instructor.calling')}</div>}
                    <button type="button" className="link-button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : run.teamId)}>
                      {expanded ? '▾' : '▸'} {t('team.teamOf', { name: run.leader })}
                    </button>
                    {run.group && <span className="team-group">{run.group}</span>}
                    <div className="muted">{run.members.join(', ')}</div>
                  </td>
                  <td>{roomTitle(run.roomId, i18n.language)}</td>
                  <td>
                    {Object.keys(run.solved).length}/{total}
                    {run.escapedAt !== null && ' ✓'}
                  </td>
                  <td>{elapsed === null ? '–' : formatDuration(elapsed)}</td>
                  <td>{sum(run.hints)}</td>
                  <td>{sum(run.attempts)}</td>
                  <td>
                    <div className="instructor-actions">
                      <button type="button" onClick={() => message(run)}>
                        {t('instructor.message')}
                      </button>
                      <button type="button" className={calling ? 'primary' : undefined} disabled={visiting !== null} onClick={() => void visit(run)}>
                        {visiting === run.teamId ? t('instructor.visiting') : t('instructor.visit')}
                      </button>
                      <button type="button" onClick={() => reset(run)}>
                        {t('instructor.reset')}
                      </button>
                    </div>
                    {visitFailed === run.teamId && (
                      <p className="error" role="alert">
                        {t('instructor.visitFailed')}
                      </p>
                    )}
                  </td>
                </tr>,
                expanded && room && (
                  <tr key={`${run.teamId}-detail`} className="instructor-detail">
                    <td colSpan={7}>
                      <table>
                        <thead>
                          <tr>
                            <th>{t('instructor.puzzle')}</th>
                            <th>{t('instructor.solvedAfter')}</th>
                            <th>{t('scores.hints')}</th>
                            <th>{t('instructor.wrong')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {room.puzzles.map((p) => {
                            const at = run.solved[p.id];
                            return (
                              <tr key={p.id}>
                                <td>{loc(p.title, i18n.language)}</td>
                                <td>{at !== undefined && run.startedAt !== null ? formatDuration(at - run.startedAt) : '–'}</td>
                                <td>
                                  {run.hints[p.id] ?? 0}/{p.hints.length}
                                </td>
                                <td>{run.attempts[p.id] ?? 0}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      )}

      <form className="instructor-announce" onSubmit={(e) => void announce(e)}>
        <h3>{t('instructor.announce')}</h3>
        <textarea
          ref={textRef}
          value={text}
          maxLength={500}
          rows={2}
          placeholder={t('instructor.announcePlaceholder')}
          onChange={(e) => {
            setText(e.target.value);
            setSent(false);
          }}
        />
        <div className="instructor-announce-row">
          <label>
            <span>{t('instructor.to')}</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{t('instructor.everyone')}</option>
              {groups.length > 0 && (
                <optgroup label={t('instructor.groups')}>
                  {groups.map((g) => (
                    <option key={g} value={`g:${g}`}>
                      {g}
                    </option>
                  ))}
                </optgroup>
              )}
              {runs.length > 0 && (
                <optgroup label={t('instructor.teams')}>
                  {runs.map((r) => (
                    <option key={r.teamId} value={`t:${r.teamId}`}>
                      {teamName(r)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <button type="submit" className="primary" disabled={!text.trim()}>
            {t('instructor.send')}
          </button>
          {sent && <span className="muted">{t('instructor.sent')}</span>}
        </div>
      </form>

      <p className="muted small-print">{t('instructor.trust')}</p>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {t('team.close')}
        </button>
      </div>
    </Modal>
  );
}
