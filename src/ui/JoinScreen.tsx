import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AVATAR_COUNT } from '../game/avatars';
import { normalizeClassCode, profileSchema, type Profile } from '../player/profile';
import { AvatarPreview } from './AvatarPreview';

interface Props {
  initial: Profile | null;
  onJoin: (profile: Profile) => void;
}

export function JoinScreen({ initial, onJoin }: Props) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [avatar, setAvatar] = useState(initial?.avatar ?? 0);
  const [classCode, setClassCode] = useState(initial?.classCode ?? '');
  const [errors, setErrors] = useState<Set<string>>(new Set());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = profileSchema.safeParse({ nickname: nickname.trim(), avatar, classCode: normalizeClassCode(classCode) });
    if (result.success) onJoin(result.data);
    else setErrors(new Set(result.error.issues.map((i) => String(i.path[0]))));
  };

  return (
    <div className="join-backdrop">
      <form className="join-card" onSubmit={submit} noValidate>
        <h2>{t('join.title')}</h2>

        <label>
          <span>{t('join.nickname')}</span>
          <input value={nickname} maxLength={20} autoFocus onChange={(e) => setNickname(e.target.value)} aria-invalid={errors.has('nickname')} />
          {errors.has('nickname') && <small className="error">{t('join.errors.nickname')}</small>}
        </label>

        <fieldset>
          <legend>{t('join.avatar')}</legend>
          <div className="avatar-grid">
            {Array.from({ length: AVATAR_COUNT }, (_, i) => (
              <button
                key={i}
                type="button"
                className={i === avatar ? 'avatar-option selected' : 'avatar-option'}
                aria-pressed={i === avatar}
                aria-label={t('join.avatarOption', { n: i + 1 })}
                onClick={() => setAvatar(i)}
              >
                <AvatarPreview avatar={i} />
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          <span>{t('join.classCode')}</span>
          <input value={classCode} maxLength={16} onChange={(e) => setClassCode(e.target.value)} aria-invalid={errors.has('classCode')} />
          <small>{t('join.classCodeHelp')}</small>
          {errors.has('classCode') && <small className="error">{t('join.errors.classCode')}</small>}
        </label>

        <button type="submit" className="primary">
          {t('join.submit')}
        </button>
      </form>
    </div>
  );
}
