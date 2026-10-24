// "Set deleted · Undo" (SPEC 13.1). Holds an item for a few seconds, then commits it. Undo drops
// it; flush commits everything now and waits for every commit, including ones already running.
// A failed commit is never swallowed: flush rejects with it, so the caller can say so and retry.

export const UNDO_MS = 5000;

export type UndoQueue<T> = {
  /** Holds `item`; commits it after `ms` unless undone or flushed first. */
  push: (key: string, item: T) => void;
  /** Cancels a held item and returns it, or undefined if it already committed. */
  undo: (key: string) => T | undefined;
  /** Commits every held item now and waits for every running commit. Rejects if any commit failed. */
  flush: () => Promise<void>;
  pending: () => string[];
};

export function createUndoQueue<T>(commit: (item: T) => Promise<unknown>, ms = UNDO_MS): UndoQueue<T> {
  const held = new Map<string, { item: T; timer: ReturnType<typeof setTimeout> }>();
  const running = new Set<Promise<void>>();
  /** Failures of commits that ran on their timer, reported by the next flush. */
  const failed: unknown[] = [];

  const run = (key: string): Promise<void> => {
    // Only called for held keys: the timer is cleared on undo and flush removes each key once.
    const entry = held.get(key)!;
    clearTimeout(entry.timer);
    held.delete(key);
    const write: Promise<void> = Promise.resolve()
      .then(() => commit(entry.item))
      .then(
        () => {
          running.delete(write);
        },
        (err: unknown) => {
          running.delete(write);
          failed.push(err);
        },
      );
    running.add(write);
    return write;
  };

  return {
    push(key, item) {
      if (held.has(key)) return;
      held.set(key, { item, timer: setTimeout(() => void run(key), ms) });
    },
    undo(key) {
      const entry = held.get(key);
      if (!entry) return undefined;
      clearTimeout(entry.timer);
      held.delete(key);
      return entry.item;
    },
    async flush() {
      [...held.keys()].forEach(run);
      await Promise.all([...running]);
      if (failed.length) throw failed.splice(0)[0];
    },
    pending: () => [...held.keys()],
  };
}
