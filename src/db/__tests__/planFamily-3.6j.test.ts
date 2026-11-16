// PLAN 3.6j (audit A5): a coach tuned copy, or a rebuild of "Your plan", keeps the plan tied to its
// own workouts. Today never changes its mind without saying why, and a workout finished after a
// plan change mid workout still moves the plan.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ensureFirstGym } from '../bootstrap';
import { choosePlan, setFinishNextDay } from '../planState';
import { readSchedule } from '../schedule';
import { coachData } from '../coachData';
import { startPlanDay } from '../workoutStart';
import { finishWorkout } from '../workoutFinish';
import { logSet } from '../workoutSets';
import { saveGeneratedPlan } from '../savedPlans';
import { planById } from '../../data/plans';
import { profileFor } from '../../data/order';
import { planTips, tunedId } from '../../lib/coachTips';
import { fillPlanDay } from './fillPlanDay';

let db: AnyGymDB;
let gymId: string;
const SAT = new Date(2026, 10, 14, 18).getTime();
const SUN = new Date(2026, 10, 15, 10).getTime();
const planId = 'mine-test-36j-family';
const rebuiltId = 'mine-test-36j-family-rebuilt';
const load = { kind: 'dumbbell_each' as const, unit: 'lb' as const, total: 40 };
const day1: Array<[string, number]> = [['dumbbell-bench-press', 4], ['cable-seated-close-grip-row', 4], ['dumbbell-arnold-shoulder-press', 3], ['cable-tricep-pushdown', 3], ['dumbbell-single-arm-preacher-curl', 3]];
const single = (id: string, sets: number) => ({ type: 'single' as const, id, exercise: id, sets, reps: [8, 12] as [number, number], restSec: 120 });
const definition = (id: string) => ({ id, name: 'Family', daysPerWeek: 3, progressionMode: 'double', days: [
  { n: 1, name: 'Upper A', blocks: day1.map(([x, n]) => single(x, n)) },
  { n: 2, name: 'Lower', blocks: [single('barbell-back-squat', 3), single('deadlift', 3)] },
  { n: 3, name: 'Upper B', blocks: [single('cable-seated-close-grip-row', 3)] },
] });

async function setUp() {
  db = new AnyGymDB(`family-36j-${Math.random()}`); await db.open();
  gymId = (await ensureFirstGym(db)).id;
  await db.profile.add({ id: 'me', defaultUnit: 'lb', createdAt: 1, intake: { scheduleStyle: 'flexible' } });
  await saveGeneratedPlan(definition(planId), db, SAT - 1000);
  await choosePlan(planId, db, SAT - 1000);
}
/** The coach tuned copy "Apply all" makes (every tip that applies to the plan). */
function tunedCopy(): string {
  const tips = planTips(planById(planId)!, profileFor).map((t) => t.id);
  expect(tips.length).toBeGreaterThan(0);
  const id = tunedId(planId, tips);
  expect(planById(id)).toBeDefined();
  return id;
}
async function partDone() {
  const s = await startPlanDay(gymId, planId, 0, db, SAT);
  for (let i = 0; i < 4; i++) await logSet({ id: `bench-${i}`, sessionId: s.id, exerciseId: 'dumbbell-bench-press', reps: 8, load }, db);
  await finishWorkout(s.id, db, SAT + 1_800_000);
  expect((await db.planState.get('active'))!).toMatchObject({ nextDayIndex: 0, doneDays: [] });
}
afterEach(async () => { await db.delete(); });

describe('A5: a day kept by the 60% rule stays kept after the plan becomes its tuned copy', () => {
  it('before and after "Use this plan" on the copy: Day 1 again, with the same counts', async () => {
    await setUp();
    await partDone();
    expect((await readSchedule(SUN, db)).resolved).toMatchObject({ dayIndex: 0, kept: true });
    expect((await coachData(SUN, db)).kept).toEqual({ dayN: 1, logged: 4, planned: 17 });
    const tuned = tunedCopy();
    await choosePlan(tuned, db, SUN - 1000);
    expect((await db.planState.get('active'))!).toMatchObject({ planId: tuned, nextDayIndex: 0 });
    expect((await readSchedule(SUN, db)).resolved).toMatchObject({ dayIndex: 0, kept: true });
    const kept = (await coachData(SUN, db)).kept!;
    expect(kept.dayN).toBe(1);
    expect(kept.logged).toBe(4);
  });
  it('a rebuild of "Your plan" keeps the kept day too', async () => {
    await setUp();
    await partDone();
    await saveGeneratedPlan(definition(rebuiltId), db, SUN - 2000);
    await choosePlan(rebuiltId, db, SUN - 1000);
    expect((await readSchedule(SUN, db)).resolved).toMatchObject({ dayIndex: 0, kept: true });
    expect((await coachData(SUN, db)).kept).toMatchObject({ dayN: 1, logged: 4 });
  });
  it('another plan family is still not counted as the kept day\'s own workout', async () => {
    await setUp();
    await partDone();
    // A curated plan: a new pointer at Day 1, no part done marker, nothing kept.
    await choosePlan('five-day-split', db, SUN - 1000);
    expect((await readSchedule(SUN, db)).resolved?.kept).toBeUndefined();
  });
});

describe('A5 second half: a plan change mid workout, then Finish', () => {
  it('Use this plan on the tuned copy mid workout: Finish still ticks the day and moves on', async () => {
    await setUp();
    const s = await startPlanDay(gymId, planId, 0, db, SAT);
    await choosePlan(tunedCopy(), db, SAT + 60_000);
    await fillPlanDay(db, s.id, load);
    await finishWorkout(s.id, db, SAT + 3_600_000);
    expect((await db.planState.get('active'))!).toMatchObject({ nextDayIndex: 1, doneDays: [0] });
    // "Change" on the finish screen works for it as well.
    expect((await setFinishNextDay(s.id, 2, db)).nextDayIndex).toBe(2);
  });
  it('a rebuild mid workout: Finish moves the rebuilt plan by position', async () => {
    await setUp();
    const s = await startPlanDay(gymId, planId, 0, db, SAT);
    await saveGeneratedPlan(definition(rebuiltId), db, SAT + 30_000);
    await choosePlan(rebuiltId, db, SAT + 60_000);
    await fillPlanDay(db, s.id, load);
    await finishWorkout(s.id, db, SAT + 3_600_000);
    expect((await db.planState.get('active'))!).toMatchObject({ planId: rebuiltId, nextDayIndex: 1, doneDays: [0] });
  });
  it('a workout of another plan family still changes nothing', async () => {
    await setUp();
    const s = await startPlanDay(gymId, planId, 0, db, SAT);
    await choosePlan('five-day-split', db, SAT + 60_000);
    await fillPlanDay(db, s.id, load);
    await finishWorkout(s.id, db, SAT + 3_600_000);
    expect((await db.planState.get('active'))!).toMatchObject({ planId: 'five-day-split', nextDayIndex: 0, doneDays: [] });
  });
});

describe('A5: Undo of that Finish', () => {
  it('puts the pointer back as it was before Finish', async () => {
    const { reopenWorkoutWithPending } = await import('../workoutReopen');
    await setUp();
    const s = await startPlanDay(gymId, planId, 0, db, SAT);
    const tuned = tunedCopy();
    await choosePlan(tuned, db, SAT + 60_000);
    const before = (await db.planState.get('active'))!;
    await fillPlanDay(db, s.id, load);
    await finishWorkout(s.id, db, SAT + 3_600_000);
    expect((await reopenWorkoutWithPending(s.id, undefined, db)).ok).toBe(true);
    expect(await db.planState.get('active')).toEqual(before);
  });
});

describe('samePlanFamily and familyDayIndex', () => {
  it('ties a tuned copy to its origin and two builds of Your plan, never other plans', async () => {
    const { samePlanFamily, familyDayIndex } = await import('../../data/planFamily');
    await setUp();
    const tuned = tunedCopy();
    expect(samePlanFamily(tuned, planId)).toBe(true);
    expect(samePlanFamily(planId, rebuiltId)).toBe(true);
    expect(samePlanFamily('five-day-split', planId)).toBe(false);
    expect(samePlanFamily(undefined, planId)).toBe(false);
    expect(samePlanFamily(tunedId('five-day-split', ['rest']), 'five-day-split')).toBe(true);
    expect(samePlanFamily('five-day-split', 'six-week-volume')).toBe(false);
    const copy = planById(tuned)!;
    expect(familyDayIndex(copy, planId, '2')).toBe(1);
    expect(familyDayIndex(copy, planId, '9')).toBe(-1);
    expect(familyDayIndex(copy, 'five-day-split', '1')).toBe(-1);
    // A build this phone cannot read: no guess.
    expect(familyDayIndex(copy, 'mine-not-on-this-phone', '1')).toBe(-1);
  });
});
