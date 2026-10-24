import { useCallback, useRef } from 'react';

/** Toggles ignore a second tap within this window, so a double tap never undoes itself (SPEC 13.3). */
export const TAP_GUARD_MS = 350;

/** Wraps a handler so repeat calls within `ms` are dropped. */
export function useTapGuard<A extends unknown[]>(fn: (...args: A) => void, ms = TAP_GUARD_MS) {
  const last = useRef(-Infinity);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback(
    (...args: A) => {
      const now = performance.now();
      if (now - last.current < ms) return;
      last.current = now;
      fnRef.current(...args);
    },
    [ms],
  );
}
