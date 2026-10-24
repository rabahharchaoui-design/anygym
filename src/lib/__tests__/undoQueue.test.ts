import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDO_MS, createUndoQueue } from '../undoQueue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('undo queue (Set deleted · Undo)', () => {
  it('commits after 5 s', async () => {
    expect(UNDO_MS).toBe(5000);
    const commit = vi.fn(async () => {});
    const q = createUndoQueue<string>(commit);
    q.push('a', 'A');
    q.push('a', 'A again'); // a second push of the same key is ignored
    await vi.advanceTimersByTimeAsync(4999);
    expect(commit).not.toHaveBeenCalled();
    expect(q.pending()).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledExactlyOnceWith('A');
    expect(q.pending()).toEqual([]);
  });

  it('undo cancels the commit and returns the item', async () => {
    const commit = vi.fn(async () => {});
    const q = createUndoQueue<string>(commit);
    q.push('a', 'A');
    expect(q.undo('a')).toBe('A');
    expect(q.undo('a')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(commit).not.toHaveBeenCalled();
  });

  it('flush commits everything now (leaving the screen) and only once', async () => {
    const commit = vi.fn(async () => {});
    const q = createUndoQueue<string>(commit);
    q.push('a', 'A');
    q.push('b', 'B');
    await q.flush();
    expect(commit.mock.calls).toEqual([['A'], ['B']]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(q.undo('a')).toBeUndefined();
  });

  it('a failed commit is reported by flush, never swallowed', async () => {
    const q = createUndoQueue<string>(async () => {
      throw new Error('db');
    }, 10);
    q.push('a', 'A');
    await expect(q.flush()).rejects.toThrow('db');
    // Reported once: the next flush is clean.
    await expect(q.flush()).resolves.toBeUndefined();
  });

  it('a commit that failed on its timer is reported by the next flush', async () => {
    const q = createUndoQueue<string>(async () => {
      throw new Error('timer db');
    }, 10);
    q.push('a', 'A');
    await vi.advanceTimersByTimeAsync(10);
    expect(q.pending()).toEqual([]);
    await expect(q.flush()).rejects.toThrow('timer db');
  });

  it('flush waits for a commit already running', async () => {
    let release!: () => void;
    const commit = vi.fn(() => new Promise<void>((r) => (release = r)));
    const q = createUndoQueue<string>(commit, 10);
    q.push('a', 'A');
    await vi.advanceTimersByTimeAsync(10);
    let done = false;
    const f = q.flush().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    release();
    await f;
    expect(done).toBe(true);
  });
});
