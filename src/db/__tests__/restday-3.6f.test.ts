// PLAN 3.6f truth pass (third critique, item 5): on a rest day the coach never says "today works
// it again". The same day read as a training day keeps the line.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { ensureFirstGym } from '../bootstrap';
import { choosePlan } from '../planState';
import { saveGeneratedPlan } from '../savedPlans';
import { coachData, regionWord } from '../coachData';
import { readSchedule } from '../schedule';
import { coachToday } from '../../lib/coach';
import { restDayWords } from '../../lib/plan/scheduleWords';

let db: AnyGymDB;
const tue = new Date(2026, 10, 10, 12).getTime();
const wed = new Date(2026, 10, 11, 9).getTime();
const planId = 'mine-test-36f-restday';
const load = { kind: 'dumbbell_each' as const, unit: 'lb' as const, total: 10 };
beforeEach(async () => {
  db = new AnyGymDB(`restday-36f-${Math.random()}`); await db.open();
  const gym = await ensureFirstGym(db);
  // Two days that both open with the bench press: Day 2 works the chest again.
  await saveGeneratedPlan({ id: planId, name: 'Two days', daysPerWeek: 2, progressionMode: 'double', days: [1, 2].map((n) => ({ n, name: `Day ${n}`, blocks: [{ type: 'single', id: 'dumbbell-bench-press', exercise: 'dumbbell-bench-press', sets: 3, reps: [8, 12], restSec: 120 }] })) }, db, tue);
  await choosePlan(planId, db, tue);
  // Tuesday: Day 1 done.
  await db.sessions.add({ id: 'day1', gymId: gym.id, planId, dayId: '1', startedAt: tue, endedAt: tue + 3_600_000, imported: false });
  for (let i = 0; i < 3; i++) await db.sets.add({ id: `day1-${i}`, sessionId: 'day1', exerciseId: 'dumbbell-bench-press', order: i, kind: 'work', reps: 8, load, uncertain: false });
  await db.planState.update('active', { nextDayIndex: 1, doneDays: [0] });
});
afterEach(async () => { await db.delete(); });

const lineOn = async (weekdays: string[]) => {
  await db.profile.put({ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 2, intake: { scheduleStyle: 'fixed', weekdays: weekdays as never, days: 2 } });
  const d = await coachData(wed, db);
  const today = coachToday({ now: d.now, lifts: d.lifts, dates: d.dates, changes: d.changes, closed: d.closed, autoLevelUp: false, activeWorkout: d.active, ...(d.recovery ? { recovery: { ...d.recovery, nameOf: regionWord } } : {}) });
  return { recovery: d.recovery, line: today.line, schedule: await readSchedule(wed, db) };
};

describe('a rest day says one thing', () => {
  it('Wednesday is a training day (Tue, Wed): the coach warns that today works the chest again', async () => {
    const x = await lineOn(['tue', 'wed']);
    expect(x.schedule.restDay).toBeNull();
    expect(x.line).toBe('You trained chest yesterday, and today works it again. Go a little lighter if it feels tired.');
  });
  it('Wednesday is a rest day (Tue, Thu): the day card says "Rest day · Next: tomorrow, Day 2" and the coach stays quiet', async () => {
    const x = await lineOn(['tue', 'thu']);
    expect(restDayWords(x.schedule.restDay, 2, wed)).toEqual({ title: 'Rest day', next: 'Next: tomorrow, Day 2' });
    expect(x.recovery).toBeUndefined();
    expect(x.line).toBeNull();
  });
  it('a week to week schedule with Wednesday not picked reads the same way', async () => {
    await db.profile.put({ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 2, intake: { scheduleStyle: 'weekly', days: 2 }, weeklySchedule: { weekKey: (await readSchedule(wed, db)).weekKey, weekdays: ['tue', 'fri'], answeredAt: tue } });
    const d = await coachData(wed, db);
    expect((await readSchedule(wed, db)).restDay).not.toBeNull();
    expect(d.recovery).toBeUndefined();
  });
});

describe('3.6g2: a fixed day finished today is done for today', () => {
  const fixed = (weekdays: string[]) => db.profile.put({ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 2, intake: { scheduleStyle: 'fixed', weekdays: weekdays as never, days: 2 } });
  const evening = tue + 5 * 3_600_000;
  it('Tuesday evening after Day 1 (Tue, Thu): "Done for today · Next: Thu, Day 2" and "Train again today", never Start for Day 2; the coach says nothing about today', async () => {
    await fixed(['tue', 'thu']);
    const s = await readSchedule(evening, db);
    expect(s.restDay).toMatchObject({ done: true });
    expect(restDayWords(s.restDay, 2, evening)).toEqual({ title: 'Done for today', next: 'Next: Thu, Day 2', start: 'Train again today' });
    expect((await coachData(evening, db)).recovery).toBeUndefined();
  });
  it('the next training day is tomorrow (Tue, Wed): "Next: tomorrow, Day 2"; and on Wednesday morning Day 2 has its Start again', async () => {
    await fixed(['tue', 'wed']);
    expect(restDayWords((await readSchedule(evening, db)).restDay, 2, evening)).toEqual({ title: 'Done for today', next: 'Next: tomorrow, Day 2', start: 'Train again today' });
    expect((await readSchedule(wed, db)).restDay).toBeNull();
  });
  it('a day stopped early and kept up next (under 60% done) is not done: it still waits with its Start', async () => {
    await fixed(['tue', 'thu']);
    await db.planState.update('active', { nextDayIndex: 0, doneDays: [], partial: { 0: 0.4 } });
    const s = await readSchedule(evening, db);
    expect(s.resolved).toMatchObject({ kept: true });
    expect(s.restDay).toBeNull();
  });
  it('a flexible rotation has no calendar: nothing changes there', async () => {
    await db.profile.put({ id: 'me', defaultUnit: 'lb', createdAt: 1, intakeDoneAt: 2, intake: { scheduleStyle: 'flexible', days: 2 } });
    expect((await readSchedule(evening, db)).restDay).toBeNull();
  });
});
