import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Presence } from '../net/presence';
import type { Profile } from '../player/profile';
import { AvatarPreview } from './AvatarPreview';
import { useEmitterValue } from './useStore';

export function PeoplePanel({ presence, self }: { presence: Presence; self: Profile }) {
  const { t } = useTranslation();
  const peers = useEmitterValue(presence.events, 'roster', () => presence.list());
  const [open, setOpen] = useState(true);

  return (
    <section className="overlay people-panel" aria-label={t('people.title', { count: peers.length + 1 })}>
      <button type="button" className="people-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        {t('people.title', { count: peers.length + 1 })} · {self.classCode}
      </button>
      {open && (
        <ul>
          <li>
            <AvatarPreview avatar={self.avatar} scale={1} />
            {self.nickname} <span className="muted">{t('people.you')}</span>
          </li>
          {peers.map((p) => (
            <li key={p.id}>
              <AvatarPreview avatar={p.avatar} scale={1} />
              {p.nickname}
            </li>
          ))}
          {peers.length === 0 && <li className="muted">{t('people.alone')}</li>}
        </ul>
      )}
    </section>
  );
}
