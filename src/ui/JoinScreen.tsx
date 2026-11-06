import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ACCESSORIES, HAIR_COLORS, HAIR_STYLES, PANTS_COLORS, SHIRT_COLORS, SHIRT_STYLES, SKIN_COLORS, randomLook, type Direction, type Look } from '../game/avatars';
import { profileSchema, type Profile } from '../player/profile';
import { AvatarPreview } from './AvatarPreview';

interface Props {
  initial: Profile | null;
  onJoin: (profile: Profile) => void;
}

/** The big preview turns to show every side. */
const TURN_MS = 1200;
const TURN_ORDER = ['down', 'left', 'up', 'right'] as const satisfies readonly Direction[];

type Part = keyof Look;

const rgb = (c: readonly number[]) => `rgb(${c.join(',')})`;

export function JoinScreen({ initial, onJoin }: Props) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(initial?.nickname ?? '');
  const [look, setLook] = useState<Look>(() => initial?.look ?? randomLook());
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTurn((n) => (n + 1) % TURN_ORDER.length), TURN_MS);
    return () => clearInterval(id);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const result = profileSchema.safeParse({ nickname: nickname.trim(), look });
    if (result.success) onJoin(result.data);
    else setErrors(new Set(result.error.issues.map((i) => String(i.path[0]))));
  };

  /** One row of choices for a part of the look; `names` are the options' translation keys, `show(i)` draws option i. */
  const row = (part: Part, names: readonly string[], show: (i: number) => ReactNode, swatch: boolean) => (
    <div className="look-row" role="group" aria-label={t(`join.look.${part}`)}>
      <span className="look-row-label">{t(`join.look.${part}`)}</span>
      <div className="look-options">
        {names.map((name, i) => (
          <button
            key={name}
            type="button"
            className={`${swatch ? 'look-swatch' : 'look-style'}${look[part] === i ? ' selected' : ''}`}
            aria-pressed={look[part] === i}
            aria-label={t(`join.look.options.${name}`)}
            title={t(`join.look.options.${name}`)}
            onClick={() => setLook({ ...look, [part]: i })}
          >
            {show(i)}
          </button>
        ))}
      </div>
    </div>
  );
  const swatches = (part: Part, colors: Record<string, readonly number[]>) =>
    row(part, Object.keys(colors), (i) => <span className="look-swatch-color" style={{ background: rgb(Object.values(colors)[i] ?? []) }} />, true);
  const styles = (part: 'hairStyle' | 'shirtStyle' | 'accessory', names: readonly string[]) =>
    row(part, names, (i) => <AvatarPreview look={{ ...look, [part]: i }} scale={1.5} dir={part === 'hairStyle' ? 'left' : 'down'} />, false);

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
          <div className="look-editor">
            <div className="look-preview">
              <AvatarPreview look={look} scale={3} dir={TURN_ORDER[turn]} />
              <button type="button" onClick={() => setLook(randomLook())}>
                🎲 {t('join.look.random')}
              </button>
            </div>
            <div className="look-rows">
              {swatches('skin', Object.fromEntries(SKIN_COLORS.map((c, i) => [`skin${i + 1}`, c])))}
              {styles('hairStyle', HAIR_STYLES)}
              {swatches('hairColor', HAIR_COLORS)}
              {styles('shirtStyle', SHIRT_STYLES)}
              {swatches('shirtColor', SHIRT_COLORS)}
              {swatches('pantsColor', PANTS_COLORS)}
              {styles('accessory', ACCESSORIES)}
            </div>
          </div>
        </fieldset>

        <button type="submit" className="primary">
          {t('join.submit')}
        </button>
      </form>
    </div>
  );
}
