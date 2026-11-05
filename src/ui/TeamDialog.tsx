import { useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { loc, roomTitle } from '../rooms';
import { getDoor, scenariosAt, type Scenario } from '../rooms/doors';
import type { Presence } from '../net/presence';
import type { Runs } from '../net/runs';
import { MAX_TEAM_SIZE, MIN_PASSWORD_LENGTH, type Teams } from '../net/teams';
import { clearRun, loadRun } from '../player/run';
import { ROOMS } from '../rooms';
import type { Profile } from '../player/profile';
import { Modal } from './Modal';
import { nameOf } from './names';
import { useEmitterValue } from './useStore';

interface Props {
  /** The lobby door: a room type, whose scenarios (rooms) the player picks from. */
  doorId: string;
  teams: Teams;
  /** Live runs in the lobby, to show how a run we left is going. */
  runs: Runs;
  onRejoin: () => void;
  onPractise: (roomId: string) => void;
  presence: Presence;
  profile: Profile;
  onClose: () => void;
}

/** Opened at a lobby door: pick a scenario, then join a team waiting there or create one. */
export function TeamDialog({ doorId, teams, runs, presence, profile, onRejoin, onPractise, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const door = getDoor(doorId);
  const scenarios = scenariosAt(doorId);
  const roomIds = scenarios.flatMap((s) => (s.roomId ? [s.roomId] : []));
  // A run at this door that we left before it was finished.
  const [saved, setSaved] = useState(() => {
    const run = loadRun();
    return run && roomIds.includes(run.roomId) ? run : null;
  });
  // Nothing is picked until the player chooses a scenario.
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const live = useEmitterValue(runs.events, 'runs', () => runs.list()).find((r) => r.teamId === saved?.teamId);
  const all = useEmitterValue(teams.events, 'teams', () => teams.list());
  // Re-render when names arrive.
  useEmitterValue(presence.events, 'roster', () => presence.list());
  const waiting = all.filter((team) => roomIds.includes(team.roomId));
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [group, setGroup] = useState(loadGroup);
  const [newPassword, setNewPassword] = useState('');
  // A locked team we're entering the password for, and whether the leader said it was wrong.
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [joinPassword, setJoinPassword] = useState('');
  const [wrong, setWrong] = useState(false);
  const tooShort = visibility === 'private' && newPassword.length < MIN_PASSWORD_LENGTH;
  // The scenario whose details are shown (playable or not).
  const [open, setOpen] = useState<number | null>(null);

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
    <Modal title={door ? `${door.icon} ${loc(door.title, i18n.language)}` : doorId} onClose={onClose}>
      {saved && (
        <section className="rejoin" aria-label={t('team.rejoinTitle')}>
          <strong>
            {saved.solo ? t('team.practiceTitle') : t('team.rejoinTitle')} · {roomTitle(saved.roomId, i18n.language)}
          </strong>
          <p className="muted">
            {t('team.rejoinStatus', {
              solved: Object.keys((live ?? saved.state).solved).length,
              total: ROOMS[saved.roomId]?.puzzles.length ?? 0,
            })}{' '}
            {saved.solo ? '' : live ? t('team.rejoinPlaying', { count: live.members.length }) : t('team.rejoinNobody')}
          </p>
          <div className="modal-actions">
            <button
              type="button"
              onClick={() => {
                clearRun();
                setSaved(null);
              }}
            >
              {t('team.discard')}
            </button>
            <button type="button" className="primary" onClick={onRejoin}>
              {t('team.rejoin')}
            </button>
          </div>
        </section>
      )}
      <h3 className="scenario-heading">{t('scenario.choose')}</h3>
      <ul className="scenario-list">
        {scenarios.map((scenario, i) => (
          <ScenarioCard
            key={scenario.roomId ?? `upcoming-${i}`}
            scenario={scenario}
            selected={!!scenario.roomId && scenario.roomId === roomId}
            open={open === i}
            onSelect={() => scenario.roomId && setRoomId(scenario.roomId)}
            onToggle={() => setOpen(open === i ? null : i)}
          />
        ))}
      </ul>
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
                  <span className="team-scenario">{roomTitle(team.roomId, i18n.language)}</span>{' '}
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
        <button type="button" title={roomId ? t('team.practiceHelp') : t('scenario.pickFirst')} disabled={!roomId} onClick={() => roomId && onPractise(roomId)}>
          {t('team.practice')}
        </button>
        <button
          type="button"
          className="primary"
          disabled={tooShort || !roomId}
          title={roomId ? undefined : t('scenario.pickFirst')}
          onClick={() => {
            if (!roomId) return;
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

interface ScenarioCardProps {
  scenario: Scenario;
  selected: boolean;
  open: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

/** One scenario at a door: clicking it selects it (if playable); its ⓘ button shows tools, practice and story. */
function ScenarioCard({ scenario, selected, open, onSelect, onToggle }: ScenarioCardProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const upcoming = !scenario.roomId;
  const { about } = scenario;
  const detailsId = useId();
  return (
    <li className={`scenario${selected ? ' selected' : ''}${upcoming ? ' upcoming' : ''}`}>
      <div className="scenario-row">
        <button type="button" className="scenario-head" aria-pressed={upcoming ? undefined : selected} aria-disabled={upcoming || undefined} onClick={onSelect}>
          <span className="scenario-title">{loc(scenario.title, lang)}</span>
          <span className={`difficulty difficulty-${scenario.difficulty}`}>{t(`scenario.difficulty.${scenario.difficulty}`)}</span>
          {upcoming && <span className="scenario-soon">{t('scenario.comingSoon')}</span>}
        </button>
        <button type="button" className="scenario-toggle" aria-label={t('scenario.about')} title={t('scenario.about')} aria-expanded={open} aria-controls={detailsId} onClick={onToggle}>
          {open ? '▾' : 'ⓘ'}
        </button>
      </div>
      {open && (
        <dl id={detailsId} className="scenario-about">
          <dt>{t('scenario.story')}</dt>
          <dd>{loc(about.story, lang)}</dd>
          <dt>{t('scenario.practises')}</dt>
          <dd>{loc(about.practises, lang)}</dd>
          <dt>{t('scenario.tools')}</dt>
          <dd className="scenario-tools">
            {about.tools.map((tool) => (
              <span key={tool} className="tool-chip">
                {tool}
              </span>
            ))}
          </dd>
        </dl>
      )}
    </li>
  );
}

const GROUP_KEY = 'dser.group';

/** The last group tag used, as a convenience for the next team (and for group announcements). */
export function loadGroup(): string {
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
