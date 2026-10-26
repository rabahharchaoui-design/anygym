import { describe, expect, it } from 'vitest';
import { planById } from '../../data/plans';
import { ADVANCE_SHARE, finishPlanPosition, movesOn } from '../finishPlan';

const split5 = planById('five-day-split')!;
const sixWeek = planById('six-week-volume')!;
const start = { nextDayIndex: 0, weekIndex: 0, doneDays: [] as number[] };
const p = (share: number) => ({ share, complete: share >= 1 });

describe('movesOn: the 60% rule (PLAN 2.0a)', () => {
  it('59% keeps the day, 60% moves on; the unrounded share decides', () => {
    expect(ADVANCE_SHARE).toBe(0.6);
    expect(movesOn(0)).toBe(false);
    expect(movesOn(0.59)).toBe(false);
    expect(movesOn(0.5999)).toBe(false); // shows as "60%", still keeps the day
    expect(movesOn(22 / 37)).toBe(false);
    expect(movesOn(0.6)).toBe(true);
    expect(movesOn(23 / 37)).toBe(true);
    expect(movesOn(1)).toBe(true);
  });
});

describe('finishPlanPosition', () => {
  it('0% and 59% keep the same day with a partial ring; nothing else changes', () => {
    const state = { ...start, nextDayIndex: 2, doneDays: [0, 1], partial: { 4: 0.3 } };
    expect(finishPlanPosition(state, split5, 2, p(0.59))).toEqual({ nextDayIndex: 2, weekIndex: 0, doneDays: [0, 1], partial: { 2: 0.59, 4: 0.3 } });
    expect(finishPlanPosition(state, split5, 2, p(0))).toEqual({ nextDayIndex: 2, weekIndex: 0, doneDays: [0, 1], partial: { 2: 0, 4: 0.3 } });
  });

  it('60% and 99% move on to the next day with a partial ring and no tick', () => {
    expect(finishPlanPosition(start, split5, 0, p(0.6))).toEqual({ nextDayIndex: 1, weekIndex: 0, doneDays: [], partial: { 0: 0.6 } });
    expect(finishPlanPosition({ ...start, doneDays: [3] }, split5, 0, p(0.99))).toEqual({ nextDayIndex: 1, weekIndex: 0, doneDays: [3], partial: { 0: 0.99 } });
  });

  it('100% moves on with the tick and drops the day’s partial ring', () => {
    expect(finishPlanPosition({ ...start, partial: { 0: 0.4, 2: 0.7 } }, split5, 0, p(1))).toEqual({ nextDayIndex: 1, weekIndex: 0, doneDays: [0], partial: { 2: 0.7 } });
  });

  it('the day done is the session’s day, not the pointer (Change day before starting)', () => {
    expect(finishPlanPosition({ ...start, nextDayIndex: 0 }, split5, 3, p(0.8)).nextDayIndex).toBe(4);
    expect(finishPlanPosition({ ...start, nextDayIndex: 0 }, split5, 3, p(0.2)).nextDayIndex).toBe(3);
  });

  it('the last day wraps to Day 1 and starts the pass over', () => {
    const state = { ...start, nextDayIndex: 4, doneDays: [0, 1, 2], partial: { 3: 0.7 } };
    expect(finishPlanPosition(state, split5, 4, p(1))).toEqual({ nextDayIndex: 0, weekIndex: 0, doneDays: [], partial: {} });
    expect(finishPlanPosition(state, split5, 4, p(0.7))).toEqual({ nextDayIndex: 0, weekIndex: 0, doneDays: [], partial: {} });
    // Below 60% on the last day: it stays, no wrap.
    expect(finishPlanPosition(state, split5, 4, p(0.5))).toMatchObject({ nextDayIndex: 4, doneDays: [0, 1, 2] });
  });

  it('a weekly plan moves one week on when it wraps, and stays on its last week after that', () => {
    const last = sixWeek.days.length - 1;
    expect(finishPlanPosition({ ...start, nextDayIndex: last, weekIndex: 0 }, sixWeek, last, p(0.6))).toMatchObject({ nextDayIndex: 0, weekIndex: 1 });
    expect(finishPlanPosition({ ...start, nextDayIndex: 1, weekIndex: 2 }, sixWeek, 1, p(1))).toMatchObject({ nextDayIndex: 2, weekIndex: 2 });
    expect(finishPlanPosition({ ...start, nextDayIndex: last, weekIndex: 5 }, sixWeek, last, p(1))).toMatchObject({ nextDayIndex: 0, weekIndex: 5 });
    // Below 60% on the last day of a week: same day, same week.
    expect(finishPlanPosition({ ...start, nextDayIndex: last, weekIndex: 3 }, sixWeek, last, p(0.3))).toMatchObject({ nextDayIndex: last, weekIndex: 3 });
  });

  it('a one day plan wraps onto itself; a bad share counts as nothing', () => {
    const one = { days: [split5.days[0]!], progressionMode: split5.progressionMode, weeks: split5.weeks };
    expect(finishPlanPosition(start, one, 0, p(0.9))).toEqual({ nextDayIndex: 0, weekIndex: 0, doneDays: [], partial: {} });
    expect(finishPlanPosition(start, split5, 0, { share: NaN, complete: false })).toMatchObject({ nextDayIndex: 0, partial: { 0: 0 } });
  });
});
