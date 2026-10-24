import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB, SCHEMA_V1, SCHEMA_V2 } from '../schema';
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
    expect(db.verno).toBe(3);
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
    expect(db.verno).toBe(3);
    expect(await db.sets.count()).toBe(25);
    for (const s of seeded.sets) expect(await db.sets.get(s.id)).toEqual(JSON.parse(JSON.stringify(s)));
    expect(await db.sessions.orderBy('startedAt').toArray()).toEqual(seeded.sessions);
    expect(await db.exerciseSettings.toArray()).toEqual([{ exerciseId: 'leg-press', gymId: seeded.gym.id, loadType: 'plate_machine' }]);
    expect(await db.planState.count()).toBe(0);

    // The new table works with the migrated data: finish the open workout, then follow a plan.
    await finishWorkout('sess-2', db, 9000);
    await choosePlan('ohrabah-split', db, 10_000);
    const day = await startPlanDay(seeded.gym.id, 'ohrabah-split', 0, db, 11_000);
    await logSet({ id: 'p1', sessionId: day.id, exerciseId: 'barbell-back-squat', reps: 8, load: { kind: 'barbell', unit: 'kg', total: 60, barWeight: 20, perSide: [20] } }, db);
    await finishWorkout(day.id, db, 12_000);
    expect((await getPlanState(db))!.nextDayIndex).toBe(1);
    expect(await db.sets.count()).toBe(26);
    db.close();
  });
});
