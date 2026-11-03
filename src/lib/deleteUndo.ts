// Durable delete with Undo (SPEC 0, 2, 13.1). The delete is written right away, so an app kill
// during the Undo window can never bring the item back. The removed record stays in memory for
// the Undo window and until a restore actually lands; Undo writes it back unchanged (same id,
// same order), using the record the delete read in its own transaction. Every write is tracked and a failed write is reported, never swallowed.
// Finish calls close(): no new delete or Undo starts, and it waits until no write is left.
// An Undo whose write failed is UNRESOLVED (PLAN 1.7i): it is kept apart from the running writes,
// never expires (its stored record stays), and close() refuses (UndoUnresolvedError) until a
// retry puts the item back or the user cancels it (cancel: the item stays deleted).
// This is the in-memory half (the toast's Undo while the app runs). The stored half, so an
// accepted Undo survives a kill, is db/tombstones.ts: `restore` accepts the Undo durably before
// writing, and `expire` clears the stored record when the window ends.
import { UNDO_MS } from './undoQueue';

export type DeleteUndo<T> = {
  /**
   * Writes the delete now. Rejects if the write failed (the item is still saved) or after close().
   * `hold` (PLAN 2.0k, a group removal): its Undo window does not start yet; `release` starts it.
   */
  remove: (item: T, opts?: { hold?: boolean }) => Promise<void>;
  /**
   * Starts one shared Undo window now (`ms`, default the manager's) for these held records (PLAN
   * 2.0k): every member of a group stays recoverable for as long as its one Undo is offered.
   */
  release: (ids: readonly string[], ms?: number) => void;
  /** True while every one of these ids can still be put back (a group Undo is offered only then). */
  canUndoAll: (ids: readonly string[]) => boolean;
  /**
   * A group Undo (PLAN 2.0k): refused (undefined, nothing restored) unless every member can still be
   * put back. Every member's window stops, every Undo is accepted (`ops.accept`) before any is
   * written back, then each is restored in order. Rejects when one did not come back: the members
   * not back are unresolved (never expire, Finish refuses) so the Undo sheet can retry them.
   */
  undoAll: (ids: readonly string[]) => Promise<T[] | undefined>;
  /**
   * Writes the removed item back. Resolves with it, or undefined when the Undo window is over or
   * after close(). Rejects if the write failed; the record is kept, so calling undo again retries.
   */
  undo: (id: string) => Promise<T | undefined>;
  /** True while this id can still be put back. */
  canUndo: (id: string) => boolean;
  /** Waits until no delete or undo write is running (writes started meanwhile included). Rejects if one fails. */
  settle: () => Promise<void>;
  /** Finish: refuses new deletes and Undos, then settles. */
  close: () => Promise<void>;
  /** Finish failed: deletes and Undos work again. */
  reopen: () => void;
  /** Writes still running. */
  pending: () => number;
  /** Ids whose Undo was asked for and failed: not put back, not cancelled. */
  unresolved: () => string[];
  /**
   * The user gives up on a failed Undo: the item stays deleted. The stored record's removal is a
   * tracked write: the Undo stays unresolved (Finish refuses) until it lands; rejects if it failed.
   */
  cancel: (id: string) => Promise<void>;
  /**
   * After a restart (PLAN 1.7k): a stored Undo the user asked for that has not landed comes back as
   * unresolved, with the exact record its tombstone holds. No expiry timer: it never expires.
   */
  hydrate: (item: T) => void;
  /** Recovery put the item back on its own: it is no longer unresolved (nothing left to cancel). */
  resolve: (id: string) => void;
};

export const CLOSED = 'Workout is finishing';

/** Finish refused: an Undo the user asked for has not been written back (or cancelled) yet. */
export class UndoUnresolvedError extends Error {
  constructor(readonly ids: string[]) {
    super('An Undo did not finish');
    this.name = 'UndoUnresolvedError';
  }
}

export function createDeleteUndo<T extends { id: string }>(
  ops: {
    /**
     * Deletes the item. When it resolves with the record it deleted (read inside its transaction), Undo
     * writes that one back. `null` (PLAN 2.0i): nothing was deleted (it was already gone, another tab
     * deleted it): no Undo record is kept, so Undo can never reverse that other deletion.
     */
    remove: (item: T) => Promise<T | null | undefined | void>;
    restore: (item: T) => Promise<unknown>;
    /** A group Undo is accepted durably for every member before any is restored (PLAN 2.0k). Failures are ignored (restore accepts again). */
    accept?: (item: T) => Promise<unknown>;
    /** The Undo window ended without an Undo (the stored record can go). Failures are ignored. */
    expire?: (item: T) => Promise<unknown>;
    /** The user cancelled a failed Undo: the stored record goes, the item stays deleted. Failures are ignored. */
    cancel?: (item: T) => Promise<unknown>;
  },
  ms = UNDO_MS,
): DeleteUndo<T> {
  type Record = { item: T; timer?: ReturnType<typeof setTimeout>; restoring: Promise<T> | null; unresolved?: boolean };
  const records = new Map<string, Record>();
  const running = new Set<Promise<unknown>>();
  const lastWrite = new Map<string, Promise<unknown>>();
  let closed = false;

  const track = <R>(id: string, write: Promise<R>): Promise<R> => {
    running.add(write);
    lastWrite.set(id, write);
    const done = () => {
      running.delete(write);
      if (lastWrite.get(id) === write) lastWrite.delete(id);
    };
    write.then(done, done);
    return write;
  };

  /** The Undo window: the record is forgotten after `ms`, unless a restore is on its way. */
  const arm = (rec: Record, id: string, window = ms) => {
    clearTimeout(rec.timer);
    rec.timer = setTimeout(() => {
      if (rec.restoring || rec.unresolved || records.get(id) !== rec) return;
      records.delete(id);
      ops.expire?.(rec.item).catch(() => undefined);
    }, window);
  };
  const forget = (rec: Record, id: string) => {
    clearTimeout(rec.timer);
    records.delete(id);
  };

  const settle = async () => {
    // Loop: an Undo tapped while we wait adds a write after the first snapshot.
    while (running.size) await Promise.all([...running]);
  };

  const api: DeleteUndo<T> = {
    async remove(item, opts) {
      if (closed) throw new Error(CLOSED);
      const rec: Record = { item, restoring: null };
      records.set(item.id, rec);
      if (!opts?.hold) arm(rec, item.id);
      try {
        const gone = await track(item.id, Promise.resolve().then(() => ops.remove(item)));
        // The record as it was saved at the delete, never the caller's possibly stale copy.
        if (gone) rec.item = gone;
        else if (gone === null && !rec.restoring) forget(rec, item.id);
      } catch (err) {
        if (!rec.restoring) forget(rec, item.id);
        throw err;
      }
    },
    undo(id) {
      const rec = records.get(id);
      if (!rec || closed) return Promise.resolve(undefined);
      if (rec.restoring) return rec.restoring;
      // Restore after the delete write lands, so the two never race.
      const before = lastWrite.get(id) ?? Promise.resolve();
      const write = before.then(
        () => ops.restore(rec.item),
        () => ops.restore(rec.item),
      );
      rec.restoring = track(id, write).then(
        () => {
          forget(rec, id);
          return rec.item;
        },
        (err: unknown) => {
          // Kept for a retry of this exact record: unresolved until a retry lands or the user
          // cancels it. It never expires meanwhile, so its stored record is never dropped.
          rec.restoring = null;
          rec.unresolved = true;
          clearTimeout(rec.timer);
          throw err;
        },
      );
      return rec.restoring;
    },
    canUndo: (id) => records.has(id),
    release(ids, window = ms) {
      for (const id of ids) {
        const rec = records.get(id);
        if (rec && !rec.restoring && !rec.unresolved) arm(rec, id, window);
      }
    },
    canUndoAll: (ids) => !closed && ids.every((id) => records.has(id)),
    async undoAll(ids) {
      if (closed || !ids.every((id) => records.has(id))) return undefined;
      const recs = ids.map((id) => records.get(id)!);
      // No member can expire from here on, whatever happens below.
      for (const r of recs) clearTimeout(r.timer);
      if (ops.accept) for (const r of recs) if (!r.restoring) await ops.accept(r.item).catch(() => undefined);
      const back: T[] = [];
      for (const id of ids) {
        try {
          const item = await api.undo(id);
          if (!item) throw new Error('Not put back');
          back.push(item);
        } catch (err) {
          for (const left of ids) {
            const r = records.get(left);
            if (r && !r.restoring) {
              r.unresolved = true;
              clearTimeout(r.timer);
            }
          }
          throw err;
        }
      }
      return back;
    },
    settle,
    async close() {
      closed = true;
      await settle();
      const open = [...records].filter(([, r]) => r.unresolved).map(([id]) => id);
      if (open.length) throw new UndoUnresolvedError(open);
    },
    reopen() {
      closed = false;
    },
    pending: () => running.size,
    unresolved: () => [...records].filter(([, r]) => r.unresolved).map(([id]) => id),
    hydrate(item) {
      const rec = records.get(item.id);
      if (rec) {
        if (!rec.restoring) {
          rec.unresolved = true;
          clearTimeout(rec.timer);
        }
        return;
      }
      records.set(item.id, { item, restoring: null, unresolved: true });
    },
    resolve(id) {
      const rec = records.get(id);
      if (rec && !rec.restoring) forget(rec, id);
    },
    async cancel(id) {
      const rec = records.get(id);
      if (!rec || rec.restoring) return;
      const drop = ops.cancel ?? ops.expire;
      // Forgotten only once the stored record is gone: a failed removal keeps it unresolved.
      if (drop) await track(id, Promise.resolve().then(() => drop(rec.item)));
      forget(rec, id);
    },
  };
  return api;
}
