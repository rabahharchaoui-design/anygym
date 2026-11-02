import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { pendingMutations, retryMutations, saveMutation } from '../mutations';
import { acceptUndo, recoverDeletes, undoDelete } from '../tombstones';
import { rememberUndo, undoKey } from '../undoIntents';
import { deleteSetToken, finishWorkout, getActiveSession, logSet, MUTATION_DONE_PREFIX, restoredKey, setsOf, startWorkout, updateSet } from '../workouts';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-commit-boundaries-${n++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });
async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
const load: Load = { kind: 'plate_machine', unit: 'kg', total: 75, barWeight: 35, perSide: [20], collars: 0 };
async function fixture() {
  const s = await startWorkout('g', db, 1000);
  const a = await logSet({ id: 'a', sessionId: s.id, exerciseId: 'press', reps: 8, load }, db);
  const b = await logSet({ id: 'b', sessionId: s.id, exerciseId: 'press', reps: 9, load }, db);
  return { s, a, b };
}

describe('PLAN 1.7h, 2.0e–i: failures after the data write still roll back the whole operation', () => {
  it('an edit whose supersession marker fails retains the original set and its exact retry journal after reopen', async () => {
    const { s, a, b } = await fixture();
    const mutation = { kind: 'edit' as const, setId: a.id, change: { reps: 13, load: { ...load, total: 85, perSide: [25] } } };
    const fail = (_key: unknown, row: { key: string }) => {
      if (row.key.startsWith(MUTATION_DONE_PREFIX)) throw new Error('synthetic marker failure');
    };
    db.kv.hook('creating', fail);
    try {
      await expect(saveMutation(s.id, 'press', mutation, db, 2000, null)).rejects.toThrow('synthetic marker failure');
    } finally { db.kv.hook('creating').unsubscribe(fail); }
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([a, b]);
    expect((await pendingMutations(s.id, db, null)).map((j) => j.mutation)).toEqual([mutation]);
    expect(await retryMutations(s.id, db, null)).toBe(true);
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([{ ...a, ...mutation.change }, b]);
    expect(await pendingMutations(s.id, db, null)).toEqual([]);
    expect(await retryMutations(s.id, db, null)).toBe(true);
  });

  it('a failed tombstone insert rolls back Delete rather than losing the only recovery copy', async () => {
    const { s, a, b } = await fixture();
    const counter = await db.orderCounters.get(s.id);
    const fail = () => { throw new Error('synthetic tombstone failure'); };
    db.tombstones.hook('creating', fail);
    try {
      await expect(deleteSetToken(a.id, db, 2000)).rejects.toThrow('synthetic tombstone failure');
    } finally { db.tombstones.hook('creating').unsubscribe(fail); }
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([a, b]);
    expect(await db.orderCounters.get(s.id)).toEqual(counter);
    expect(await db.tombstones.count()).toBe(0);
    const deleted = (await deleteSetToken(a.id, db, 3000))!;
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([b]);
    expect(await undoDelete(a.id, db, deleted.token)).toEqual(a);
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([a, b]);
  });

  it('Undo marker failure rolls back both restoration and intent cleanup; restart recovers the edited snapshot once', async () => {
    const { s, a, b } = await fixture();
    const edited = await updateSet(a.id, { reps: 12, load }, db);
    const deletion = (await deleteSetToken(a.id, db, 2000))!;
    await rememberUndo(s.id, a.id, db, null, deletion.token);
    const fail = (_key: unknown, row: { key: string }) => {
      if (row.key === restoredKey(s.id, a.id)) throw new Error('synthetic Undo marker failure');
    };
    db.kv.hook('creating', fail);
    try {
      await expect(undoDelete(a.id, db, deletion.token)).rejects.toThrow('synthetic Undo marker failure');
    } finally { db.kv.hook('creating').unsubscribe(fail); }
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([b]);
    expect(await db.tombstones.get(a.id)).toMatchObject({ token: deletion.token, set: edited, undo: true });
    expect(await db.kv.get(undoKey(s.id, a.id))).toBeDefined();
    expect(await recoverDeletes(s.id, db)).toEqual({ restored: [a.id], expired: [], failed: [] });
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([edited, b]);
    expect(await db.tombstones.count()).toBe(0);
    expect(await db.kv.get(undoKey(s.id, a.id))).toBeUndefined();
    expect(await recoverDeletes(s.id, db)).toEqual({ restored: [], expired: [], failed: [] });
  });

  it('Finish tombstone cleanup failure rolls back accepted Undo restoration and retains an unaccepted deletion', async () => {
    const { s, a, b } = await fixture();
    const edited = await updateSet(a.id, { reps: 14, load }, db);
    const undo = (await deleteSetToken(a.id, db, 2000))!;
    const gone = (await deleteSetToken(b.id, db, 2000))!;
    await acceptUndo(a.id, db, undo.token);
    const before = await db.tombstones.toArray();
    const fail = () => { throw new Error('synthetic Finish cleanup failure'); };
    db.tombstones.hook('deleting', fail);
    try {
      await expect(finishWorkout(s.id, db, 3000)).rejects.toThrow('synthetic Finish cleanup failure');
    } finally { db.tombstones.hook('deleting').unsubscribe(fail); }
    await reopen();
    expect(await getActiveSession(db)).toMatchObject({ id: s.id });
    expect(await setsOf(s.id, db)).toEqual([]);
    expect(await db.tombstones.toArray()).toEqual(before);
    expect(await finishWorkout(s.id, db, 4000, undefined, new Map([[b.id, gone.token]]))).toMatchObject({ saved: true, sets: 1 });
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([edited]);
    expect((await db.sessions.get(s.id))?.endedAt).toBe(4000);
    expect(await db.tombstones.count()).toBe(0);
    await finishWorkout(s.id, db, 5000);
    expect(await setsOf(s.id, db)).toEqual([edited]);
  });
});
