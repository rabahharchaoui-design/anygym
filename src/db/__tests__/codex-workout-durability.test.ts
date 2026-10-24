import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { deleteSet, finishWorkout, getActiveSession, logSet, restoreSet, setsOf, startWorkout, updateSet } from '../workouts';
import { barbellLoad, dumbbellLoad, plateMachineLoad, singleLoad, stackLoad } from '../../lib/load';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-durability-${n++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });

// A fresh Dexie instance, rather than another read through the existing connection.
async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}

describe('saved workout durability (SPEC 0, 2, 5.4, 5.5)', () => {
  it('keeps exact entered units and load breakdowns through edit, delete, undo, finish and reopen', async () => {
    const cases: Array<{ load: Load; expected: Load }> = [
      { load: barbellLoad(35, [25, 2.5], 'none', 'lb')!, expected: { kind: 'barbell', unit: 'lb', total: 90, barWeight: 35, perSide: [25, 2.5], collars: 0 } },
      { load: barbellLoad(15, [20, 1.25], 'competition', 'kg')!, expected: { kind: 'barbell', unit: 'kg', total: 62.5, barWeight: 15, perSide: [20, 1.25], collars: 5 } },
      { load: barbellLoad(0, [45, 10], 'none', 'lb')!, expected: { kind: 'barbell', unit: 'lb', total: 110, barWeight: 0, perSide: [45, 10], collars: 0 } },
      { load: plateMachineLoad(110, [45, 25], 'lb')!, expected: { kind: 'plate_machine', unit: 'lb', total: 250, barWeight: 110, perSide: [45, 25], collars: 0 } },
      { load: plateMachineLoad(0, [20, 1.25], 'kg')!, expected: { kind: 'plate_machine', unit: 'kg', total: 42.5, barWeight: 0, perSide: [20, 1.25], collars: 0 } },
      { load: dumbbellLoad(22.5, 'kg'), expected: { kind: 'dumbbell_each', unit: 'kg', total: 45 } },
      { load: singleLoad(22.5, 'kg'), expected: { kind: 'single', unit: 'kg', total: 22.5 } },
      { load: stackLoad(47.5, 'kg', 1.25), expected: { kind: 'stack', unit: 'kg', total: 48.75, stackValue: 47.5, added: 1.25 } },
    ];
    const session = await startWorkout('synthetic-gym', db, 1000);
    for (const [i, { load, expected }] of cases.entries()) {
      expect(load).toEqual(expected); // Independent literal totals; no conversion on save.
      await logSet({ id: `set-${i}`, sessionId: session.id, exerciseId: `exercise-${i}`, reps: 10, load }, db);
    }
    await reopen();
    expect((await getActiveSession(db))?.id).toBe(session.id);
    expect((await setsOf(session.id, db)).map((s) => s.load)).toEqual(cases.map((c) => c.expected));

    // Editing another set must not mutate the original load or any neighbouring record.
    await updateSet('set-0', { reps: 11, load: barbellLoad(35, [25, 5], 'none', 'lb')! }, db);
    await reopen();
    expect(await db.sets.get('set-0')).toMatchObject({ reps: 11, load: { total: 95, barWeight: 35, perSide: [25, 5], unit: 'lb' } });
    const beforeDelete = await setsOf(session.id, db);
    const undoRecord = await deleteSet('set-2', db);
    await reopen();
    expect(await db.sets.get('set-2')).toBeUndefined();
    await restoreSet(undoRecord!, db);
    await reopen();
    expect(await setsOf(session.id, db)).toEqual(beforeDelete);

    await deleteSet('set-3', db);
    const survivors = beforeDelete.filter((s) => s.id !== 'set-3');
    expect(await finishWorkout(session.id, db, 2000)).toEqual({ saved: true, sets: 7 });
    await reopen();
    expect(await getActiveSession(db)).toBeUndefined();
    expect(await db.sessions.get(session.id)).toMatchObject({ startedAt: 1000, endedAt: 2000, gymId: 'synthetic-gym' });
    expect(await setsOf(session.id, db)).toEqual(survivors);
    await expect(logSet({ id: 'late', sessionId: session.id, exerciseId: 'exercise-0', reps: 10, load: cases[0]!.load }, db)).rejects.toThrow('Workout not active');
    expect(await setsOf(session.id, db)).toEqual(survivors);
  });

  it('rolls back an inserted set if updating its session fails, then retries the same id exactly once', async () => {
    const session = await startWorkout('synthetic-gym', db, 1000);
    const input = { id: 'retry', sessionId: session.id, exerciseId: 'squat', reps: 8, load: barbellLoad(45, [45], 'none', 'lb')! };
    const fail = () => { throw new Error('synthetic session write failure'); };
    db.sessions.hook('updating', fail);
    try {
      await expect(logSet(input, db)).rejects.toThrow('synthetic session write failure');
    } finally {
      db.sessions.hook('updating').unsubscribe(fail);
    }
    await reopen();
    expect(await setsOf(session.id, db)).toEqual([]);
    expect(await db.sessions.get(session.id)).toEqual(session);
    await logSet(input, db);
    await logSet(input, db);
    await reopen();
    expect(await setsOf(session.id, db)).toEqual([
      { ...input, order: 0, kind: 'work', uncertain: false },
    ]);
    expect((await db.sessions.get(session.id))?.exerciseIds).toEqual(['squat']);
  });
});
