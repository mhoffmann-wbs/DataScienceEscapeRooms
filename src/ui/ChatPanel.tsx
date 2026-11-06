import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Chat, ChatEntry } from '../net/chat';
import { CHAT_MAX_LENGTH, type ChatScope } from '../net/protocol';
import { useEmitterValue } from './useStore';

const COLLAPSED_KEY = 'dser.chat.collapsed';

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function ChatPanel({ chat }: { chat: Chat }) {
  const { t } = useTranslation();
  const entries = useEmitterValue(chat.events, 'entries', () => chat.list());
  const [scope, setScope] = useState<ChatScope>('all');
  const [text, setText] = useState('');
  const [collapsed, setCollapsedState] = useState(loadCollapsed);
  // Messages up to this id were visible before collapsing; later ones count as unread.
  const [seenId, setSeenId] = useState(() => chat.list().at(-1)?.id ?? 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const latestId = entries.at(-1)?.id ?? 0;
  const unread = collapsed ? entries.filter((e) => e.kind === 'message' && !e.self && e.id > seenId).length : 0;

  const setCollapsed = (value: boolean) => {
    setCollapsedState(value);
    if (value) setSeenId(latestId);
    try {
      localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
    } catch {
      // a convenience only
    }
  };
  const listRef = useRef<HTMLOListElement>(null);

  // Enter (while not typing elsewhere) opens the chat, like in most games.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      if (e.key !== 'Enter' || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement) return;
      if (el instanceof HTMLElement && el.isContentEditable) return; // e.g. the code editor
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      setCollapsedState(false);
      // The input only exists once the panel is open again.
      setTimeout(() => inputRef.current?.focus());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [entries]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim() && chat.send(text, scope)) setText('');
    // Back to walking after sending (or on an empty Enter).
    inputRef.current?.blur();
  };

  if (collapsed)
    return (
      <section className="overlay chat-panel collapsed" aria-label={t('chat.title')}>
        <button type="button" className="chat-toggle" aria-expanded={false} onClick={() => setCollapsed(false)}>
          💬 {t('chat.title')}
          {unread > 0 && <span className="chat-unread">{t('chat.unread', { count: unread })}</span>}
        </button>
        <span className="visually-hidden" role="status">
          {unread > 0 && t('chat.unread', { count: unread })}
        </span>
      </section>
    );

  return (
    <section className="overlay chat-panel" aria-label={t('chat.title')}>
      <div className="chat-tabs" role="tablist">
        {(['all', 'nearby'] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={scope === s} className={scope === s ? 'active' : ''} onClick={() => {
              setScope(s);
              inputRef.current?.focus();
            }}>
            {t(s === 'all' ? 'chat.everyone' : 'chat.nearby')}
          </button>
        ))}
        <button type="button" className="chat-collapse" aria-expanded={true} aria-label={t('chat.collapse')} title={t('chat.collapse')} onClick={() => setCollapsed(true)}>
          ▾
        </button>
      </div>
      <ol className="chat-list" ref={listRef} role="log" aria-label={t('chat.history')}>
        {entries.map((entry) => (
          <ChatLine key={entry.id} entry={entry} />
        ))}
      </ol>
      <form onSubmit={submit}>
        <input
          ref={inputRef}
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          aria-label={t(scope === 'all' ? 'chat.placeholderAll' : 'chat.placeholderNearby')}
          placeholder={t(scope === 'all' ? 'chat.placeholderAll' : 'chat.placeholderNearby')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && inputRef.current?.blur()}
        />
      </form>
    </section>
  );
}

function ChatLine({ entry }: { entry: ChatEntry }) {
  const { t } = useTranslation();
  switch (entry.kind) {
    case 'message':
      return (
        <li className={entry.self ? 'self' : undefined}>
          {entry.scope === 'nearby' && <span className="chat-tag">{t('chat.nearbyTag')}</span>}
          <strong>{entry.nickname}</strong> {entry.text}
        </li>
      );
    case 'joined':
    case 'left':
      return <li className="system">{t(entry.kind === 'joined' ? 'chat.joined' : 'chat.left', { name: entry.nickname })}</li>;
    case 'nobodyNearby':
      return <li className="system">{t('chat.nobodyNearby')}</li>;
  }
}
