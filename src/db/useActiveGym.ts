import { useEffect, useState } from 'react';
import { startDb } from './bootstrap';
import type { Gym } from './types';

/** The active gym once the database is ready; undefined until then or if storage is unavailable. */
export function useActiveGym(): Gym | undefined {
  const [gym, setGym] = useState<Gym>();
  useEffect(() => {
    let alive = true;
    startDb().then(
      (g) => alive && setGym(g),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, []);
  return gym;
}
