import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Presence } from '../net/presence';
import type { Profile } from '../player/profile';
import { roomTitle } from '../rooms';
import { AvatarPreview } from './AvatarPreview';
import { useEmitterValue } from './useStore';

interface Props {
  presence: Presence;
  self: Profile;
  /** Panel heading for a given head count (including us). */
  heading: (count: number) => string;
  /** Shown when nobody else is here. */
  aloneText: string;
  /** Instructors only: names open a menu to go to that player. Resolves false if they can't be reached. */
  onGoTo?: ((peerId: string) => Promise<boolean>) | null;
}

type Going = { peerId: string; status: 'going' | 'failed' } | null;

export function PeoplePanel({ presence, self, heading, aloneText, onGoTo }: Props) {
  const { t, i18n } = useTranslation();
  const peers = useEmitterValue(presence.events, 'roster', () => presence.list());
  const [open, setOpen] = useState(true);
  const [menu, setMenu] = useState<string | null>(null);
  const [going, setGoing] = useState<Going>(null);

  const goTo = async (peerId: string) => {
    setGoing({ peerId, status: 'going' });
    const ok = await onGoTo!(peerId);
    setGoing(ok ? null : { peerId, status: 'failed' });
    if (ok) setMenu(null);
  };

  return (
    <section className="overlay people-panel" aria-label={heading(peers.length + 1)}>
      <button type="button" className="people-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {heading(peers.length + 1)}
      </button>
      {open && (
        <ul>
          <li>
            <AvatarPreview avatar={self.avatar} scale={1} />
            {self.nickname} <span className="muted">{t('people.you')}</span>
          </li>
          {peers.map((p) => (
            <li key={p.id} className={menu === p.id ? 'menu-open' : undefined}>
              <AvatarPreview avatar={p.avatar} scale={1} />
              {onGoTo ? (
                <button type="button" className="link-button" aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>
                  {p.nickname}
                </button>
              ) : (
                p.nickname
              )}
              {p.away && <span className="muted"> · {t('people.inRoom', { room: roomTitle(p.away, i18n.language) })}</span>}
              {onGoTo && menu === p.id && (
                <div className="people-menu">
                  <button type="button" disabled={going?.status === 'going'} onClick={() => void goTo(p.id)}>
                    {going?.peerId === p.id && going.status === 'going' ? t('people.going') : t('people.goTo', { name: p.nickname })}
                  </button>
                  {going?.peerId === p.id && going.status === 'failed' && (
                    <p className="error" role="alert">
                      {t('people.goToFailed', { name: p.nickname })}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
          {peers.length === 0 && <li className="muted">{aloneText}</li>}
        </ul>
      )}
    </section>
  );
}
