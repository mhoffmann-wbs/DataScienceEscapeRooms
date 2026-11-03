import { useTranslation } from 'react-i18next';
import { roomTitle } from '../rooms';
import type { Presence } from '../net/presence';
import { MAX_TEAM_SIZE, type Teams } from '../net/teams';
import type { Profile } from '../player/profile';
import { nameOf } from './names';
import { useEmitterValue } from './useStore';

/** While in a forming team: who's in it, and Start (leader) or Leave. */
export function TeamBar({ teams, presence, profile }: { teams: Teams; presence: Presence; profile: Profile }) {
  const { t, i18n } = useTranslation();
  useEmitterValue(teams.events, 'teams', () => teams.list());
  useEmitterValue(presence.events, 'roster', () => presence.list());
  const team = teams.mine();
  if (!team) return null;
  const isLeader = team.leader === teams.selfId;

  return (
    <section className="overlay team-bar" aria-label={t('team.teamOf', { name: nameOf(team.leader, presence, profile) })}>
      <div>
        <strong>{roomTitle(team.roomId, i18n.language)}</strong> · {t('team.teamOf', { name: nameOf(team.leader, presence, profile) })}{' '}
        <span className="muted">{t('team.size', { count: team.members.length, max: MAX_TEAM_SIZE })}</span>
        <div className="muted">{team.members.map((m) => nameOf(m, presence, profile)).join(', ')}</div>
      </div>
      <div className="team-bar-actions">
        {isLeader ? (
          <button type="button" className="primary" onClick={() => teams.start()}>
            {t('team.start')}
          </button>
        ) : (
          <span className="muted">{t('team.waiting', { name: nameOf(team.leader, presence, profile) })}</span>
        )}
        <button type="button" onClick={() => teams.leave()}>
          {t('team.leave')}
        </button>
      </div>
    </section>
  );
}
