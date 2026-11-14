// PLAN 3.6f truth pass (third critique, item 9): on a fixed schedule "This week" starts fresh each
// calendar week. The clock is faked across two weeks; the saved pointer is never touched.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ensureFirstGym } from '../bootstrap';
import { choosePlan } from '../planState';
import { saveGeneratedPlan } from '../savedPlans';
import { readSchedule } from '../schedule';
import { startPlanDay } from '../workoutStart';
import { finishWorkout } from '../workoutFinish';
import { logSet } from '../workoutSets';
import { stripMarks } from '../../lib/plan/weekStrip';

let db: AnyGymDB;
let gymId: string;
const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).getTime(); // the 16th and the 23rd of November 2026 are Mondays
const planId = 'mine-test-36f-week';
const load = { kind: 'dumbbell_each' as const, unit: 'lb' as const, total: 10 };
const days = ['dumbbell-bench-press', 'barbell-back-squat', 'cable-seated-close-grip-row'];
const planOf = (id: string) => ({ id, name: 'Three days', daysPerWeek: 3, progressionMode: 'double', days: days.map((ex, i) => ({ n: i + 1, name: `Day ${i + 1}`, blocks: [{ type: 'single', id: ex, exercise: ex, sets: 3, reps: [8, 12], restSec: 120 }] })) });
async function setUp(style: 'fixed' | 'flexible') {
  db = new AnyGymDB(`week-36f-${Math.random()}`); await db.open();
  gymId = (await ensureFirstGym(db)).id;
  await db.profile.add({ id: 'me', defaultUnit: 'lb', createdAt: 1, intake: style === 'fixed' ? { scheduleStyle: 'fixed', weekdays: ['mon', 'wed', 'sat'], days: 3 } : { scheduleStyle: 'flexible', days: 3 } });
  await saveGeneratedPlan(planOf(planId), db, at(14));
  await choosePlan(planId, db, at(14));
}
async function train(dayIndex: number, now: number) {
  const s = await startPlanDay(gymId, planId, dayIndex, db, now);
  for (let i = 0; i < 3; i++) await logSet({ id: `${s.id}-${i}`, sessionId: s.id, exerciseId: days[dayIndex]!, reps: 8, load }, db);
  await finishWorkout(s.id, db, now + 1_800_000);
}
afterEach(async () => { await db.delete(); });

describe('fixed schedule: the strip under "This week"', () => {
  beforeEach(() => setUp('fixed'));
  it('Day 1 done on Monday the 16th shows that week, and not on Monday the 23rd, while the pass keeps it', async () => {
    await train(0, at(16));
    const state = (await db.planState.get('active'))!;
    expect(state).toMatchObject({ nextDayIndex: 1, doneDays: [0] });
    const tue = await readSchedule(at(17), db);
    expect(tue.weekDays).toEqual([0]);
    expect(stripMarks(state, tue.weekDays).done).toEqual([0]);
    const sun = await readSchedule(at(22, 22), db);
    expect(sun.weekDays).toEqual([0]);
    // The following Monday: a new week, nothing trained in it. The saved pointer is as it was: Day 2 is still next.
    const mon = await readSchedule(at(23, 8), db);
    expect(mon.weekDays).toEqual([]);
    expect(stripMarks(state, mon.weekDays)).toEqual({ done: [], partial: {} });
    expect(mon.resolved).toMatchObject({ dayIndex: 1 });
    expect((await db.planState.get('active'))!).toEqual(state);
    // Day 2 on that Monday: this week shows Day 2 only.
    await train(1, at(23, 9));
    const after = (await db.planState.get('active'))!;
    expect(after.doneDays).toEqual([0, 1]);
    expect(stripMarks(after, (await readSchedule(at(23, 12), db)).weekDays).done).toEqual([1]);
  });
  it('a rebuilt "Your plan" keeps this week\'s marks (its days carry over by position)', async () => {
    await train(0, at(16));
    await saveGeneratedPlan(planOf('mine-test-36f-week-rebuilt'), db, at(17));
    const state = await choosePlan('mine-test-36f-week-rebuilt', db, at(17));
    expect(state).toMatchObject({ planId: 'mine-test-36f-week-rebuilt', doneDays: [0], nextDayIndex: 1 });
    expect((await readSchedule(at(17, 12), db)).weekDays).toEqual([0]);
  });
});

describe('a rotation keeps its own cycle', () => {
  beforeEach(() => setUp('flexible'));
  it('flexible: no calendar week is read, so the pass\'s marks all show under "This rotation"', async () => {
    await train(0, at(16));
    const mon = await readSchedule(at(23, 8), db);
    expect(mon.weekDays).toBeNull();
    expect(stripMarks((await db.planState.get('active'))!, mon.weekDays).done).toEqual([0]);
  });
});
