import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { choosePlan, getPlanState, setNextDay } from '../planState';
import { deleteSet, finishWorkout, getActiveSession, logSet, restoreSet, setsOf, startPlanDay, startWorkout, updateSet } from '../workouts';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-write-recovery-${n++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });

async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}

const bar: Load = { kind: 'barbell', unit: 'kg', total: 62.5, barWeight: 15, perSide: [20, 2.5, 1.25] };
const input = (id: string, sessionId: string, exerciseId = 'squat') => ({ id, sessionId, exerciseId, reps: 8, load: bar });

describe('write recovery and interleaved workout actions (SPEC 0, 2, 5, 13)', () => {
  it('keeps distinct concurrent logs and an undone middle set when another set is logged during Undo', async () => {
    const session = await startWorkout('synthetic-gym', db, 1000);
    const logged = await Promise.all(['a', 'b', 'c'].map((id) => logSet(input(id, session.id, id), db)));
    const before = await setsOf(session.id, db);
    expect(before).toEqual(logged);
    expect(before.map((s) => s.order)).toEqual([0, 1, 2]);
    expect((await db.sessions.get(session.id))?.exerciseIds).toEqual(['a', 'b', 'c']);

    const undo = await deleteSet('b', db);
    const appended = await logSet(input('d', session.id, 'd'), db);
    expect(appended.order).toBe(3);
    await restoreSet(undo!, db);
    await reopen();
    expect(await setsOf(session.id, db)).toEqual([...before, appended]);
    expect((await db.sessions.get(session.id))?.exerciseIds).toEqual(['a', 'b', 'c', 'd']);
    expect(await finishWorkout(session.id, db, 2000)).toEqual({ saved: true, sets: 4 });
    await reopen();
    expect(await setsOf(session.id, db)).toEqual([...before, appended]);
  });

  it('a failed edit keeps the original load, metadata and neighbouring set after reopen, and can be retried', async () => {
    const session = await startWorkout('synthetic-gym', db, 1000);
    await logSet(input('edit', session.id), db);
    await db.sets.update('edit', { kind: 'warmup', note: 'Synthetic note', rpe: 7, uncertain: true });
    await logSet(input('neighbour', session.id), db);
    const before = await setsOf(session.id, db);
    const change = { reps: 12, load: { kind: 'plate_machine', unit: 'lb', total: 250, barWeight: 110, perSide: [45, 25] } as Load };
    const fail = () => { throw new Error('synthetic edit failure'); };
    db.sets.hook('updating', fail);
    try {
      await expect(updateSet('edit', change, db)).rejects.toThrow('synthetic edit failure');
    } finally {
      db.sets.hook('updating').unsubscribe(fail);
    }
    await reopen();
    expect(await setsOf(session.id, db)).toEqual(before);
    await updateSet('edit', change, db);
    await reopen();
    expect(await setsOf(session.id, db)).toEqual([{ ...before[0], ...change }, before[1]]);
  });

  it('failed delete and failed Undo writes preserve the last committed records and allow exact retries', async () => {
    const session = await startWorkout('synthetic-gym', db, 1000);
    await logSet(input('keep', session.id), db);
    const original = await logSet(input('delete', session.id), db);
    const failDelete = () => { throw new Error('synthetic delete failure'); };
    db.sets.hook('deleting', failDelete);
    try {
      await expect(deleteSet(original.id, db)).rejects.toThrow('synthetic delete failure');
    } finally {
      db.sets.hook('deleting').unsubscribe(failDelete);
    }
    await reopen();
    expect(await db.sets.get(original.id)).toEqual(original);
    const undo = await deleteSet(original.id, db);
    expect(undo).toEqual(original);
    const survivors = await setsOf(session.id, db);

    const failUndo = () => { throw new Error('synthetic undo failure'); };
    db.sets.hook('creating', failUndo);
    try {
      await expect(restoreSet(undo!, db)).rejects.toThrow('synthetic undo failure');
    } finally {
      db.sets.hook('creating').unsubscribe(failUndo);
    }
    await reopen();
    expect(await setsOf(session.id, db)).toEqual(survivors);
    await restoreSet(undo!, db);
    await restoreSet(undo!, db); // Retrying Undo must never duplicate a set.
    await reopen();
    expect(await setsOf(session.id, db)).toEqual([...survivors, original]);
  });

  it('rolls back Finish if advancing the weekly plan fails, retaining all sets and allowing one successful retry', async () => {
    await choosePlan('six-week-volume', db, 500);
    await setNextDay(4, db);
    const state = await getPlanState(db);
    const session = await startPlanDay('synthetic-gym', 'six-week-volume', 4, db, 1000);
    await logSet(input('last-day', session.id), db);
    const before = await setsOf(session.id, db);
    const fail = () => { throw new Error('synthetic plan write failure'); };
    db.planState.hook('updating', fail);
    try {
      await expect(finishWorkout(session.id, db, 2000)).rejects.toThrow('synthetic plan write failure');
    } finally {
      db.planState.hook('updating').unsubscribe(fail);
    }
    await reopen();
    expect(await getActiveSession(db)).toEqual({ ...session, exerciseIds: [...session.exerciseIds!, 'squat'] });
    expect(await getPlanState(db)).toEqual(state);
    expect(await setsOf(session.id, db)).toEqual(before);

    expect(await finishWorkout(session.id, db, 3000)).toEqual({ saved: true, sets: 1 });
    await reopen();
    expect(await getActiveSession(db)).toBeUndefined();
    expect((await db.sessions.get(session.id))?.endedAt).toBe(3000);
    expect(await getPlanState(db)).toMatchObject({ weekIndex: 1, nextDayIndex: 0, doneDays: [] });
    const advanced = await getPlanState(db);
    await finishWorkout(session.id, db, 4000);
    await reopen();
    expect(await getPlanState(db)).toEqual(advanced);
    expect((await db.sessions.get(session.id))?.endedAt).toBe(3000);
    expect(await setsOf(session.id, db)).toEqual(before);
  });
});
