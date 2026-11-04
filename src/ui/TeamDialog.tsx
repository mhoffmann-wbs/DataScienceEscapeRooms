import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { roomTitle } from '../rooms';
import type { Presence } from '../net/presence';
import { MAX_TEAM_SIZE, MIN_PASSWORD_LENGTH, type Teams } from '../net/teams';
import type { Profile } from '../player/profile';
import { Modal } from './Modal';
import { nameOf } from './names';
import { useEmitterValue } from './useStore';

interface Props {
  roomId: string;
  teams: Teams;
  presence: Presence;
  profile: Profile;
  onClose: () => void;
}

/** Opened at a lobby door: join a team waiting there, or create one. */
export function TeamDialog({ roomId, teams, presence, profile, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const all = useEmitterValue(teams.events, 'teams', () => teams.list());
  // Re-render when names arrive.
  useEmitterValue(presence.events, 'roster', () => presence.list());
  const waiting = all.filter((team) => team.roomId === roomId);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [group, setGroup] = useState(loadGroup);
  const [newPassword, setNewPassword] = useState('');
  // A locked team we're entering the password for, and whether the leader said it was wrong.
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const tooShort = visibility === 'private' && newPassword.length < MIN_PASSWORD_LENGTH;

  useEffect(() => teams.events.on('rejected', ({ teamId }) => teamId === unlocking && setWrong(true)), [teams, unlocking]);
  // Accepted into the locked team: done.
  const accepted = !!unlocking && !!all.find((team) => team.id === unlocking)?.members.includes(teams.selfId);
  useEffect(() => {
    if (accepted) onClose();
  }, [accepted, onClose]);

  const submitPassword = (e: FormEvent) => {
    e.preventDefault();
    if (!unlocking || !joinPassword) return;
    setWrong(false);
    void teams.join(unlocking, joinPassword);
  };

  return (
    <Modal title={roomTitle(roomId, i18n.language)} onClose={onClose}>
      <p className="muted">{t('team.intro', { max: MAX_TEAM_SIZE })}</p>
      {waiting.length === 0 ? (
        <p>{t('team.none')}</p>
      ) : (
        <ul className="team-list">
          {waiting.map((team) => {
            const mine = team.members.includes(teams.selfId);
            const full = team.members.length >= MAX_TEAM_SIZE;
            return (
              <li key={team.id}>
                <div>
                  <strong>{t('team.teamOf', { name: nameOf(team.leader, presence, profile) })}</strong>{' '}
                  {team.locked && <span title={t('team.locked')} aria-label={t('team.locked')}>🔒 </span>}
                  {team.group && <span className="team-group">{team.group}</span>}
                  <span className="muted">{t('team.size', { count: team.members.length, max: MAX_TEAM_SIZE })}</span>
                  <div className="muted">{team.members.map((m) => nameOf(m, presence, profile)).join(', ')}</div>
                </div>
                {mine ? (
                  <span className="muted">{t('team.youAreIn')}</span>
                ) : unlocking === team.id ? (
                  <form className="team-password" onSubmit={submitPassword}>
                    <input
                      type="password"
                      autoFocus
                      value={joinPassword}
                      placeholder={t('team.password')}
                      aria-label={t('team.password')}
                      aria-invalid={wrong}
                      onChange={(e) => setJoinPassword(e.target.value)}
                    />
                    <button type="submit" className="primary" disabled={!joinPassword}>
                      {t('team.join')}
                    </button>
                    {wrong && <small className="error" role="alert">{t('team.wrongPassword')}</small>}
                  </form>
                ) : (
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => {
                      if (team.locked) {
                        setUnlocking(team.id);
                        setJoinPassword('');
                        setWrong(false);
                        return;
                      }
                      void teams.join(team.id);
                      onClose();
                    }}
                  >
                    {full ? t('team.full') : team.locked ? `🔒 ${t('team.join')}` : t('team.join')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <fieldset className="team-visibility">
        <legend>{t('team.newTeam')}</legend>
        <label>
          <input type="radio" name="visibility" checked={visibility === 'public'} onChange={() => setVisibility('public')} />
          {t('team.public')}
        </label>
        <label>
          <input type="radio" name="visibility" checked={visibility === 'private'} onChange={() => setVisibility('private')} />
          {t('team.private')}
        </label>
        <label className="team-new-password">
          <span>{t('team.group')}</span>
          <input type="text" value={group} maxLength={24} placeholder={t('team.groupPlaceholder')} onChange={(e) => setGroup(e.target.value)} />
          <small className="muted">{t('team.groupHelp')}</small>
        </label>
        {visibility === 'private' && (
          <label className="team-new-password">
            <span>{t('team.password')}</span>
            <input type="text" value={newPassword} maxLength={40} autoComplete="off" onChange={(e) => setNewPassword(e.target.value)} />
            <small className={tooShort && newPassword ? 'error' : 'muted'}>
              {tooShort && newPassword ? t('team.passwordTooShort', { min: MIN_PASSWORD_LENGTH }) : t('team.passwordHelp')}
            </small>
          </label>
        )}
      </fieldset>
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {t('team.close')}
        </button>
        <button
          type="button"
          className="primary"
          disabled={tooShort}
          onClick={() => {
            saveGroup(group);
            teams.create(roomId, visibility === 'private' ? newPassword : undefined, group);
            onClose();
          }}
        >
          {t('team.create')}
        </button>
      </div>
    </Modal>
  );
}

const GROUP_KEY = 'dser.group';

/** The last group tag used, as a convenience for the next team. */
function loadGroup(): string {
  try {
    return localStorage.getItem(GROUP_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveGroup(group: string): void {
  try {
    localStorage.setItem(GROUP_KEY, group.trim());
  } catch {
    // a convenience only
  }
}
