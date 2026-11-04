import { useEffect } from 'react';
import { bus } from '../game/events';
import type { Chat } from '../net/chat';

/** Shows new nearby chat messages as speech bubbles over the sender's avatar. Renders nothing. */
export function ChatBubbles({ chat }: { chat: Chat }) {
  useEffect(() => {
    // Only messages from now on; history already on screen in the chat panel isn't replayed.
    let seen = chat.list().at(-1)?.id ?? 0;
    return chat.events.on('entries', (entries) => {
      for (const e of entries) {
        if (e.id <= seen) continue;
        if (e.kind === 'message' && e.scope === 'nearby') bus.emit('chat:bubble', { peerId: e.from, self: e.self, text: e.text });
      }
      seen = entries.at(-1)?.id ?? seen;
    });
  }, [chat]);
  return null;
}
