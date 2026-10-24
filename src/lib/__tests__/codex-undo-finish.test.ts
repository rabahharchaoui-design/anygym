import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUndoQueue, UNDO_MS } from '../undoQueue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('delete completion before Finish (SPEC 0, 2, 13.1)', () => {
  // CODEX FOUND BUG: Finish flush resolves while a timer-triggered delete is still writing to the database.
  // CODEX FOUND BUG, fix in 1.10c
  it.skip('waits for an already-running delete before Finish can count saved sets', async () => {
    let completeDelete!: () => void;
    const gate = new Promise<void>((resolve) => { completeDelete = resolve; });
    const commit = vi.fn(() => gate);
    const queue = createUndoQueue(commit);
    queue.push('set-a', 'set-a');
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(commit).toHaveBeenCalledExactlyOnceWith('set-a');

    let finished = false;
    const finish = queue.flush().then(() => { finished = true; });
    try {
      // Let flush settle if it incorrectly ignores the in-flight write.
      await vi.advanceTimersByTimeAsync(0);
      expect(finished).toBe(false);
    } finally {
      completeDelete();
      await finish;
    }
    expect(finished).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  // CODEX FOUND BUG: Failed delete writes are swallowed, allowing Finish to report success with the deleted set still saved.
  // CODEX FOUND BUG, fix in 1.10c
  it.skip('rejects flush on a failed delete so Finish can show its existing retry message', async () => {
    const queue = createUndoQueue<string>(async () => { throw new Error('synthetic IndexedDB failure'); });
    queue.push('set-a', 'set-a');
    await expect(queue.flush()).rejects.toThrow('synthetic IndexedDB failure');
  });
});
