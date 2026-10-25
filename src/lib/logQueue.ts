// Log set writes, owned outside the mounted set card (SPEC 13.3: switching cards mid write can
// never drop or duplicate a set). One queue entry per `${sessionId}:${exerciseId}`:
// - at most one write is in flight per key; a second submit gets the same promise (one set);
// - the id a set is logged with belongs to its pending row (its draft, PLAN 1.7h), so a card that
//   unmounts and remounts during a write, or an app restart, logs the same row with the same id;
// - after a write lands, `landed` runs once (mounted or not), then every mounted consumer hears it.
// Finish closes the workout's queue synchronously (PLAN 1.7h): from that moment no new write
// starts, so nothing can land after Finish counted the sets. A failed Finish reopens it.
// Row claims (PLAN 1.12, 1.7j): a ✓ claims its row's stable identity (the id its pending row is
// logged with, never its displayed position) with one submission. While the claim runs, every
// further ✓ on that row resolves to the same submission. After it landed and until the view shows
// that id among its committed sets, the view is a stale render (the write landed and the drafts
// moved up, but the live query has not delivered the new set yet): every ✓ of that exercise is
// ignored, because a stale row could be the one just logged. Once the view's committed sets hold
// the id, the claim is released, whatever row positions moved meanwhile (checking a later row
// first never leaves another enabled ✓ dead). Never time based. A failed claim is dropped, so ✓
// again or Try again can log the row (with the same id, rowLog.ts).
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
  /**
   * Another write of this workout that Finish must count after (a logged set's type, PLAN 1.7j):
   * refused (null, `write` never runs) once Finish closed the workout; while it runs, `settle`
   * waits for it.
   */
  mutate: <T>(sessionId: string, write: () => Promise<T>) => Promise<T> | null;
  /** Waits until no write of this workout is running (Finish). Never rejects. */
  settle: (sessionId: string) => Promise<void>;
  /** Finish started: no new write of this workout starts (synchronous). */
  close: (sessionId: string) => void;
  /** Finish failed or was refused: writes work again. */
  reopen: (sessionId: string) => void;
  closed: (sessionId: string) => boolean;
  /**
   * Claims the row with stable identity `id` (its draft id) of this key with the submission `start`
   * makes, unless that id is claimed already: then that claim's promise is returned and `start`
   * never runs.
   */
  claim: (key: string, id: string, start: () => Promise<boolean>) => Promise<boolean>;
  /** True while the id's claim runs, or landed and is not released yet. */
  claimed: (key: string, id: string) => boolean;
  /** True while a claim of this key landed and the view has not shown its set yet (a stale render). */
  stale: (key: string) => boolean;
  /**
   * The view's committed sets of this key: claims of ids among them are done. A claim still running
   * is kept, and released the moment it lands.
   */
  release: (key: string, committed: (id: string) => boolean) => void;
};

export const logKey = (sessionId: string, exerciseId: string) => `${sessionId}:${exerciseId}`;

const sessionOf = (key: string) => key.slice(0, key.indexOf(':'));

export function createLogQueue(): LogQueue {
  const inflight = new Map<string, Promise<boolean>>();
  const listeners = new Map<string, Set<Landed>>();
  const shut = new Set<string>();
  const others = new Map<string, Set<Promise<unknown>>>();
  type Claim = { landed: boolean; seen: boolean; promise: Promise<boolean> };
  const claims = new Map<string, Map<string, Claim>>();

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
    mutate(sessionId, write) {
      if (shut.has(sessionId)) return null;
      const set = others.get(sessionId) ?? new Set<Promise<unknown>>();
      others.set(sessionId, set);
      const p = write();
      const done = p.then(
        () => undefined,
        () => undefined,
      );
      set.add(done);
      void done.then(() => {
        set.delete(done);
        if (!set.size && others.get(sessionId) === set) others.delete(sessionId);
      });
      return p;
    },
    async settle(sessionId) {
      for (;;) {
        const running: Array<Promise<unknown>> = [...inflight].filter(([k]) => sessionOf(k) === sessionId).map(([, p]) => p);
        running.push(...(others.get(sessionId) ?? []));
        if (!running.length) return;
        await Promise.all(running);
      }
    },
    close: (sessionId) => void shut.add(sessionId),
    reopen: (sessionId) => void shut.delete(sessionId),
    closed: (sessionId) => shut.has(sessionId),
    claim(key, id, start) {
      const rows = claims.get(key) ?? new Map<string, Claim>();
      claims.set(key, rows);
      const held = rows.get(id);
      if (held) return held.promise;
      const entry: Claim = { landed: false, seen: false, promise: Promise.resolve(false) };
      rows.set(id, entry);
      const drop = () => {
        if (rows.get(id) === entry) rows.delete(id);
        if (!rows.size && claims.get(key) === rows) claims.delete(key);
      };
      entry.promise = (async () => {
        try {
          const ok = await start();
          // Already shown as committed while it ran: done at once.
          if (ok && !entry.seen) entry.landed = true;
          else drop();
          return ok;
        } catch {
          drop();
          return false;
        }
      })();
      return entry.promise;
    },
    claimed: (key, id) => claims.get(key)?.has(id) ?? false,
    stale: (key) => [...(claims.get(key)?.values() ?? [])].some((c) => c.landed),
    release(key, committed) {
      const rows = claims.get(key);
      if (!rows) return;
      for (const [id, c] of rows) {
        if (!committed(id)) continue;
        if (c.landed) rows.delete(id);
        else c.seen = true;
      }
      if (!rows.size) claims.delete(key);
    },
  };
}

/** The app's one queue: every mounted card of a workout shares it. */
export const logQueue = createLogQueue();
