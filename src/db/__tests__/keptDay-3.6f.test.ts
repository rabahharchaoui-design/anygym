// PLAN 3.6f round 3 (critic 7): four bench sets on Saturday keep Day 1 (under 60%). On Sunday Today
// says one thing: the day is the same day again, and the coach line is a continuation, never "you
// trained chest yesterday, and today works it again". One resolver (db/schedule.ts), one sentence.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ensureFirstGym } from '../bootstrap';
import { choosePlan } from '../planState';
import { readSchedule } from '../schedule';
import { coachData, regionWord } from '../coachData';
import { startPlanDay } from '../workoutStart';
import { finishWorkout } from '../workoutFinish';
import { logSet } from '../workoutSets';
import { saveGeneratedPlan } from '../savedPlans';
import { coachToday } from '../../lib/coach';
import { scheduleStyleOf } from '../../lib/plan/schedule';

let db: AnyGymDB;
let gymId: string;
const SAT = new Date(2026, 10, 14, 18).getTime();
const SUN = new Date(2026, 10, 15, 10).getTime();
const planId = 'mine-test-36f-kept';
const load = { kind: 'dumbbell_each' as const, unit: 'lb' as const, total: 40 };
// Day 1 has 17 working sets, bench first; Day 2 and 3 train other muscles.
const day1: Array<[string, number]> = [['dumbbell-bench-press', 4], ['cable-seated-close-grip-row', 4], ['dumbbell-arnold-shoulder-press', 3], ['cable-tricep-pushdown', 3], ['dumbbell-single-arm-preacher-curl', 3]];
const single = (id: string, sets: number) => ({ type: 'single' as const, id, exercise: id, sets, reps: [8, 12] as [number, number], restSec: 120 });

async function setUp(style: 'flexible' | 'fixed') {
  db = new AnyGymDB(`kept-36f-${Math.random()}`); await db.open();
  gymId = (await ensureFirstGym(db)).id;
  await db.profile.add({ id: 'me', defaultUnit: 'lb', createdAt: 1, intake: style === 'fixed' ? { scheduleStyle: 'fixed', weekdays: ['mon', 'wed', 'sat'] } : { scheduleStyle: 'flexible' } });
  await saveGeneratedPlan({ id: planId, name: 'Kept', daysPerWeek: 3, progressionMode: 'double', days: [
    { n: 1, name: 'Upper A', blocks: day1.map(([id, n]) => single(id, n)) },
    { n: 2, name: 'Lower', blocks: [single('barbell-back-squat', 3)] },
    { n: 3, name: 'Upper B', blocks: [single('cable-seated-close-grip-row', 3)] },
  ] }, db, SAT - 1000);
  await choosePlan(planId, db, SAT - 1000);
}
async function saturday() {
  const s = await startPlanDay(gymId, planId, 0, db, SAT);
  for (let i = 0; i < 4; i++) await logSet({ id: `bench-${i}`, sessionId: s.id, exerciseId: 'dumbbell-bench-press', reps: 8, load }, db);
  return finishWorkout(s.id, db, SAT + 1_800_000);
}
const today = async (now: number) => {
  const data = await coachData(now, db);
  return { data, coach: coachToday({ now, lifts: data.lifts, dates: data.dates, changes: data.changes, closed: data.closed, autoLevelUp: false, activeWorkout: data.active, plan: { scheduleStyle: scheduleStyleOf(data.profile?.intake), daysPerWeek: 3 }, ...(data.recovery ? { recovery: { ...data.recovery, nameOf: regionWord } } : {}), ...(data.kept ? { kept: data.kept } : {}) }) };
};
beforeEach(() => undefined);
afterEach(async () => { await db.delete(); });

describe.each(['flexible', 'fixed'] as const)('a day kept by the 60% rule, %s schedule', (style) => {
  beforeEach(() => setUp(style));
  it('Sunday: Day 1 stays, the resolver says it is kept, and the coach line is the continuation with the workout\'s own counts', async () => {
    const done = await saturday();
    expect(done).toMatchObject({ saved: true, progress: { logged: 4, planned: 17 } });
    expect((await db.planState.get('active'))!).toMatchObject({ nextDayIndex: 0, doneDays: [] });
    expect((await readSchedule(SUN, db)).resolved).toMatchObject({ dayIndex: 0, kept: true });
    const { data, coach } = await today(SUN);
    expect(data.kept).toEqual({ dayN: 1, logged: 4, planned: 17 });
    // The warning's own condition holds (chest yesterday, chest today): it is the kept day that silences it.
    expect(data.recovery!.yesterday).toContain('chest');
    expect(data.recovery!.next).toContain('chest');
    expect(coach.card).toBeNull();
    expect(coach.line).toBe('Day 1 again. You did 4 of 17 sets last time, so it stays up next and starts from the top.');
    expect(coach.line).not.toMatch(/again\. Go a little lighter|works (it|them) again/);
  });
  it('the words match what Start does: a new workout of the whole day with nothing logged', async () => {
    await saturday();
    const s = await startPlanDay(gymId, planId, 0, db, SUN);
    expect(s.dayId).toBe('1');
    expect(await db.sets.where('sessionId').equals(s.id).count()).toBe(0);
    expect(s.exerciseIds).toEqual(day1.map(([id]) => id));
    // While it runs the coach waits (Today shows Resume).
    expect((await today(SUN + 1000)).coach.line).toBeNull();
  });
  it('a day that moved on (60% or more) is not kept: no continuation line', async () => {
    const s = await startPlanDay(gymId, planId, 0, db, SAT);
    let k = 0;
    for (const [id, n] of day1.slice(0, 3)) for (let i = 0; i < n; i++) await logSet({ id: `s-${k++}`, sessionId: s.id, exerciseId: id, reps: 8, load }, db);
    await finishWorkout(s.id, db, SAT + 1_800_000);
    expect((await db.planState.get('active'))!.nextDayIndex).toBe(1);
    expect((await readSchedule(SUN, db)).resolved?.kept).toBeUndefined();
    expect((await today(SUN)).data.kept).toBeUndefined();
  });
});
