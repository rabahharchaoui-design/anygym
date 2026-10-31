// Reduced motion, read live (2.0d critic): the setting can change while a sheet is open (Control
// Centre, Settings in split view). motion's useReducedMotion reads it once at mount; this follows
// the media query's change events.
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

const media = (): MediaQueryList | null => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY) : null);

function subscribe(onChange: () => void): () => void {
  const m = media();
  if (!m) return () => {};
  // Safari before 14 only has addListener.
  if (typeof m.addEventListener === 'function') {
    m.addEventListener('change', onChange);
    return () => m.removeEventListener('change', onChange);
  }
  m.addListener(onChange);
  return () => m.removeListener(onChange);
}

const read = (): boolean => media()?.matches ?? false;

/** True while the user asks for reduced motion; re-renders when that changes. */
export function useReducedMotionLive(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
