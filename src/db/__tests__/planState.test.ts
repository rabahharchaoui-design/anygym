import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { advanceAfter, choosePlan, getPlanState, setNextDay, weekFor } from '../planState';
import { finishWorkout, getActiveSession, logSet, startPlanDay, startWorkout } from '../workouts';

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-planstate-${n++}`);
  await db.open();
});
afterEach(async () => {
  await db.delete();
});

const bar: Load = { kind: 'barbell', unit: 'lb', total: 135, barWeight: 45, perSide: [45] };
const logOne = (sessionId: string, id = 's1') => logSet({ id, sessionId, exerciseId: 'barbell-back-squat', reps: 8, load: bar }, db);

describe('choosePlan / setNextDay', () => {
  it('starts a plan at day 1, week 1; Change day moves the next day', async () => {
    expect(await getPlanState(db)).toBeUndefined();
    expect(await setNextDay(2, db)).toBeUndefined();
    const s = await choosePlan('ohrabah-split', db, 1000);
    expect(s).toEqual({ id: 'active', planId: 'ohrabah-split', startedAt: 1000, weekIndex: 0, nextDayIndex: 0, doneDays: [] });
    expect(await getPlanState(db)).toEqual(s);
    expect((await setNextDay(2, db))!.nextDayIndex).toBe(2);
    expect((await setNextDay(99, db))!.nextDayIndex).toBe(4);
    expect((await setNextDay(-3, db))!.nextDayIndex).toBe(0);
    await expect(choosePlan('nope', db)).rejects.toThrow('Plan not found');
    // Choosing again starts over.
    expect((await choosePlan('six-week-volume', db, 2000)).nextDayIndex).toBe(0);
  });

  it('weekFor: only weekly plans, only the active one', async () => {
    expect(weekFor(undefined, 'six-week-volume')).toBe(0);
    const s = { id: 'active' as const, planId: 'six-week-volume', startedAt: 0, weekIndex: 3, nextDayIndex: 0, doneDays: [] };
    expect(weekFor(s, 'six-week-volume')).toBe(3);
    expect(weekFor({ ...s, weekIndex: 12 }, 'six-week-volume')).toBe(5);
    expect(weekFor(s, 'ohrabah-split')).toBe(0);
    expect(weekFor({ ...s, planId: 'ohrabah-split' }, 'ohrabah-split')).toBe(0);
    expect(weekFor(s, 'nope')).toBe(0);
  });
});

describe('startPlanDay', () => {
  it('creates the session with planId, dayId, week and the day’s exercises in order', async () => {
    await choosePlan('ohrabah-split', db);
    const s = await startPlanDay('gym-1', 'ohrabah-split', 1, db, 5000);
    expect(s).toMatchObject({ gymId: 'gym-1', planId: 'ohrabah-split', dayId: '2', weekIndex: 0, startedAt: 5000, imported: false });
    expect(s.exerciseIds!.slice(0, 4)).toEqual([
      'band-internal-shoulder-rotation-0-degrees',
      'band-internal-shoulder-rotation-90-degrees',
      'dumbbell-bench-press',
      'barbell-incline-bench-press',
    ]);
    expect(s.exerciseIds).toHaveLength(10);
    expect(s.exerciseIds!.at(-1)).toBe('finisher-stair-climbing');
    // A double tap returns the same workout.
    expect((await startPlanDay('gym-1', 'ohrabah-split', 3, db)).id).toBe(s.id);
    expect((await startWorkout('gym-1', db)).id).toBe(s.id);
    expect(await db.sessions.count()).toBe(1);
    await expect(startPlanDay('gym-1', 'ohrabah-split', 9, db)).rejects.toThrow('Plan day not found');
    await expect(startPlanDay('gym-1', 'nope', 0, db)).rejects.toThrow('Plan day not found');
  });

  it('weekly table: the session keeps the week it started in', async () => {
    await choosePlan('six-week-volume', db);
    await db.planState.update('active', { weekIndex: 2 });
    const s = await startPlanDay('gym-1', 'six-week-volume', 0, db);
    expect(s.weekIndex).toBe(2);
  });
});

describe('finishing a plan day advances the plan', () => {
  it('next day, done checks, wrap', async () => {
    await choosePlan('ohrabah-split', db);
    const s1 = await startPlanDay('gym-1', 'ohrabah-split', 0, db);
    await logOne(s1.id);
    expect(await finishWorkout(s1.id, db)).toEqual({ saved: true, sets: 1 });
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 1, doneDays: [0], weekIndex: 0 });
    // Finishing twice does not advance twice.
    await finishWorkout(s1.id, db);
    expect((await getPlanState(db))!.nextDayIndex).toBe(1);

    // Change day to the last day, finish it: wraps to day 1 and clears the checks.
    await setNextDay(4, db);
    const s5 = await startPlanDay('gym-1', 'ohrabah-split', 4, db);
    await logOne(s5.id, 's5');
    await finishWorkout(s5.id, db);
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 0, doneDays: [], weekIndex: 0 });
  });

  it('weekly table wraps into the next week; an empty workout is discarded without advancing', async () => {
    await choosePlan('six-week-volume', db);
    await setNextDay(4, db);
    const empty = await startPlanDay('gym-1', 'six-week-volume', 4, db);
    expect(await finishWorkout(empty.id, db)).toEqual({ saved: false });
    expect((await getPlanState(db))!.nextDayIndex).toBe(4);
    const s = await startPlanDay('gym-1', 'six-week-volume', 4, db);
    await logOne(s.id);
    await finishWorkout(s.id, db);
    expect(await getPlanState(db)).toMatchObject({ nextDayIndex: 0, weekIndex: 1 });
  });

  it('a quick workout, another plan’s day or an unknown day changes nothing', async () => {
    await choosePlan('ohrabah-split', db);
    const quick = await startWorkout('gym-1', db);
    await logOne(quick.id);
    await finishWorkout(quick.id, db);
    expect((await getPlanState(db))!.nextDayIndex).toBe(0);
    await advanceAfter({ id: 'x', gymId: 'g', planId: 'six-week-volume', dayId: '1', startedAt: 0, imported: false }, db);
    await advanceAfter({ id: 'x', gymId: 'g', planId: 'ohrabah-split', dayId: '42', startedAt: 0, imported: false }, db);
    expect((await getPlanState(db))!.nextDayIndex).toBe(0);
    expect(await getActiveSession(db)).toBeUndefined();
  });
});
