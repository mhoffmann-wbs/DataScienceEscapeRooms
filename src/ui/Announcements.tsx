import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InstructorChannel } from '../net/instructor';

const SHOW_MS = 45_000;

interface Shown {
  id: string;
  text: string;
  title: 'fromInstructor';
}

/**
 * Instructor messages as a banner: announcements (for everyone, one group or one team), and
 * notices when the instructor resets the run of `teamId` (the room applies the reset itself)
 * or is on the way to visit it.
 */
export function Announcements({ instructor, group, teamId }: { instructor: InstructorChannel; group: string | null; teamId: string | null }) {
  const { t } = useTranslation();
  const [shown, setShown] = useState<Shown[]>([]);

  useEffect(() => {
    const show = (item: Shown) => {
      setShown((s) => [...s.slice(-2), item]);
      setTimeout(() => setShown((s) => s.filter((x) => x.id !== item.id)), SHOW_MS);
    };
    const offs = [
      instructor.events.on('announce', (m) => {
        const forUs = m.teamId ? m.teamId === teamId : !m.group || m.group === group;
        if (forUs) show({ id: m.nonce, text: m.text, title: 'fromInstructor' });
      }),
      instructor.events.on('reset', (m) => {
        if (m.teamId === teamId) show({ id: m.nonce, text: t('instructor.resetNotice'), title: 'fromInstructor' });
      }),
      instructor.events.on('visit', (m) => {
        if (m.teamId === teamId) show({ id: m.nonce, text: t('instructor.visitNotice'), title: 'fromInstructor' });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [instructor, group, teamId, t]);

  if (shown.length === 0) return null;
  return (
    <section className="overlay announcements" role="status" aria-live="assertive">
      {shown.map((a) => (
        <div key={a.id} className="announcement">
          <strong>📣 {t(`instructor.${a.title}`)}</strong> {a.text}
          <button type="button" aria-label={t('instructor.dismiss')} onClick={() => setShown((s) => s.filter((x) => x.id !== a.id))}>
            ✕
          </button>
        </div>
      ))}
    </section>
  );
}
