import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';

/**
 * A Dexie live query. `ready` turns true after the first result, so screens can tell
 * "still loading" from "not found" and never flash the wrong state.
 */
export function useLive<T>(query: () => Promise<T>, deps: unknown[]): { value: T | undefined; ready: boolean } {
  const [state, setState] = useState<{ value: T | undefined; ready: boolean }>({ value: undefined, ready: false });
  useEffect(() => {
    let alive = true;
    const sub = liveQuery(query).subscribe({
      next: (value) => alive && setState({ value, ready: true }),
      error: () => alive && setState((s) => ({ ...s, ready: true })),
    });
    return () => {
      alive = false;
      sub.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
