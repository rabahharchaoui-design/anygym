import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { finishedDetail, getPastSessions, listFinished } from '../history';
import { choosePlan, getPlanState } from '../planState';
import { deleteSet, finishWorkout, getActiveSession, logSet, restoreSet, setsOf, startPlanDay, startWorkout, updateSet, updateSetType, WorkoutFinishedError } from '../workouts';
import { totalLifted } from '../../lib/load';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-codex-finish-type-${n++}`);
  await db.open();
});
afterEach(async () => { await db.delete(); });
async function reopen() {
  const name = db.name;
  db.close();
  db = new AnyGymDB(name);
  await db.open();
}
const bar: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45], barId: 'olympic', collars: 0 };

describe('set type and finish recovery (completed PLAN 1.7c, SPEC 0, 5, 6, 20)', () => {
  it('a failed warmup-to-failure change preserves the saved type, then a retry enters working history exactly once', async () => {
    const s = await startWorkout('home', db, 1000);
    const original = await logSet({ id: 'warm', sessionId: s.id, exerciseId: 'squat', reps: 12, load: bar, kind: 'warmup' }, db);
    const fail = () => { throw new Error('synthetic type write failure'); };
    db.sets.hook('updating', fail);
    try {
      await expect(updateSetType('warm', 'work', true, db)).rejects.toThrow('synthetic type write failure');
    } finally {
      db.sets.hook('updating').unsubscribe(fail);
    }
    await reopen();
    expect(await setsOf(s.id, db)).toEqual([original]);
    await updateSetType('warm', 'work', true, db);
    await updateSetType('warm', 'work', true, db);
    await finishWorkout(s.id, db, 2000);
    await reopen();
    expect((await finishedDetail(s.id, db))!.sets).toEqual([{ ...original, kind: 'work', failure: true }]);
    expect(await getPastSessions('squat', 'hotel', 'barbell', 6, { db })).toEqual([
      { date: 1000, gymId: 'home', unit: 'lb', sets: [{ kind: 'work', reps: 12, load: bar }] },
    ]);
  });

  it('deleting the only plan set then finishing discards only that workout and never advances the plan or resurrects Undo', async () => {
    const old = await startWorkout('home', db, 100);
    const kept = await logSet({ id: 'kept', sessionId: old.id, exerciseId: 'squat', reps: 9, load: bar }, db);
    await finishWorkout(old.id, db, 200);
    await choosePlan('six-week-volume', db, 500);
    const pointer = await getPlanState(db);
    const s = await startPlanDay('home', 'six-week-volume', 0, db, 1000);
    await logSet({ id: 'last', sessionId: s.id, exerciseId: 'squat', reps: 8, load: bar }, db);
    const undo = (await deleteSet('last', db))!;
    await reopen();
    expect(await finishWorkout(s.id, db, 2000)).toEqual({ saved: false });
    await reopen();
    expect(await getActiveSession(db)).toBeUndefined();
    expect(await db.sessions.get(s.id)).toBeUndefined();
    expect(await db.orderCounters.get(s.id)).toBeUndefined();
    expect(await getPlanState(db)).toEqual(pointer);
    await expect(restoreSet(undo, db)).rejects.toBeInstanceOf(WorkoutFinishedError);
    expect(await db.sets.toArray()).toEqual([kept]);
    expect((await listFinished(db)).map((x) => x.session.id)).toEqual([old.id]);
  });

  it('an empty Finish rolls back its session deletion when counter cleanup fails and remains retryable after reopen', async () => {
    const s = await startWorkout('home', db, 1000);
    await logSet({ id: 'gone', sessionId: s.id, exerciseId: 'squat', reps: 8, load: bar }, db);
    await deleteSet('gone', db);
    const active = await getActiveSession(db);
    const counter = await db.orderCounters.get(s.id);
    const fail = () => { throw new Error('synthetic counter cleanup failure'); };
    db.orderCounters.hook('deleting', fail);
    try {
      await expect(finishWorkout(s.id, db, 2000)).rejects.toThrow('synthetic counter cleanup failure');
    } finally {
      db.orderCounters.hook('deleting').unsubscribe(fail);
    }
    await reopen();
    expect(await getActiveSession(db)).toEqual(active);
    expect(await db.orderCounters.get(s.id)).toEqual(counter);
    expect(await setsOf(s.id, db)).toEqual([]);
    expect(await finishWorkout(s.id, db, 3000)).toEqual({ saved: false });
    await reopen();
    expect(await db.sessions.count()).toBe(0);
    expect(await db.orderCounters.count()).toBe(0);
  });

  it('mixed-unit finish totals count both dumbbells and both machine sides while preserving entered loads after edit and Undo', async () => {
    const loads: Load[] = [
      { kind: 'barbell', unit: 'lb', total: 90, barWeight: 35, perSide: [25, 2.5], barId: 'womens', collars: 0 },
      { kind: 'dumbbell_each', unit: 'kg', total: 40 },
      { kind: 'plate_machine', unit: 'kg', total: 75, barWeight: 35, perSide: [20], collars: 0 },
      { kind: 'stack', unit: 'lb', total: 102.5, stackValue: 100, added: 2.5 },
    ];
    const s = await startWorkout('home', db, 1000);
    for (const [i, load] of loads.entries()) await logSet({ id: `mix-${i}`, sessionId: s.id, exerciseId: `lift-${i}`, reps: 10, load }, db);
    await updateSet('mix-1', { reps: 12, load: loads[1]! }, db);
    const removed = (await deleteSet('mix-2', db))!;
    await restoreSet(removed, db);
    await finishWorkout(s.id, db, 2000);
    await reopen();
    const before = (await finishedDetail(s.id, db))!;
    expect(before.sets.map((x) => x.load)).toEqual(loads);
    // 90 × 10 lb + 40 × 12 kg (pair) + 75 × 10 kg (both horns and start) + 102.5 × 10 lb.
    const kg = 1925 * 0.45359237 + 1230;
    expect(totalLifted(before.sets, 'kg')).toBeCloseTo(kg, 9);
    expect(totalLifted(before.sets, 'lb')).toBeCloseTo(1925 + 1230 / 0.45359237, 9);
    await reopen();
    expect(await finishedDetail(s.id, db)).toEqual(before);
  });
});
