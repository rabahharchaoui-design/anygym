import { useCallback, useEffect, useState } from 'react';
import { LIVE_START, retrying, subscribeLive, type LiveState } from '../lib/liveState';

export type Live<T> = LiveState<T> & { retry: () => void };

/**
 * A Dexie live query. `ready` turns true after the first result, so screens can tell "still
 * loading" from "not found". A failed read sets `error` (the last good `data` is kept) and
 * `retry` starts a new subscription (PLAN 1.7f).
 */
export function useLive<T>(query: () => Promise<T>, deps: unknown[]): Live<T> {
  const [state, setState] = useState<LiveState<T>>(LIVE_START);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    const stop = subscribeLive(query, (next) => alive && setState(next));
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);
  const retry = useCallback(() => {
    setState(retrying);
    setAttempt((a) => a + 1);
  }, []);
  return { ...state, retry };
}
