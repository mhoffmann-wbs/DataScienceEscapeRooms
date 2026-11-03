import type { Presence } from '../net/presence';
import type { Profile } from '../player/profile';

/** Display name for a peer id, falling back to an ellipsis for peers not introduced yet. */
export function nameOf(id: string, presence: Presence, self: Profile): string {
  return id === presence.selfId ? self.nickname : (presence.get(id)?.nickname ?? '…');
}
