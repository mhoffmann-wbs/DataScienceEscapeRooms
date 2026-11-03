import { useTranslation } from 'react-i18next';
import type { Presence } from '../net/presence';
import { MAX_TEAM_SIZE, type Teams } from '../net/teams';
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
  const { t } = useTranslation();
  const all = useEmitterValue(teams.events, 'teams', () => teams.list());
  // Re-render when names arrive.
  useEmitterValue(presence.events, 'roster', () => presence.list());
  const waiting = all.filter((team) => team.roomId === roomId);

  return (
    <Modal title={t(`rooms.${roomId}`, { defaultValue: roomId })} onClose={onClose}>
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
                  <span className="muted">{t('team.size', { count: team.members.length, max: MAX_TEAM_SIZE })}</span>
                  <div className="muted">{team.members.map((m) => nameOf(m, presence, profile)).join(', ')}</div>
                </div>
                {mine ? (
                  <span className="muted">{t('team.youAreIn')}</span>
                ) : (
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => {
                      teams.join(team.id);
                      onClose();
                    }}
                  >
                    {full ? t('team.full') : t('team.join')}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          {t('team.close')}
        </button>
        <button
          type="button"
          className="primary"
          onClick={() => {
            teams.create(roomId);
            onClose();
          }}
        >
          {t('team.create')}
        </button>
      </div>
    </Modal>
  );
}
