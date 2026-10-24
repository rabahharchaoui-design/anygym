// A Dexie live query as plain state (PLAN 1.7f), kept apart from React so it is unit tested.
// A failed read is an error, never a false empty result, and the last good data is kept.
import { liveQuery } from 'dexie';

export type LiveState<T> = {
  /** The last good result (kept when a later read fails). */
  data: T | undefined;
  /** True once the first result or error arrived: "still loading" vs "not found". */
  ready: boolean;
  /** The read failed; null when the last read worked. */
  error: unknown;
};

export const LIVE_START: LiveState<never> = { data: undefined, ready: false, error: null };

/**
 * TEST ONLY seam: Playwright sets `window.__anygymFailReads = true` to make every live read fail,
 * so the error states can be proved. Nothing in the app ever sets it.
 */
export function readsFailing(): boolean {
  return (globalThis as { __anygymFailReads?: unknown }).__anygymFailReads === true;
}

/**
 * Subscribe `query` and report each new state through `update`. A Dexie live query stops after an
 * error; call this again (retry) to start a new subscription. Returns the unsubscribe.
 */
export function subscribeLive<T>(query: () => Promise<T>, update: (next: (prev: LiveState<T>) => LiveState<T>) => void): () => void {
  const read = (): Promise<T> => {
    if (readsFailing()) return Promise.reject(new Error('Reads failing (test seam)'));
    try {
      return query();
    } catch (error) {
      // A read that throws before it returns a promise (e.g. a missing table) is an error too.
      return Promise.reject(error);
    }
  };
  const sub = liveQuery(read).subscribe({
    next: (data) => update(() => ({ data, ready: true, error: null })),
    error: (error: unknown) => update((prev) => ({ data: prev.data, ready: true, error: error ?? new Error('Read failed') })),
  });
  return () => sub.unsubscribe();
}

/** Retry: clear the error and keep the last good data; with none yet it is loading again, not empty. */
export function retrying<T>(prev: LiveState<T>): LiveState<T> {
  return { data: prev.data, ready: prev.data !== undefined, error: null };
}
