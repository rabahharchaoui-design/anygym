import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import { getActiveGym, startDb } from './bootstrap';
import type { Gym } from './types';

/**
 * The active gym once the database is ready; undefined until then or if storage is unavailable.
 * Live: any write to the gyms table (e.g. a first use answer) re-renders with the new record.
 */
export function useActiveGym(): Gym | undefined {
  const [gym, setGym] = useState<Gym>();
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
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
      () => {},
    );
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);
  return gym;
}
