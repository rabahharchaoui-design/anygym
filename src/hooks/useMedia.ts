import { useSyncExternalStore } from 'react';

const listOf = (query: string): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;

/** Whether a media query matches now, following changes (a rotation, a resize). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = listOf(query);
      mq?.addEventListener('change', onChange);
      return () => mq?.removeEventListener('change', onChange);
    },
    () => listOf(query)?.matches ?? false,
    () => false,
  );
}
