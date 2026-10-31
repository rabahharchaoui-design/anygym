import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { getActiveGym, startDb } from './bootstrap';
import type { Gym } from './types';

const RETRIES = 4;

/**
 * The active gym once the database is ready; undefined until then or if storage is unavailable.
 * Live: any write to the gyms table (e.g. a first use answer) re-renders with the new record.
 */
export function useActiveGym(): Gym | undefined {
  const [gym, setGym] = useState<Gym>();
  // Bumped to run the start again after it failed (PLAN 2.0f): a few timed retries, and whenever
  // the app comes back to the front.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    startDb().then(
      (g) => {
        if (!alive) return;
        setGym(g);
        const sub = liveQuery(() => getActiveGym()).subscribe({
          next: (next) => alive && next && setGym(next),
          error: () => {},
        });
        unsubscribe = () => sub.unsubscribe();
      },
      () => {
        if (!alive || attempt >= RETRIES) return;
        retry = setTimeout(() => alive && setAttempt((n) => n + 1), 1000 * 2 ** attempt);
      },
    );
    const visible = () => {
      if (document.visibilityState === 'visible' && !unsubscribe && alive) setAttempt((n) => n + 1);
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false;
      if (retry) clearTimeout(retry);
      document.removeEventListener('visibilitychange', visible);
      unsubscribe?.();
    };
  }, [attempt]);
  return gym;
}
