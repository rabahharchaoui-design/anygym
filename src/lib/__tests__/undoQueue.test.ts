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

  it('a failed commit is swallowed', async () => {
    const q = createUndoQueue<string>(async () => {
      throw new Error('db');
    }, 10);
    q.push('a', 'A');
    await expect(q.flush()).resolves.toBeUndefined();
  });
});
