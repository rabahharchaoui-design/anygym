// Log set writes, owned outside the mounted set card (SPEC 13.3: switching cards mid write can
// never drop or duplicate a set). One queue entry per `${sessionId}:${exerciseId}`:
// - at most one write is in flight per key; a second submit gets the same promise (one set);
// - the id a set is logged with belongs to its pending row (its draft, PLAN 1.7h), so a card that
//   unmounts and remounts during a write, or an app restart, logs the same row with the same id;
// - after a write lands, `landed` runs once (mounted or not), then every mounted consumer hears it.
// Finish closes the workout's queue synchronously (PLAN 1.7h): from that moment no new write
// starts, so nothing can land after Finish counted the sets. A failed Finish reopens it.
// Row claims (PLAN 1.12, the double tap race): a ✓ on a row claims that row (its set number) with
// one submission. While the claim runs, and after it landed until the view shows the row as logged,
// every further ✓ on that row resolves to the same submission. Never time based: a stale render
// (the write landed and the drafts moved up, but the live query has not delivered the new set yet)
// still shows the row as pending, and its ✓ must not log it a second time. A failed claim is
// dropped, so ✓ again or Try again can log the row (with the same id, rowLog.ts).
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
  /**
   * Claims row `row` (0 based set number) of this key with the submission `start` makes, unless the
   * row is claimed already: then that claim's promise is returned and `start` never runs.
   */
  claim: (key: string, row: number, start: () => Promise<boolean>) => Promise<boolean>;
  /** True while the row's claim runs, or landed and is not released yet. */
  claimed: (key: string, row: number) => boolean;
  /** The view shows `logged` sets of this key: landed claims of rows below that number are done. */
  release: (key: string, logged: number) => void;
};

export const logKey = (sessionId: string, exerciseId: string) => `${sessionId}:${exerciseId}`;

const sessionOf = (key: string) => key.slice(0, key.indexOf(':'));

export function createLogQueue(): LogQueue {
  const inflight = new Map<string, Promise<boolean>>();
  const listeners = new Map<string, Set<Landed>>();
  const shut = new Set<string>();
  const claims = new Map<string, Map<number, { landed: boolean; promise: Promise<boolean> }>>();

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
    claim(key, row, start) {
      const rows = claims.get(key) ?? new Map();
      claims.set(key, rows);
      const held = rows.get(row);
      if (held) return held.promise;
      const entry = { landed: false, promise: Promise.resolve(false) };
      rows.set(row, entry);
      const drop = () => {
        if (rows.get(row) === entry) rows.delete(row);
        if (!rows.size && claims.get(key) === rows) claims.delete(key);
      };
      entry.promise = (async () => {
        try {
          const ok = await start();
          if (ok) entry.landed = true;
          else drop();
          return ok;
        } catch {
          drop();
          return false;
        }
      })();
      return entry.promise;
    },
    claimed: (key, row) => claims.get(key)?.has(row) ?? false,
    release(key, logged) {
      const rows = claims.get(key);
      if (!rows) return;
      for (const [row, c] of rows) if (c.landed && row < logged) rows.delete(row);
      if (!rows.size) claims.delete(key);
    },
  };
}

/** The app's one queue: every mounted card of a workout shares it. */
export const logQueue = createLogQueue();
