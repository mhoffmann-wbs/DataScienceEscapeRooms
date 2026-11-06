import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** A centered dialog. Esc (outside a code editor), the ✕ or a click on the backdrop closes it. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    // Inside a code editor Esc belongs to the editor (closing autocompletion, Esc-then-Tab to leave it).
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as Element | null)?.closest?.('.cm-editor') && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal modal-wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
        {/* Last, so the focus on open goes to the dialog's own first button. */}
        <button type="button" className="modal-close" aria-label={t('app.close')} title={t('app.close')} onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
