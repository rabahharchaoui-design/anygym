import { describe, expect, it } from 'vitest';
import { cap, plural } from '../words';

// 3.6x: plural and cap were written out in several files (CoachCard, CoachList, plans, backup,
// levelUp; quickWhy, MuscleMap, muscles, planPick, yourPlan, and inline in IdeaSheet,
// candidates/view, review). Each old copy is kept here as written, and the shared one must match it.
const oldPlural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const oldCap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

describe('plural', () => {
  const cases: Array<[number, string, string, string]> = [
    [0, 'lift', 'lifts', '0 lifts'],
    [1, 'lift', 'lifts', '1 lift'],
    [2, 'lift', 'lifts', '2 lifts'],
    [1, 'set', 'sets', '1 set'],
    [12, 'workout', 'workouts', '12 workouts'],
    [1.5, 'rep', 'reps', '1.5 reps'],
    [-1, 'gym', 'gyms', '-1 gyms'],
  ];
  it.each(cases)('plural(%s, %s, %s) is "%s", the same as every old copy', (n, one, many, want) => {
    expect(plural(n, one, many)).toBe(want);
    expect(plural(n, one, many)).toBe(oldPlural(n, one, many));
  });
});

describe('cap', () => {
  const cases: Array<[string, string]> = [
    ['', ''],
    ['a', 'A'],
    ['chest and back', 'Chest and back'],
    ['Already', 'Already'],
    ['upper back, lats', 'Upper back, lats'],
    ['1 rep', '1 rep'],
    ['élan', 'Élan'],
  ];
  it.each(cases)('cap(%j) is %j, the same as every old copy', (t, want) => {
    expect(cap(t)).toBe(want);
    expect(cap(t)).toBe(oldCap(t));
  });
});
