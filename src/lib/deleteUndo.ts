// Durable delete with Undo (SPEC 0, 2, 13.1). The delete is written right away, so an app kill
// during the Undo window can never bring the item back. The removed record stays in memory for
// the Undo window and until a restore actually lands; Undo writes it back unchanged (same id,
// same order). Every write is tracked and a failed write is reported, never swallowed.
// Finish calls close(): no new delete or Undo starts, and it waits until no write is left.
import { UNDO_MS } from './undoQueue';

export type DeleteUndo<T> = {
  /** Writes the delete now. Rejects if the write failed (the item is still saved) or after close(). */
  remove: (item: T) => Promise<void>;
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
};

export const CLOSED = 'Workout is finishing';

export function createDeleteUndo<T extends { id: string }>(
  ops: { remove: (item: T) => Promise<unknown>; restore: (item: T) => Promise<unknown> },
  ms = UNDO_MS,
): DeleteUndo<T> {
  type Record = { item: T; timer?: ReturnType<typeof setTimeout>; restoring: Promise<T> | null };
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
  const arm = (rec: Record, id: string) => {
    clearTimeout(rec.timer);
    rec.timer = setTimeout(() => {
      if (!rec.restoring) records.delete(id);
    }, ms);
  };
  const forget = (rec: Record, id: string) => {
    clearTimeout(rec.timer);
    records.delete(id);
  };

  const settle = async () => {
    // Loop: an Undo tapped while we wait adds a write after the first snapshot.
    while (running.size) await Promise.all([...running]);
  };

  return {
    async remove(item) {
      if (closed) throw new Error(CLOSED);
      const rec: Record = { item, restoring: null };
      records.set(item.id, rec);
      arm(rec, item.id);
      try {
        await track(item.id, Promise.resolve().then(() => ops.remove(item)));
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
          // Kept for a retry of this exact record, with a fresh Undo window.
          rec.restoring = null;
          arm(rec, id);
          throw err;
        },
      );
      return rec.restoring;
    },
    canUndo: (id) => records.has(id),
    settle,
    async close() {
      closed = true;
      await settle();
    },
    reopen() {
      closed = false;
    },
    pending: () => running.size,
  };
}
