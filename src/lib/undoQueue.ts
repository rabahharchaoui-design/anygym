// "Set deleted · Undo" (SPEC 13.1). A delete is held for a few seconds, then committed. Undo drops
// it; flush commits everything now (leaving the screen, finishing the workout).

export const UNDO_MS = 5000;

export type UndoQueue<T> = {
  /** Holds `item`; commits it after `ms` unless undone or flushed first. */
  push: (key: string, item: T) => void;
  /** Cancels a held item and returns it, or undefined if it already committed. */
  undo: (key: string) => T | undefined;
  /** Commits every held item now. */
  flush: () => Promise<void>;
  pending: () => string[];
};

export function createUndoQueue<T>(commit: (item: T) => Promise<unknown>, ms = UNDO_MS): UndoQueue<T> {
  const held = new Map<string, { item: T; timer: ReturnType<typeof setTimeout> }>();

  const run = async (key: string) => {
    // Only called for held keys: the timer is cleared on undo and flush removes each key once.
    const entry = held.get(key)!;
    clearTimeout(entry.timer);
    held.delete(key);
    try {
      await commit(entry.item);
    } catch {
      /* the set stays; nothing is lost */
    }
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
      await Promise.all([...held.keys()].map(run));
    },
    pending: () => [...held.keys()],
  };
}
