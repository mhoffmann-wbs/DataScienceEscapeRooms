import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

/**
 * A centered dialog. Esc (outside a code editor), the ✕ or a click on the backdrop closes it.
 * Tab stays inside the dialog, and closing it returns the focus to where it was before.
 */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const before = document.activeElement;
    ref.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // Only the topmost dialog answers, and not to keys the code editor already used (Tab indents there).
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      if (e.defaultPrevented || dialogs[dialogs.length - 1] !== ref.current) return;
      // Inside a code editor Esc belongs to the editor (closing autocompletion, Esc-then-Tab to leave it).
      if (e.key === 'Escape' && !(e.target as Element | null)?.closest?.('.cm-editor')) onCloseRef.current();
      if (e.key === 'Tab' && ref.current) trapTab(e, ref.current);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Back to the button that opened the dialog, if any. Never into a text field: that would block walking.
      if (before instanceof HTMLButtonElement && before.isConnected) before.focus();
    };
  }, []);

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

/** Wraps Tab and Shift+Tab around at the dialog's ends, and pulls a focus that escaped back in. */
function trapTab(e: KeyboardEvent, dialog: HTMLElement): void {
  const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  const first = items[0];
  const last = items.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (!dialog.contains(active)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && active === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}
