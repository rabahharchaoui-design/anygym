// Log set writes, owned outside the mounted set card (SPEC 13.3: switching cards mid write can
// never drop or duplicate a set). One queue entry per `${sessionId}:${exerciseId}`:
// - at most one write is in flight per key; a second submit gets the same promise (one set);
// - the id a set is logged with belongs to its pending row (its draft, PLAN 1.7h), so a card that
//   unmounts and remounts during a write, or an app restart, logs the same row with the same id;
// - after a write lands, `landed` runs once (mounted or not), then every mounted consumer hears it.
// Finish closes the workout's queue synchronously (PLAN 1.7h): from that moment no new write
// starts, so nothing can land after Finish counted the sets. A failed Finish reopens it.
// Failed writes are not tracked here: the row's draft keeps its `submitted` mark until a retry
// lands or the user discards it (screens/workout/rowLog.ts), which survives a reload.

export type Landed = (loggedId: string) => void;

export type LogQueue = {
  /**
   * Runs `write`, unless one of this key is in flight: then that write's promise is returned.
   * When it lands (true), `landed` runs once before the subscribers hear about it. Resolves false
   * when the write failed or threw, or without writing when the workout's queue is closed.
   */
  submit: (key: string, id: string, write: (id: string) => Promise<boolean>, landed?: Landed) => Promise<boolean>;
  /** True while a write of this key is running. */
  pending: (key: string) => boolean;
  /** Called with the logged id after each landed write of this key. Returns the unsubscribe. */
  subscribe: (key: string, fn: Landed) => () => void;
  /** Waits until no write of this workout is running (Finish). Never rejects. */
  settle: (sessionId: string) => Promise<void>;
  /** Finish started: no new write of this workout starts (synchronous). */
  close: (sessionId: string) => void;
  /** Finish failed or was refused: writes work again. */
  reopen: (sessionId: string) => void;
  closed: (sessionId: string) => boolean;
};

export const logKey = (sessionId: string, exerciseId: string) => `${sessionId}:${exerciseId}`;

const sessionOf = (key: string) => key.slice(0, key.indexOf(':'));

export function createLogQueue(): LogQueue {
  const inflight = new Map<string, Promise<boolean>>();
  const listeners = new Map<string, Set<Landed>>();
  const shut = new Set<string>();

  return {
    submit(key, id, write, landed) {
      const running = inflight.get(key);
      if (running) return running;
      if (shut.has(sessionOf(key))) return Promise.resolve(false);
      const run = (async () => {
        try {
          const ok = await write(id);
          if (ok) {
            landed?.(id);
            for (const fn of [...(listeners.get(key) ?? [])]) fn(id);
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
      const set = listeners.get(key) ?? new Set<Landed>();
      set.add(fn);
      listeners.set(key, set);
      return () => {
        set.delete(fn);
        if (!set.size) listeners.delete(key);
      };
    },
    async settle(sessionId) {
      for (;;) {
        const running = [...inflight].filter(([k]) => sessionOf(k) === sessionId).map(([, p]) => p);
        if (!running.length) return;
        await Promise.all(running);
      }
    },
    close: (sessionId) => void shut.add(sessionId),
    reopen: (sessionId) => void shut.delete(sessionId),
    closed: (sessionId) => shut.has(sessionId),
  };
}

/** The app's one queue: every mounted card of a workout shares it. */
export const logQueue = createLogQueue();
