import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../../db/schema';
import { recoverDeletes } from '../../db/tombstones';
import { CLOSED, createDeleteUndo } from '../deleteUndo';

// PLAN 3.6h2 (3): the coverage run holds src/lib/deleteUndo.ts and src/db/tombstones.ts to 100%;
// these are the group removal and group Undo paths no other test walked.

type Item = { id: string };
const a: Item = { id: 'a' };
const b: Item = { id: 'b' };

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('deleteUndo group paths', () => {
  it('removeAll after close is refused and touches nothing', async () => {
    const removed: string[] = [];
    const d = createDeleteUndo<Item>({ remove: async (i) => void removed.push(i.id), restore: async () => undefined });
    await d.close();
    await expect(d.removeAll([a])).rejects.toThrow(CLOSED);
    expect(removed).toEqual([]);
    expect(d.canUndoAll([])).toBe(false);
  });

  it('removeAll without an after step leaves out an item another tab already deleted', async () => {
    const d = createDeleteUndo<Item>({ remove: async (i) => (i.id === 'b' ? null : i), restore: async () => undefined });
    expect(await d.removeAll([a, b])).toEqual([a]);
    expect(d.canUndo('a')).toBe(true);
    expect(d.canUndo('b')).toBe(false);
  });

  it('removeAll rolls back what it removed when a later removal fails', async () => {
    const restored: string[] = [];
    const d = createDeleteUndo<Item>({
      remove: async (i) => {
        if (i.id === 'b') throw new Error('disk full');
        return i;
      },
      restore: async (i) => void restored.push(i.id),
    });
    await expect(d.removeAll([a, b])).rejects.toThrow('disk full');
    expect(restored).toEqual(['a']);
    expect(d.canUndo('a')).toBe(false);
  });

  it('a failed group Undo marks only the members not already on their way back', async () => {
    const gate = deferred();
    const d = createDeleteUndo<Item>({
      remove: async (i) => i,
      restore: async (i) => {
        if (i.id === 'b') await gate.promise;
      },
    });
    await d.removeAll([a, b]);
    const single = d.undo('b');
    await expect(
      d.undoAll(['a', 'b'], async () => {
        throw new Error('exercise did not come back');
      }),
    ).rejects.toThrow('exercise did not come back');
    expect(d.unresolved()).toEqual(['a']);
    gate.resolve();
    expect(await single).toEqual(b);
  });

  it('a group Undo whose member was put back on its own meanwhile says so and accepts only the others', async () => {
    const gate = deferred();
    const accepted: string[] = [];
    const d = createDeleteUndo<Item>({
      remove: async (i) => i,
      restore: async (i) => {
        if (i.id === 'a') await gate.promise;
      },
      accept: async (i) => void accepted.push(i.id),
    });
    await d.removeAll([a, b]);
    const single = d.undo('a');
    await expect(
      d.undoAll(['a', 'b'], async () => {
        gate.resolve();
        await single;
      }),
    ).rejects.toThrow('Not put back');
    expect(accepted).toEqual(['b']);
  });

  it('release starts the default window only for held records still waiting', async () => {
    const d = createDeleteUndo<Item>({ remove: async (i) => i, restore: async () => undefined }, 60_000);
    await d.removeAll([a]);
    d.release(['a', 'missing']);
    expect(d.canUndo('a')).toBe(true);
    await d.close();
  });

  it('a group Undo whose later member fails leaves the restored one alone', async () => {
    const d = createDeleteUndo<Item>({
      remove: async (i) => i,
      restore: async (i) => {
        if (i.id === 'b') throw new Error('write failed');
      },
    });
    await d.removeAll([a, b]);
    await expect(d.undoAll(['a', 'b'])).rejects.toThrow('write failed');
    expect(d.canUndo('a')).toBe(false);
    expect(d.unresolved()).toEqual(['b']);
  });
});

describe('recoverDeletes with nothing stored', () => {
  let db: AnyGymDB | undefined;
  afterEach(async () => {
    await db?.delete();
  });
  it('returns an empty recovery without reading the workout', async () => {
    db = new AnyGymDB('anygym-recover-empty');
    await db.open();
    expect(await recoverDeletes('none', db)).toEqual({ restored: [], expired: [], failed: [] });
  });
});
