import { useCallback, useSyncExternalStore } from 'react';
import type { Emitter } from '../lib/emitter';

/** Subscribes a component to one event of an Emitter and reads a stable snapshot. */
export function useEmitterValue<E extends object, K extends keyof E, T>(emitter: Emitter<E>, event: K, read: () => T): T {
  const subscribe = useCallback((onChange: () => void) => emitter.on(event, onChange), [emitter, event]);
  return useSyncExternalStore(subscribe, read);
}
