import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstructorChannel } from '../net/instructor';
import { idOf, type Result, type Scores } from '../net/scores';
import { ROOMS, roomTitle } from '../rooms';
import { Modal } from './Modal';
import { formatDuration } from './RoomHud';
import { useEmitterValue } from './useStore';

type Period = 'today' | 'week' | 'all';
const DAY = 24 * 3600_000;

interface Props {
  scores: Scores;
  /** Unlocked instructor mode: results can be removed, for everyone. */
  instructor?: { channel: InstructorChannel; signingKey: CryptoKey } | null;
  onClose: () => void;
}

/** Escape times per room, filterable by group and period. Results come from players' browsers. */
export function ScoreboardDialog({ scores, instructor = null, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const results = useEmitterValue(scores.events, 'results', () => scores.list());
  const roomIds = Object.keys(ROOMS);
  const [roomId, setRoomId] = useState(roomIds[0]!);
  const [group, setGroup] = useState('');
  const [period, setPeriod] = useState<Period>('week');
  const [now] = useState(Date.now);

  const groups = [...new Set(results.map((r) => r.group).filter((g): g is string => !!g))].sort();
  const since = period === 'today' ? new Date(now).setHours(0, 0, 0, 0) : period === 'week' ? now - 7 * DAY : 0;
  const shown = results.filter((r) => r.roomId === roomId && r.escapedAt >= since && (!group || r.group === group));
  const date = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const remove = (r: Result) => {
    if (!instructor || !window.confirm(t('scores.removeConfirm', { team: t('team.teamOf', { name: r.leader }) }))) return;
    void instructor.channel.send(instructor.signingKey, { type: 'removeScore', id: idOf(r) });
  };

  return (
    <Modal title={t('scores.title')} onClose={onClose} wide>
      <div className="score-tabs" role="tablist">
        {roomIds.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={id === roomId} className={id === roomId ? 'active' : undefined} onClick={() => setRoomId(id)}>
            {roomTitle(id, i18n.language)}
          </button>
        ))}
      </div>
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
        <label>
          <span>{t('scores.period')}</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="today">{t('scores.today')}</option>
            <option value="week">{t('scores.week')}</option>
            <option value="all">{t('scores.all')}</option>
          </select>
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="muted">{t('scores.empty')}</p>
      ) : (
        <table className="score-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('scores.team')}</th>
              <th>{t('scores.group')}</th>
              <th>{t('scores.time')}</th>
              <th>{t('scores.hints')}</th>
              <th>{t('scores.when')}</th>
              {instructor && <th />}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={idOf(r)}>
                <td>{i + 1}</td>
                <td>
                  <strong>{t('team.teamOf', { name: r.leader })}</strong>
                  <div className="muted">
                    {r.members.join(', ')}
                    {r.left?.map((name) => (
                      <span key={name} className="left-early" title={t('scores.leftEarly')}>
                        {', '}
                        <s>{name}</s> ({t('scores.leftEarly')})
                      </span>
                    ))}
                  </div>
                </td>
                <td>{r.group ?? '–'}</td>
                <td>{formatDuration(r.escapedAt - r.startedAt)}</td>
                <td>{r.hints}</td>
                <td>{date.format(r.escapedAt)}</td>
                {instructor && (
                  <td>
                    <button type="button" onClick={() => remove(r)}>
                      {t('scores.remove')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small-print">{t('scores.notCheatProof')}</p>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {t('team.close')}
        </button>
      </div>
    </Modal>
  );
}
