// PLAN 3.6f truth pass (third critique, items 7, 9 and 12): "This week" means this week, the
// reveal's weekday labels are the ones Today will follow, and adding a day says what will be.
import { describe, expect, it } from 'vitest';
import { stripMarks, weekDaysOf } from '../weekStrip';
import { comingOrder } from '../carry';
import { addDayWords, comingWeekdays } from '../weekdays';
import { weekOf } from '../../intake/planPick';
import type { Plan } from '../../plans';

const at = (day: number, hour = 10) => new Date(2026, 10, day, hour).getTime(); // November 2026: the 16th and the 23rd are Mondays

describe('critic 9: the strip under "This week" starts fresh each calendar week on a fixed schedule', () => {
  const state = { doneDays: [0], partial: { 1: 0.4 } };
  const workouts = [{ startedAt: at(16), dayIndex: 0 }, { startedAt: at(18), dayIndex: 1 }];
  it('in the week of the workout Day 1 shows as done; the following Monday it does not, though the pass still holds it', () => {
    expect(weekDaysOf('fixed', workouts, at(20))).toEqual([0, 1]);
    expect(stripMarks(state, weekDaysOf('fixed', workouts, at(20)))).toEqual({ done: [0], partial: { 1: 0.4 } });
    // Monday the 23rd, 8 AM: nothing has been trained this week.
    expect(weekDaysOf('fixed', workouts, at(23, 8))).toEqual([]);
    expect(stripMarks(state, weekDaysOf('fixed', workouts, at(23, 8)))).toEqual({ done: [], partial: {} });
    // Sunday the 22nd is still the first week.
    expect(weekDaysOf('fixed', workouts, at(22, 23))).toEqual([0, 1]);
    // A workout later in the new week shows again, on its own day only.
    expect(stripMarks({ doneDays: [0, 2], partial: {} }, weekDaysOf('fixed', [...workouts, { startedAt: at(23, 9), dayIndex: 2 }], at(23, 12)))).toEqual({ done: [2], partial: {} });
  });
  it('a rotation keeps its own cycle: flexible and week to week show every mark of the pass', () => {
    for (const style of ['flexible', 'weekly'] as const) {
      expect(weekDaysOf(style, workouts, at(23, 8))).toBeNull();
      expect(stripMarks(state, weekDaysOf(style, workouts, at(23, 8)))).toEqual({ done: [0], partial: { 1: 0.4 } });
    }
    expect(stripMarks(state, undefined)).toEqual({ done: [0], partial: { 1: 0.4 } });
  });
  it('a workout that is not a plan day, or dated after now, marks nothing', () => {
    expect(weekDaysOf('fixed', [{ startedAt: at(17), dayIndex: -1 }, { startedAt: at(19), dayIndex: 2 }], at(18))).toEqual([]);
  });
});

describe('critic 7: the reveal labels each day with the weekday Today will follow', () => {
  const plan = { days: ['Upper A', 'Lower A', 'Upper B', 'Lower B'].map((name, i) => ({ n: i + 1, name, blocks: [] })) } as unknown as Plan;
  const answers = { scheduleStyle: 'fixed' as const, weekdays: ['tue', 'thu', 'sat', 'sun'] as const };
  it('Day 1 done on Monday, then Tue, Thu, Sat, Sun picked on Tuesday: Tuesday is Lower A, and Upper A comes round on Sunday', () => {
    const order = comingOrder({ nextDayIndex: 1, doneDays: [0] }, 4);
    expect(order).toEqual([1, 2, 3, 0]);
    expect(weekOf(plan, { ...answers, weekdays: [...answers.weekdays] }, { order, now: at(17) }).map((w) => `${w.label} ${w.dayName}`)).toEqual(['Tue Lower A', 'Thu Upper B', 'Sat Lower B', 'Sun Upper A']);
    // What the critic saw before: "Tue Upper A" (the weekdays laid over Day 1 to 4 by position).
    expect(weekOf(plan, { ...answers, weekdays: [...answers.weekdays] }).map((w) => `${w.label} ${w.dayName}`)[0]).toBe('Tue Upper A');
  });
  it('a fresh plan starts on the next training weekday from today, today included', () => {
    const fresh = comingOrder(undefined, 4);
    expect(fresh).toEqual([0, 1, 2, 3]);
    // Friday: the first workout is Saturday's.
    expect(weekOf(plan, { ...answers, weekdays: [...answers.weekdays] }, { order: fresh, now: at(20) }).map((w) => w.label)).toEqual(['Sat', 'Sun', 'Tue', 'Thu']);
    expect(comingWeekdays(['mon', 'wed', 'fri'], at(18))).toEqual(['wed', 'fri', 'mon']);
    expect(comingWeekdays(['mon', 'wed', 'fri'], at(22))).toEqual(['mon', 'wed', 'fri']);
    expect(comingWeekdays(['mon', 'wed', 'fri'], at(16))).toEqual(['mon', 'wed', 'fri']);
  });
  it('a rotation keeps "Day 1" to "Day N" in plan order, and a place that is not a full order is ignored', () => {
    expect(weekOf(plan, { scheduleStyle: 'flexible' }, { order: [1, 2, 3, 0], now: at(17) }).map((w) => w.label)).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4']);
    expect(weekOf(plan, { ...answers, weekdays: [...answers.weekdays] }, { order: [1, 1, 2], now: at(17) }).map((w) => w.dayIndex)).toEqual([0, 1, 2, 3]);
  });
  it('the order follows a saved rotation order, the day up next first, every day once', () => {
    expect(comingOrder({ nextDayIndex: 2, doneDays: [0], pendingDayIndices: [2, 1, 3] }, 4)).toEqual([2, 1, 3, 0]);
    expect(comingOrder({ nextDayIndex: 9, doneDays: [] }, 3)).toEqual([0, 1, 2]);
  });
});

describe('critic 12: adding a day says the plan as it will be', () => {
  it('the hint never says the plan "has" days it does not have yet', () => {
    expect(addDayWords(3, 2)).toBe('Your plan will have 3 days. Pick 1 more.');
    expect(addDayWords(6, 4)).toBe('Your plan will have 6 days. Pick 2 more.');
  });
});
