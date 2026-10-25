import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load, WorkoutSet } from '../types';
import { acceptUndo, expireDelete, recoverDeletes, undoDelete } from '../tombstones';
import { deleteSet, finishWorkout, logSet, setsOf, startWorkout } from '../workouts';
import { UNDO_MS } from '../../lib/undoQueue';
import { createDeleteUndo } from '../../lib/deleteUndo';

// PLAN 1.7h (4): delete + Undo recovery is stored. Each "kill" drops every in-memory object and
// opens the database again before startup recovery runs.

const bar: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
let name: string;
let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  name = `anygym-tomb-${n++}`;
  db = new AnyGymDB(name);
  await db.open();
});
afterEach(async () => {
  vi.useRealTimers();
  db.close();
  await new AnyGymDB(name).delete();
});

async function kill() {
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}

async function threeSets() {
  const s = await startWorkout('g', db, 1);
  for (const id of ['a', 'b', 'c']) await logSet({ id, sessionId: s.id, exerciseId: 'squat', reps: 10, load: bar }, db);
  return { session: s, sets: await setsOf(s.id, db) };
}

describe('tombstones', () => {
  it('delete then kill during the Undo window: the set stays deleted, the record goes only once the window is over', async () => {
    const { session, sets } = await threeSets();
    await deleteSet('b', db, 10_000);
    expect(await db.tombstones.get('b')).toEqual({ id: 'b', sessionId: session.id, set: sets[1], expiresAt: 10_000 + UNDO_MS });
    await kill();
    expect(await recoverDeletes(session.id, db, 11_000)).toEqual({ restored: [], expired: [], failed: [] });
    expect((await setsOf(session.id, db)).map((s) => s.id)).toEqual(['a', 'c']);
    expect(await db.tombstones.count()).toBe(1);
    expect(await recoverDeletes(session.id, db, 10_000 + UNDO_MS)).toEqual({ restored: [], expired: ['b'], failed: [] });
    expect(await db.tombstones.count()).toBe(0);
    expect((await setsOf(session.id, db)).map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('Undo accepted then kill before the restore: startup puts the same record back', async () => {
    const { session, sets } = await threeSets();
    await deleteSet('b', db, 10_000);
    expect(await acceptUndo('b', db)).toBe(true);
    await kill();
    expect(await recoverDeletes(session.id, db, 10_000 + UNDO_MS * 10)).toEqual({ restored: ['b'], expired: [], failed: [] });
    expect(await setsOf(session.id, db)).toEqual(sets);
    expect(await db.tombstones.count()).toBe(0);
  });

  it('Codex 1219 (4): Undo whose restore fails is kept stored and retried on the next start', async () => {
    const { session, sets } = await threeSets();
    await deleteSet('c', db, 10_000);
    const closed = new AnyGymDB(name);
    await closed.open();
    // The accept lands, then the restore aborts (the app is torn down mid write).
    await acceptUndo('c', closed);
    closed.close({ disableAutoOpen: true });
    await expect(undoDelete('c', closed)).rejects.toThrow();
    await kill();
    expect(await db.tombstones.get('c')).toMatchObject({ undo: true });
    await recoverDeletes(session.id, db, 99_999_999);
    expect(await setsOf(session.id, db)).toEqual(sets);
  });

  it('undoDelete restores at once; a second Undo returns the set already back; nothing to undo is undefined', async () => {
    const { session, sets } = await threeSets();
    await deleteSet('a', db);
    expect(await undoDelete('a', db)).toEqual(sets[0]);
    expect(await undoDelete('a', db)).toEqual(sets[0]);
    expect(await undoDelete('zzz', db)).toBeUndefined();
    expect(await acceptUndo('zzz', db)).toBe(false);
    expect(await setsOf(session.id, db)).toEqual(sets);
  });

  it('expiry never drops an accepted Undo, and only after the window', async () => {
    await threeSets();
    await deleteSet('a', db, 0);
    await expireDelete('a', db, UNDO_MS - 1);
    expect(await db.tombstones.count()).toBe(1);
    await acceptUndo('a', db);
    await expireDelete('a', db, UNDO_MS * 2);
    expect(await db.tombstones.count()).toBe(1);
    await expireDelete('missing', db);
  });

  it('Finish puts an accepted Undo back first and drops the other tombstones (no Undo after Finish)', async () => {
    const { session } = await threeSets();
    await deleteSet('a', db);
    await deleteSet('b', db);
    await acceptUndo('a', db);
    expect(await finishWorkout(session.id, db)).toMatchObject({ saved: true, sets: 2 });
    expect((await setsOf(session.id, db)).map((s) => s.id)).toEqual(['a', 'c']);
    expect(await db.tombstones.count()).toBe(0);
    expect(await db.submissions.count()).toBe(0);
    // A workout no longer active drops what is left, without restoring.
    await db.tombstones.put({ id: 'c', sessionId: session.id, set: (await db.sets.get('c'))!, expiresAt: 0, undo: true });
    expect(await recoverDeletes(session.id, db)).toEqual({ restored: [], expired: ['c'], failed: [] });
  });

  it('an accepted Undo of a finished workout is dropped on recovery when its restore is refused', async () => {
    const { session, sets } = await threeSets();
    await deleteSet('a', db);
    await acceptUndo('a', db);
    // Finished elsewhere without going through finishWorkout (e.g. an old build).
    await db.sessions.update(session.id, { endedAt: 5 });
    const r = await recoverDeletes(session.id, db);
    expect(r.expired).toEqual(['a']);
    expect(await setsOf(session.id, db)).toEqual(sets.slice(1));
  });

  it('recovery reports a restore refused because its workout is gone, and drops that record', async () => {
    const { session } = await threeSets();
    await deleteSet('a', db);
    await acceptUndo('a', db);
    const t = (await db.tombstones.get('a'))!;
    // A broken record (its workout id points elsewhere) cannot be written back.
    await db.tombstones.put({ ...t, set: { ...t.set, sessionId: 'gone' } as WorkoutSet });
    const r = await recoverDeletes(session.id, db);
    expect(r.failed).toEqual(['a']);
    expect(await db.tombstones.count()).toBe(0);
  });

  it('the in-memory Undo window ends by clearing the stored record', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { session, sets } = await threeSets();
    const d = createDeleteUndo<WorkoutSet>({ remove: (s) => deleteSet(s.id, db, Date.now()), restore: (s) => undoDelete(s.id, db), expire: (s) => expireDelete(s.id, db, Date.now() + UNDO_MS) });
    await d.remove(sets[0]!);
    expect(await db.tombstones.count()).toBe(1);
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    await vi.waitFor(async () => expect(await db.tombstones.count()).toBe(0));
    expect((await setsOf(session.id, db)).map((s) => s.id)).toEqual(['b', 'c']);
  });
});
