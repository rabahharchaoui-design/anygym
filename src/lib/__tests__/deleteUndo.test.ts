import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../../db/schema';
import type { Load, WorkoutSet } from '../../db/types';
import { deleteSet, finishWorkout, logSet, restoreSet, setsOf, startWorkout } from '../../db/workouts';
import { CLOSED, createDeleteUndo } from '../deleteUndo';
import { UNDO_MS } from '../undoQueue';

// PLAN 1.10c fix 3: deletes are durable at once, Undo puts back the same record, failures are
// reported, and Finish waits for every write.

const bar: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-delete-undo-${n++}`);
  await db.open();
});
afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
});

async function threeSets() {
  const s = await startWorkout('g', db, 1);
  for (const id of ['a', 'b', 'c']) await logSet({ id, sessionId: s.id, exerciseId: 'squat', reps: 10, load: bar }, db);
  return { session: s, sets: await setsOf(s.id, db) };
}

const ops = () => ({ remove: (s: WorkoutSet) => deleteSet(s.id, db), restore: (s: WorkoutSet) => restoreSet(s, db) });

describe('createDeleteUndo with Dexie', () => {
  it('writes the delete immediately, before any Undo window ends (an app kill keeps it deleted)', async () => {
    const { session, sets } = await threeSets();
    const d = createDeleteUndo<WorkoutSet>(ops());
    await d.remove(sets[1]!);
    expect((await setsOf(session.id, db)).map((s) => s.id)).toEqual(['a', 'c']);
    // A fresh connection (the app reopened) sees the same thing.
    const reopened = new AnyGymDB(db.name);
    expect((await setsOf(session.id, reopened)).map((s) => s.id)).toEqual(['a', 'c']);
    reopened.close();
    expect(d.canUndo('b')).toBe(true);
  });

  it('Undo re-inserts the same record: same id, same order, same load', async () => {
    const { session, sets } = await threeSets();
    const d = createDeleteUndo<WorkoutSet>(ops());
    await d.remove(sets[1]!);
    expect(await d.undo('b')).toEqual(sets[1]);
    expect(await setsOf(session.id, db)).toEqual(sets);
    expect(d.canUndo('b')).toBe(false);
    expect(await d.undo('b')).toBeUndefined();
  });

  it('Undo right after the tap waits for the delete write, then restores', async () => {
    const { session, sets } = await threeSets();
    const d = createDeleteUndo<WorkoutSet>(ops());
    const removing = d.remove(sets[0]!);
    const undoing = d.undo('a');
    await Promise.all([removing, undoing]);
    expect(await setsOf(session.id, db)).toEqual(sets);
  });

  it('the Undo window closes after 5 s; the delete stays', async () => {
    vi.useFakeTimers();
    const removed: string[] = [];
    const d = createDeleteUndo<{ id: string }>({ remove: async (s) => void removed.push(s.id), restore: async () => {} });
    await d.remove({ id: 'x' });
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(d.canUndo('x')).toBe(false);
    expect(await d.undo('x')).toBeUndefined();
    expect(removed).toEqual(['x']);
  });

  it('a failed delete rejects (the UI shows the set again with a retry) and leaves nothing to undo', async () => {
    const d = createDeleteUndo<{ id: string }>({
      remove: async () => {
        throw new Error('disk full');
      },
      restore: async () => {},
    });
    await expect(d.remove({ id: 'x' })).rejects.toThrow('disk full');
    expect(d.canUndo('x')).toBe(false);
    expect(d.pending()).toBe(0);
  });

  it('Undo after a failed delete still writes the record back (idempotent put)', async () => {
    const restored: string[] = [];
    const d = createDeleteUndo<{ id: string }>({
      remove: () => Promise.reject(new Error('busy')),
      restore: async (s) => void restored.push(s.id),
    });
    const removing = d.remove({ id: 'x' }).catch(() => 'failed');
    await d.undo('x');
    expect(await removing).toBe('failed');
    expect(restored).toEqual(['x']);
  });

  it('settle (Finish) waits for every write still running, then the count is exact', async () => {
    const { session, sets } = await threeSets();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const d = createDeleteUndo<WorkoutSet>({ remove: async (s) => { await gate; await deleteSet(s.id, db); }, restore: (s) => restoreSet(s, db) });
    const removing = d.remove(sets[2]!);
    expect(d.pending()).toBe(1);
    let settled = false;
    const settle = d.settle().then(() => (settled = true));
    await new Promise((r) => setTimeout(r, 5));
    expect(settled).toBe(false);
    release();
    await settle;
    await removing;
    expect(await finishWorkout(session.id, db, 9)).toEqual({ saved: true, sets: 2 });
  });

  it('settle rejects when a running write fails, so Finish can say so', async () => {
    let fail: ((e: Error) => void) | undefined;
    const d = createDeleteUndo<{ id: string }>({ remove: () => new Promise((_, rej) => (fail = rej)), restore: async () => {} });
    const removing = d.remove({ id: 'x' }).catch(() => {});
    const settle = d.settle();
    while (!fail) await Promise.resolve();
    fail(new Error('io'));
    await expect(settle).rejects.toThrow('io');
    await removing;
    await expect(d.settle()).resolves.toBeUndefined();
  });

  it('Finish: an Undo tapped while Finish waits is drained too, so no restore lands after the count', async () => {
    const { session, sets } = await threeSets();
    // Delete every set; the last delete is slow.
    const d0 = createDeleteUndo<WorkoutSet>(ops());
    await d0.remove(sets[0]!);
    await d0.remove(sets[1]!);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = { remove: async (s: WorkoutSet) => { await gate; await deleteSet(s.id, db); }, restore: (s: WorkoutSet) => restoreSet(s, db) };
    const d = createDeleteUndo<WorkoutSet>(slow);
    const removing = d.remove(sets[2]!);
    const settling = d.settle();
    // Undo arrives after settle took its first snapshot.
    const undoing = d.undo('c');
    release();
    await settling;
    await Promise.all([removing, undoing]);
    expect(d.pending()).toBe(0);
    // The restore landed before settle resolved: Finish counts it and keeps the session.
    expect(await finishWorkout(session.id, db, 9)).toEqual({ saved: true, sets: 1 });
    expect(await db.sessions.get(session.id)).toBeDefined();
  });

  it('close() refuses new deletes and Undos; reopen() allows them again', async () => {
    const { session, sets } = await threeSets();
    const d = createDeleteUndo<WorkoutSet>(ops());
    await d.remove(sets[0]!);
    await d.close();
    await expect(d.remove(sets[1]!)).rejects.toThrow(CLOSED);
    expect(await d.undo('a')).toBeUndefined();
    expect((await setsOf(session.id, db)).map((s) => s.id)).toEqual(['b', 'c']);
    d.reopen();
    expect(await d.undo('a')).toEqual(sets[0]);
    expect(await setsOf(session.id, db)).toEqual(sets);
  });

  it('a failed restore keeps the exact record; Try again writes it back', async () => {
    const { session, sets } = await threeSets();
    let failNext = true;
    const d = createDeleteUndo<WorkoutSet>({
      remove: (s) => deleteSet(s.id, db),
      restore: async (s) => {
        if (failNext) {
          failNext = false;
          throw new Error('restore failed');
        }
        await restoreSet(s, db);
      },
    });
    await d.remove(sets[1]!);
    await expect(d.undo('b')).rejects.toThrow('restore failed');
    expect(d.canUndo('b')).toBe(true);
    expect(await d.undo('b')).toEqual(sets[1]);
    expect(await setsOf(session.id, db)).toEqual(sets);
    expect(d.canUndo('b')).toBe(false);
  });

  it('two Undo taps share one restore write', async () => {
    const restore = vi.fn(async () => {});
    const d = createDeleteUndo<{ id: string }>({ remove: async () => {}, restore });
    await d.remove({ id: 'x' });
    const [a, b] = await Promise.all([d.undo('x'), d.undo('x')]);
    expect(a).toEqual({ id: 'x' });
    expect(b).toEqual({ id: 'x' });
    expect(restore).toHaveBeenCalledOnce();
  });

  it('a failed restore gets a fresh Undo window, then expires', async () => {
    vi.useFakeTimers();
    const d = createDeleteUndo<{ id: string }>({ remove: async () => {}, restore: () => Promise.reject(new Error('no')) });
    await d.remove({ id: 'x' });
    await vi.advanceTimersByTimeAsync(UNDO_MS - 100);
    await expect(d.undo('x')).rejects.toThrow('no');
    await vi.advanceTimersByTimeAsync(UNDO_MS - 100);
    expect(d.canUndo('x')).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(d.canUndo('x')).toBe(false);
  });

  it('delete the last set, log another, Undo: every set keeps a distinct order', async () => {
    const { session, sets } = await threeSets();
    const d = createDeleteUndo<WorkoutSet>(ops());
    await d.remove(sets[2]!); // the last one, order 2
    const next = await logSet({ id: 'd', sessionId: session.id, exerciseId: 'squat', reps: 8, load: bar }, db);
    expect(next.order).toBe(3); // never reuses the deleted set's order
    await d.undo('c');
    const after = await setsOf(session.id, db);
    expect(after.map((s) => [s.id, s.order])).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 3]]);
    expect(new Set(after.map((s) => s.order)).size).toBe(4);
  });

  it('a restore still on its way outlives the Undo window', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const d = createDeleteUndo<{ id: string }>({ remove: async () => {}, restore: () => new Promise<void>((r) => (release = r)) });
    await d.remove({ id: 'x' });
    const undoing = d.undo('x');
    await vi.advanceTimersByTimeAsync(UNDO_MS + 10);
    expect(d.canUndo('x')).toBe(true);
    release();
    expect(await undoing).toEqual({ id: 'x' });
    expect(d.canUndo('x')).toBe(false);
  });
});
