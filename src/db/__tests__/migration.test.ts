import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4 } from '../schema';
import { makeGym } from '../gyms';
import type { Run, Session, WorkoutSet } from '../types';
import { ANY_GYM } from '../types';
import { finishWorkout, getActiveSession, logSet, startPlanDay } from '../workouts';
import { choosePlan, getPlanState } from '../planState';

// CHECKPOINT RULE: saved data is sacred. Data written by the shipped version 1 schema must all be
// there after opening with the current schema.

let n = 0;
const names: string[] = [];
afterEach(async () => {
  while (names.length) await Dexie.delete(names.pop()!);
});

async function seedV1(name: string) {
  const v1 = new Dexie(name);
  v1.version(1).stores(SCHEMA_V1);
  await v1.open();
  const gym = makeGym({ name: 'Home', type: 'full', unit: 'kg', isActive: true }, 1000);
  const ended: Session = { id: 'sess-1', gymId: gym.id, startedAt: 2000, endedAt: 5000, imported: false };
  const open: Session = { id: 'sess-2', gymId: gym.id, startedAt: 6000, imported: false };
  const sets: WorkoutSet[] = Array.from({ length: 25 }, (_, i) => ({
    id: `set-${i}`,
    sessionId: i < 20 ? 'sess-1' : 'sess-2',
    exerciseId: i % 2 ? 'barbell-back-squat' : 'dumbbell-bench-press',
    order: i < 20 ? i : i - 20,
    kind: i === 0 ? 'warmup' : 'work',
    reps: 8 + (i % 5),
    load: { kind: 'barbell', unit: 'kg', total: 60 + i * 2.5, barWeight: 20, perSide: [20] },
    note: i === 3 ? 'felt easy' : undefined,
    uncertain: i === 4,
  }));
  const run: Run = { id: 'run-1', startedAt: 7000, type: 'easy', movingSec: 60, elapsedSec: 70, distanceM: 200, points: [], gaps: [], splits: [] };
  await v1.table('gyms').add(gym);
  await v1.table('sessions').bulkAdd([ended, open]);
  await v1.table('sets').bulkAdd(sets);
  await v1.table('runs').add(run);
  await v1.table('profile').add({ id: 'me', defaultUnit: 'kg', createdAt: 1 });
  v1.close();
  return { gym, sessions: [ended, open], sets, run };
}

describe('schema v1 → v2 migration', () => {
  it('keeps every gym, session, set, run and profile, and adds exerciseSettings', async () => {
    const name = `anygym-mig-${n++}`;
    names.push(name);
    const seeded = await seedV1(name);

    const db = new AnyGymDB(name);
    await db.open();
    expect(db.verno).toBe(5);
    expect(await db.gyms.toArray()).toEqual([seeded.gym]);
    expect(await db.sessions.orderBy('startedAt').toArray()).toEqual(seeded.sessions);
    expect(await db.sets.count()).toBe(25);
    for (const s of seeded.sets) expect(await db.sets.get(s.id)).toEqual(JSON.parse(JSON.stringify(s)));
    expect(await db.sets.where('[sessionId+order]').between(['sess-1', -Infinity], ['sess-1', Infinity]).count()).toBe(20);
    expect(await db.runs.get('run-1')).toEqual(seeded.run);
    expect(await db.profile.get('me')).toEqual({ id: 'me', defaultUnit: 'kg', createdAt: 1 });
    expect(await db.exerciseSettings.count()).toBe(0);

    // The migrated data works with the new code: the open session is still the active workout.
    expect((await getActiveSession(db))!.id).toBe('sess-2');
    const added = await logSet({ id: 'new', sessionId: 'sess-2', exerciseId: 'plank', seconds: 30, load: { kind: 'timed', unit: 'kg', total: 0 } }, db);
    expect(added.order).toBe(5);
    expect(await finishWorkout('sess-2', db, 9000)).toEqual({ saved: true, sets: 6 });
    await db.exerciseSettings.put({ exerciseId: 'leg-press', gymId: ANY_GYM, loadType: 'plate_machine' });
    expect(await db.exerciseSettings.count()).toBe(1);
    db.close();

    // Reopening again changes nothing.
    const again = new AnyGymDB(name);
    await again.open();
    expect(await again.sets.count()).toBe(26);
    expect(await again.gyms.count()).toBe(1);
    again.close();
  });
});

describe('schema v2 → v3 migration', () => {
  it('keeps every set, session and load type answer, and adds an empty planState', async () => {
    const name = `anygym-mig-${n++}`;
    names.push(name);
    const seeded = await seedV1(name);
    // Upgrade the v1 data to exactly v2 first and write a v2 only record.
    const v2 = new Dexie(name);
    v2.version(1).stores(SCHEMA_V1);
    v2.version(2).stores(SCHEMA_V2);
    await v2.open();
    expect(v2.verno).toBe(2);
    await v2.table('exerciseSettings').put({ exerciseId: 'leg-press', gymId: seeded.gym.id, loadType: 'plate_machine' });
    v2.close();

    const db = new AnyGymDB(name);
    await db.open();
    expect(db.verno).toBe(5);
    expect(await db.sets.count()).toBe(25);
    for (const s of seeded.sets) expect(await db.sets.get(s.id)).toEqual(JSON.parse(JSON.stringify(s)));
    expect(await db.sessions.orderBy('startedAt').toArray()).toEqual(seeded.sessions);
    expect(await db.exerciseSettings.toArray()).toEqual([{ exerciseId: 'leg-press', gymId: seeded.gym.id, loadType: 'plate_machine' }]);
    expect(await db.planState.count()).toBe(0);

    // The new table works with the migrated data: finish the open workout, then follow a plan.
    await finishWorkout('sess-2', db, 9000);
    await choosePlan('five-day-split', db, 10_000);
    const day = await startPlanDay(seeded.gym.id, 'five-day-split', 0, db, 11_000);
    await logSet({ id: 'p1', sessionId: day.id, exerciseId: 'barbell-back-squat', reps: 8, load: { kind: 'barbell', unit: 'kg', total: 60, barWeight: 20, perSide: [20] } }, db);
    await finishWorkout(day.id, db, 12_000);
    expect((await getPlanState(db))!.nextDayIndex).toBe(1);
    expect(await db.sets.count()).toBe(26);
    db.close();
  });
});

describe('schema v3 → v4 migration (PLAN 1.10c: set order counter)', () => {
  it('keeps every record, adds an empty orderCounters table, and an old workout continues from its highest order', async () => {
    const name = `anygym-mig-${n++}`;
    names.push(name);
    const seeded = await seedV1(name);
    const v3 = new Dexie(name);
    v3.version(1).stores(SCHEMA_V1);
    v3.version(2).stores(SCHEMA_V2);
    v3.version(3).stores(SCHEMA_V3);
    await v3.open();
    await v3.table('planState').put({ id: 'active', planId: 'ohrabah-split', startedAt: 1, weekIndex: 0, nextDayIndex: 2, doneDays: [0, 1] });
    v3.close();

    const db = new AnyGymDB(name);
    await db.open();
    expect(db.verno).toBe(5);
    for (const s of seeded.sets) expect(await db.sets.get(s.id)).toEqual(JSON.parse(JSON.stringify(s)));
    expect(await db.sessions.orderBy('startedAt').toArray()).toEqual(seeded.sessions);
    expect((await getPlanState(db))!.nextDayIndex).toBe(2);
    expect((await getPlanState(db))!.planId).toBe('five-day-split');
    expect(await db.orderCounters.count()).toBe(0);

    // The open v3 workout (sets with orders up to 24) keeps going without an order clash.
    const top = Math.max(...seeded.sets.filter((s) => s.sessionId === 'sess-2').map((s) => s.order));
    const set = await logSet({ id: 'after', sessionId: 'sess-2', exerciseId: 'barbell-back-squat', reps: 5, load: { kind: 'barbell', unit: 'kg', total: 60, barWeight: 20, perSide: [20] } }, db);
    expect(set.order).toBe(top + 1);
    expect(await db.orderCounters.get('sess-2')).toEqual({ sessionId: 'sess-2', next: top + 2 });
    db.close();
  });
});

describe('schema v4 → v5 migration (PLAN 1.10f: plan renamed, old id ohrabah-split → five-day-split)', () => {
  it('keeps the active plan, day position, done days, sessions and every set under the new id', async () => {
    const name = `anygym-mig-${n++}`;
    names.push(name);
    const seeded = await seedV1(name);
    const v4 = new Dexie(name);
    v4.version(1).stores(SCHEMA_V1);
    v4.version(2).stores(SCHEMA_V2);
    v4.version(3).stores(SCHEMA_V3);
    v4.version(4).stores(SCHEMA_V4);
    await v4.open();
    await v4.table('planState').put({ id: 'active', planId: 'ohrabah-split', startedAt: 1, weekIndex: 0, nextDayIndex: 3, doneDays: [0, 1, 2] });
    const planSessions: Session[] = [
      { id: 'plan-1', gymId: seeded.gym.id, planId: 'ohrabah-split', dayId: '1', weekIndex: 0, startedAt: 8000, endedAt: 9000, imported: false, exerciseIds: ['barbell-back-squat'] },
      { id: 'plan-2', gymId: seeded.gym.id, planId: 'ohrabah-split', dayId: '2', weekIndex: 0, startedAt: 10_000, endedAt: 11_000, imported: false },
    ];
    const other: Session = { id: 'plan-3', gymId: seeded.gym.id, planId: 'six-week-volume', dayId: '1', weekIndex: 0, startedAt: 12_000, endedAt: 13_000, imported: false };
    await v4.table('sessions').bulkAdd([...planSessions, other]);
    const planSets: WorkoutSet[] = ['plan-1', 'plan-1', 'plan-2'].map((sessionId, i) => ({
      id: `pset-${i}`, sessionId, exerciseId: 'barbell-back-squat', order: i, kind: 'work', reps: 8, uncertain: false,
      load: { kind: 'barbell', unit: 'kg', total: 60, barWeight: 20, perSide: [20] },
    }));
    await v4.table('sets').bulkAdd(planSets);
    await v4.table('orderCounters').put({ sessionId: 'plan-1', next: 2 });
    await v4.table('exerciseSettings').put({ exerciseId: 'leg-press', gymId: ANY_GYM, loadType: 'plate_machine' });
    v4.close();

    const db = new AnyGymDB(name);
    await db.open();
    expect(db.verno).toBe(5);
    expect(await getPlanState(db)).toEqual({ id: 'active', planId: 'five-day-split', startedAt: 1, weekIndex: 0, nextDayIndex: 3, doneDays: [0, 1, 2] });
    expect(await db.sessions.get('plan-1')).toEqual({ ...planSessions[0], planId: 'five-day-split' });
    expect(await db.sessions.get('plan-2')).toEqual({ ...planSessions[1], planId: 'five-day-split' });
    expect(await db.sessions.get('plan-3')).toEqual(other);
    for (const s of seeded.sessions) expect(await db.sessions.get(s.id)).toEqual(s);
    expect(await db.sets.count()).toBe(28);
    for (const s of [...seeded.sets, ...planSets]) expect(await db.sets.get(s.id)).toEqual(JSON.parse(JSON.stringify(s)));
    expect(await db.orderCounters.get('plan-1')).toEqual({ sessionId: 'plan-1', next: 2 });
    expect(await db.exerciseSettings.count()).toBe(1);
    expect(await db.sessions.filter((s) => s.planId === 'ohrabah-split').count()).toBe(0);

    // The migrated plan keeps going: day 4 is next, and finishing it advances to day 5.
    await finishWorkout('sess-2', db, 14_000);
    const day = await startPlanDay(seeded.gym.id, 'five-day-split', 3, db, 15_000);
    expect(day).toMatchObject({ planId: 'five-day-split', dayId: '4' });
    await logSet({ id: 'p4', sessionId: day.id, exerciseId: 'barbell-back-squat', reps: 8, load: { kind: 'barbell', unit: 'kg', total: 60, barWeight: 20, perSide: [20] } }, db);
    await finishWorkout(day.id, db, 16_000);
    expect(await getPlanState(db)).toMatchObject({ planId: 'five-day-split', nextDayIndex: 4, doneDays: [0, 1, 2, 3] });
    db.close();
  });
});
