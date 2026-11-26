import { describe, expect, it } from 'vitest';
import { nextWord, planLine, planWeekRows } from '../weekRows';

const plan = { weeks: undefined, days: [1, 2, 3, 4, 5].map((n) => ({ n, name: `Day name ${n}` })) } as never;

describe('planWeekRows (PLAN M6, board 10)', () => {
  it('marks the pass: done, part done, the day up next, the rest still to do', () => {
    const rows = planWeekRows(plan, { doneDays: [0, 1], partial: { 2: 0.5 } }, { nextIndex: 3, flexible: true });
    expect(rows.map((r) => r.state)).toEqual(['done', 'done', 'partial', 'next', 'todo']);
    expect(rows[3]).toMatchObject({ n: 4, name: 'Day name 4', index: 3 });
  });

  it('a fresh plan has no tick anywhere', () => {
    const rows = planWeekRows(plan, { doneDays: [] }, { nextIndex: 0, flexible: true });
    expect(rows.filter((r) => r.state === 'done')).toEqual([]);
  });

  it('every day resting (next is null) marks no day as next', () => {
    const rows = planWeekRows(plan, { doneDays: [0] }, { nextIndex: null, flexible: true });
    expect(rows.some((r) => r.state === 'next')).toBe(false);
  });

  it('fixed schedule: only days trained this calendar week keep their tick (as Today)', () => {
    const rows = planWeekRows(plan, { doneDays: [0, 1] }, { nextIndex: 2, flexible: false, weekDays: [1] });
    expect(rows.map((r) => r.state)).toEqual(['todo', 'done', 'next', 'todo', 'todo']);
  });
});

describe('planLine', () => {
  it('the name alone on a rotation', () => expect(planLine({ name: 'Five Day Split', weeks: undefined }, 0)).toBe('Five Day Split'));
  it('the week of a set length plan', () => expect(planLine({ name: 'Six Week', weeks: 6 }, 1)).toBe('Six Week · Week 2 of 6'));
  it('fixed weekdays, Monday first', () => expect(planLine({ name: 'P', weeks: undefined }, 0, ['fri', 'mon', 'wed'])).toBe('P · Mon, Wed, Fri'));
});

describe('nextWord', () => {
  it('Today only on a calendar training day', () => {
    expect(nextWord(false, false)).toBe('Today');
    expect(nextWord(false, true)).toBe('Next');
    expect(nextWord(true, false)).toBe('Next');
  });
});
