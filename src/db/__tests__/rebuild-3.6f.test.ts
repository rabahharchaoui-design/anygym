// PLAN 3.6f round 3 (critic BLOCKER 1): rebuilding "Your plan" (a new schedule, new focus areas, a
// day or minutes added) keeps the person's place, and every workout and set.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ensureFirstGym } from '../bootstrap';
import { saveIntake } from '../intake';
import { choosePlan, choosePlanUndoable, undoChoosePlan } from '../planState';
import { saveGeneratedPlan } from '../savedPlans';
import { readSchedule, saveWeeklySchedule } from '../schedule';
import { startPlanDay } from '../workoutStart';
import { finishWorkout } from '../workoutFinish';
import { equipmentPreset } from '../gyms';
import { generate } from '../../data/generator';
import { generatorInputOf } from '../../lib/intake/yourPlan';
import type { IntakeAnswers } from '../../lib/intake/funnel';
import { fillPlanDay } from './fillPlanDay';

let db: AnyGymDB;
let gymId: string;
const monday = new Date(2026, 10, 9, 18).getTime();
const tuesday = monday + 86_400_000;
const full = equipmentPreset('full', 'lb');
const base: IntakeAnswers = { goal: 'muscle', experience: '3y', days: 4, minutes: 60, place: 'full', equipment: [...full.equipment], scheduleStyle: 'flexible', focusPicks: ['lats', 'side_delts'] };

async function use(answers: IntakeAnswers, at: number) {
  const built = generate(generatorInputOf(answers));
  if (!built.ok) throw new Error(built.reason);
  await saveIntake(answers, db, at);
  await saveGeneratedPlan(built.plan as unknown as Record<string, unknown>, db, at);
  return choosePlanUndoable(built.plan.id, db, at);
}
async function doDayOne() {
  const first = await use(base, monday - 1000);
  const s = await startPlanDay(gymId, first.state.planId, 0, db, monday);
  await fillPlanDay(db, s.id, { kind: 'dumbbell_each', unit: 'lb', total: 20 });
  await finishWorkout(s.id, db, monday + 3_600_000);
  const state = (await db.planState.get('active'))!;
  expect(state).toMatchObject({ doneDays: [0], nextDayIndex: 1 });
  return { planId: first.state.planId, sessions: await db.sessions.toArray(), sets: await db.sets.toArray(), state };
}

beforeEach(async () => {
  db = new AnyGymDB(`rebuild-36f-${Math.random()}`);
  await db.open();
  gymId = (await ensureFirstGym(db)).id;
});
afterEach(async () => { await db.delete(); });

describe('rebuilding the plan keeps the place (critic 1)', () => {
  it('flexible, Day 1 done Monday; Tuesday the schedule becomes fixed Tue Thu Sat Sun: Today stays on Day 2 and nothing is lost', async () => {
    const before = await doDayOne();
    const r = await use({ ...base, scheduleStyle: 'fixed', weekdays: ['tue', 'thu', 'sat', 'sun'] }, tuesday);
    expect(r.changed).toBe(true);
    expect(r.state.planId).not.toBe(before.planId);
    expect(r.state).toMatchObject({ doneDays: [0], nextDayIndex: 1, startedAt: before.state.startedAt });
    expect((await readSchedule(tuesday, db)).resolved?.dayIndex).toBe(1);
    expect(await db.sessions.toArray()).toEqual(before.sessions);
    expect(await db.sets.toArray()).toEqual(before.sets);
    // The old plan is still on the phone: the finished workout finds the plan it came from.
    expect(await db.plans.get(before.planId)).toBeTruthy();
    // Undo puts back exactly the pointer from before.
    expect(await undoChoosePlan(r.state, r.previous, db)).toBe(true);
    expect(await db.planState.get('active')).toEqual(before.state);
  });
  it('a focus change keeps the place and every set', async () => {
    const before = await doDayOne();
    const r = await use({ ...base, focusPicks: ['upper_chest', 'biceps', 'quads'] }, tuesday);
    expect(r.state.planId).not.toBe(before.planId);
    expect(r.state).toMatchObject({ doneDays: [0], nextDayIndex: 1 });
    expect(r.state.pendingDayIndices).toEqual(before.state.pendingDayIndices);
    expect(await db.sets.toArray()).toEqual(before.sets);
  });
  it('the one tap fixes keep the place: add a day (the new day is not done), add minutes, both', async () => {
    const before = await doDayOne();
    const day = await use({ ...base, days: 5 }, tuesday);
    expect(day.state).toMatchObject({ doneDays: [0], nextDayIndex: 1 });
    expect(day.state.pendingDayIndices).toEqual([1, 2, 3, 4]);
    const minutes = await use({ ...base, days: 5, minutes: 75 }, tuesday + 1);
    expect(minutes.state).toMatchObject({ doneDays: [0], nextDayIndex: 1, pendingDayIndices: [1, 2, 3, 4] });
    const both = await use({ ...base, days: 6, minutes: 75 }, tuesday + 2);
    expect(both.state).toMatchObject({ doneDays: [0], nextDayIndex: 1, pendingDayIndices: [1, 2, 3, 4, 5] });
    expect(await db.sessions.toArray()).toEqual(before.sessions);
    expect(await db.sets.toArray()).toEqual(before.sets);
  });
  it('a day removed keeps what still exists; the weekly days picked survive a rebuild', async () => {
    await doDayOne();
    await saveIntake({ ...base, scheduleStyle: 'weekly' }, db, tuesday);
    const week = await saveWeeklySchedule(['tue', 'thu', 'sat'], tuesday, db);
    const r = await use({ ...base, scheduleStyle: 'weekly', days: 3 }, tuesday + 1);
    expect(r.state).toMatchObject({ doneDays: [0], nextDayIndex: 1 });
    expect((await db.profile.toArray())[0]!.weeklySchedule).toEqual(week);
  });
  it('a curated plan chosen instead starts at Day 1, and choosing the same build again changes nothing', async () => {
    const before = await doDayOne();
    expect(await choosePlan(before.planId, db, tuesday)).toEqual(before.state);
    const curated = await choosePlan('five-day-split', db, tuesday);
    expect(curated).toMatchObject({ doneDays: [], nextDayIndex: 0, startedAt: tuesday });
  });
});
