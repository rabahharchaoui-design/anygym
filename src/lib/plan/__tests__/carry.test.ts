import { describe, expect, it } from 'vitest';
import { carryPlace, hasProgress } from '../carry';
import type { PlanState } from '../../../db/profileTypes';

const plan = (n: number, extra: object = {}) => ({ id: `mine-new-${n}`, days: Array.from({ length: n }, () => ({})) as never, progressionMode: 'double' as const, ...extra });
const prev = (p: Partial<PlanState>): PlanState => ({ id: 'active', planId: 'mine-old', startedAt: 5, weekIndex: 0, nextDayIndex: 0, doneDays: [], ...p });

describe('carryPlace: a rebuilt plan keeps the place', () => {
  it('same day count keeps every position, the queue and the chosen day', () => {
    const r = carryPlace(prev({ nextDayIndex: 2, doneDays: [0], partial: { 1: 0.7 }, pendingDayIndices: [2, 1, 3], chosenDayIndex: 2 }), plan(4), true, 99);
    expect(r).toEqual({ kept: true, state: { id: 'active', planId: 'mine-new-4', startedAt: 5, weekIndex: 0, nextDayIndex: 2, doneDays: [0], partial: { 1: 0.7 }, pendingDayIndices: [2, 1, 3], chosenDayIndex: 2 } });
  });
  it('a day added: done days stay done, the new day is never marked done and joins the end of the queue', () => {
    const r = carryPlace(prev({ nextDayIndex: 1, doneDays: [0], pendingDayIndices: [1, 2] }), plan(4), true, 99);
    expect(r.kept).toBe(true);
    expect(r.state.doneDays).toEqual([0]);
    expect(r.state.nextDayIndex).toBe(1);
    expect(r.state.pendingDayIndices).toEqual([1, 2, 3]);
  });
  it('a day removed: marks of the day that is gone are dropped, the next day is one that exists', () => {
    const r = carryPlace(prev({ nextDayIndex: 3, doneDays: [0, 2], partial: { 3: 0.3 }, chosenDayIndex: 3 }), plan(3), true, 99);
    expect(r.kept).toBe(true);
    expect(r.state).toMatchObject({ doneDays: [0, 2], nextDayIndex: 1 });
    expect(r.state.partial).toBeUndefined();
    expect(r.state.chosenDayIndex).toBeUndefined();
  });
  it('nothing left to do among the days that still exist: starts again from Day 1 and says so (kept false)', () => {
    const r = carryPlace(prev({ nextDayIndex: 3, doneDays: [0, 1, 2] }), plan(3), true, 99);
    expect(r).toEqual({ kept: false, state: { id: 'active', planId: 'mine-new-3', startedAt: 5, weekIndex: 0, nextDayIndex: 0, doneDays: [] } });
  });
  it('an unrelated plan starts over; a plan with a length keeps its week, clamped', () => {
    expect(carryPlace(prev({ doneDays: [0], nextDayIndex: 1 }), plan(3), false, 99)).toEqual({ kept: false, state: { id: 'active', planId: 'mine-new-3', startedAt: 99, weekIndex: 0, nextDayIndex: 0, doneDays: [] } });
    expect(carryPlace(prev({ weekIndex: 4 }), plan(3, { progressionMode: 'weekly_table', weeks: 6 }), true, 99).state.weekIndex).toBe(4);
    expect(carryPlace(prev({ weekIndex: 9 }), plan(3, { progressionMode: 'weekly_table', weeks: 6 }), true, 99).state.weekIndex).toBe(5);
  });
  it('never marks a day done that was not, for any shape (seeded)', () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let i = 0; i < 500; i++) {
      const oldN = 2 + rnd(5), newN = 2 + rnd(5);
      const done = Array.from({ length: oldN }, (_, d) => d).filter(() => rnd(2) === 0);
      const left = Array.from({ length: oldN }, (_, d) => d).filter((d) => !done.includes(d));
      const p = prev({ doneDays: done, nextDayIndex: left[0] ?? 0, ...(rnd(2) ? { pendingDayIndices: left } : {}) });
      const r = carryPlace(p, plan(newN), true, 1);
      expect(r.state.doneDays.every((d) => done.includes(d) && d < newN)).toBe(true);
      expect(r.state.doneDays).not.toContain(r.state.nextDayIndex);
      expect(r.state.nextDayIndex).toBeLessThan(newN);
      if (r.kept) expect(r.state.doneDays).toEqual(done.filter((d) => d < newN));
      if (r.state.pendingDayIndices) expect([...r.state.pendingDayIndices].sort()).toEqual(Array.from({ length: newN }, (_, d) => d).filter((d) => !r.state.doneDays.includes(d)));
    }
  });
  it('hasProgress', () => {
    expect(hasProgress(undefined)).toBe(false);
    expect(hasProgress(prev({}))).toBe(false);
    expect(hasProgress(prev({ partial: { 0: 0.2 } }))).toBe(true);
    expect(hasProgress(prev({ nextDayIndex: 1 }))).toBe(true);
  });
});
