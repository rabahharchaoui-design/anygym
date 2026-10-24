// Log set writes, owned outside the mounted set card (SPEC 13.3: switching cards mid write can
// never drop or duplicate a set). One queue entry per `${sessionId}:${exerciseId}`:
// - the id the next set is logged with lives here, so a card that unmounts and remounts during a
//   write sees the same id, never a stale one;
// - at most one write is in flight per key; a second submit gets the same promise (one set);
// - after a write lands, a fresh id is made here and published to every mounted consumer.
// A failed write keeps the id, so a retry is still double tap safe.
import { newId as defaultNewId } from '../db/ids';

export type Rotated = (nextId: string, loggedId: string) => void;

export type LogQueue = {
  /** The id the next set of this key is logged with. `seed` (a saved draft's id) is used only when the key has none yet. */
  current: (key: string, seed?: string) => string;
  /**
   * Runs `write` with the current id, unless one is in flight: then that write's promise is
   * returned. When it lands, `landed` runs once (mounted or not) with the fresh id, before the
   * subscribers hear about it.
   */
  submit: (key: string, write: (id: string) => Promise<boolean>, landed?: Rotated) => Promise<boolean>;
  /** True while a write of this key is running. */
  pending: (key: string) => boolean;
  /** Called with the fresh id after each landed write of this key. Returns the unsubscribe. */
  subscribe: (key: string, fn: Rotated) => () => void;
  /** Waits until no write of this workout is running (Finish). Never rejects. */
  settle: (sessionId: string) => Promise<void>;
  /** Forgets every id of a workout (after Finish). */
  clearSession: (sessionId: string) => void;
};

export const logKey = (sessionId: string, exerciseId: string) => `${sessionId}:${exerciseId}`;

export function createLogQueue(makeId: () => string = defaultNewId): LogQueue {
  const ids = new Map<string, string>();
  const inflight = new Map<string, Promise<boolean>>();
  const listeners = new Map<string, Set<Rotated>>();
  const ofSession = (sessionId: string) => (key: string) => key.startsWith(`${sessionId}:`);

  const current = (key: string, seed?: string) => {
    let id = ids.get(key);
    if (id === undefined) {
      id = seed || makeId();
      ids.set(key, id);
    }
    return id;
  };

  return {
    current,
    submit(key, write, landed) {
      const running = inflight.get(key);
      if (running) return running;
      const id = current(key);
      const run = (async () => {
        try {
          const ok = await write(id);
          if (ok && ids.get(key) === id) {
            const next = makeId();
            ids.set(key, next);
            landed?.(next, id);
            for (const fn of [...(listeners.get(key) ?? [])]) fn(next, id);
          }
          return ok;
        } catch {
          return false;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, run);
      return run;
    },
    pending: (key) => inflight.has(key),
    subscribe(key, fn) {
      const set = listeners.get(key) ?? new Set<Rotated>();
      set.add(fn);
      listeners.set(key, set);
      return () => {
        set.delete(fn);
        if (!set.size) listeners.delete(key);
      };
    },
    async settle(sessionId) {
      const mine = ofSession(sessionId);
      for (;;) {
        const running = [...inflight].filter(([k]) => mine(k)).map(([, p]) => p);
        if (!running.length) return;
        await Promise.all(running);
      }
    },
    clearSession(sessionId) {
      const mine = ofSession(sessionId);
      for (const k of [...ids.keys()]) if (mine(k)) ids.delete(k);
    },
  };
}

/** The app's one queue: every mounted card of a workout shares it. */
export const logQueue = createLogQueue();
