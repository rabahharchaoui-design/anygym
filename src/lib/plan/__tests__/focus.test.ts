import { describe, expect, it } from 'vitest';
import { countHardSets, curateFocus, focusBudget, normalizeFocusPicks, type FocusMove } from '../focus';
const move = (id: string, muscle: string, sets = 3, compound = false): FocusMove => ({ id, key: id, sets, compound, hard: true, muscles: [muscle], picks: muscle === 'back' ? ['back'] : muscle === 'biceps' ? ['biceps', 'arms'] : [] });
const run = (days: FocusMove[][], picks: string[], candidates: FocusMove[][] = days, cap = 4, budgetMinutes = 60) => curateFocus({ days, picks, candidates, cap, budgetMinutes, minutes: (d) => d.reduce((n, m) => n + m.sets * 2, 0) });

describe('one priority budget', () => {
  it('has four sets each for one or two, three each for three or four, and at most twelve for any count', () => {
    const picks = ['chest', 'back', 'arms', 'shoulders', 'legs', 'glutes', 'core', 'posture', 'grip', 'mobility'];
    expect(focusBudget(picks.slice(0, 1)).targets.map((p) => p.sets)).toEqual([4]);
    expect(focusBudget(picks.slice(0, 2)).total).toBe(8);
    expect(focusBudget(picks.slice(0, 4)).targets.map((p) => p.sets)).toEqual([3, 3, 3, 3]);
    const all = focusBudget(picks);
    expect(all.total).toBe(12);
    expect(all.targets.slice(0, 2).map((p) => p.sets)).toEqual([3, 3]);
    expect(all.targets.reduce((n, p) => n + p.sets, 0)).toBeLessThanOrEqual(12);
    expect(all.targets.at(-1)!.sets).toBe(0);
  });
  it('keeps balance exclusive, drops invalid ids, and never buys a parent and its child twice', () => {
    expect(normalizeFocusPicks(['back', 'balance', 'biceps'])).toEqual(['balance']);
    expect(normalizeFocusPicks(['biceps', 'arms', 'lats', 'back', 'arms', 'bad'])).toEqual(['arms', 'back']);
    expect(normalizeFocusPicks(['side_delts', 'quads', 'abs'])).toEqual(['side_delts', 'quads', 'abs']);
  });
  it('replaces a low priority accessory before growth; protects compounds and the experience ceiling', () => {
    const days = [[move('squat', 'quads', 3, true), move('curl', 'biceps')]];
    const before = structuredClone(days);
    const out = run(days, ['back'], [[move('row', 'back')]], 3, 12);
    expect(out.days[0]!.map((m) => m.id)).toEqual(['squat', 'row']);
    expect(out.days[0]!.map((m) => m.sets)).toEqual([3, 3]);
    expect(out.report.priorities[0]).toMatchObject({ extra: 3, total: 3, shortfall: true });
    expect(days).toEqual(before);
    expect(run(days, ['back'], [[move('row', 'back')]], 3, 12)).toEqual(out);
  });
  it('caps retained focused muscle work at twenty and reports an unattainable twelve-set target honestly', () => {
    const days = Array.from({ length: 6 }, (_, i) => [move(`back-${i}`, 'back', 4)]);
    const out = run(days, ['back']);
    expect(countHardSets(out.days, 'back')).toBeLessThanOrEqual(20);
    const short = run([[move('curl', 'biceps', 2)]], ['back'], [[]], 3, 4);
    expect(short.report.priorities[0]).toMatchObject({ total: 0, extra: 0, shortfall: true });
    expect(short.report.priorities[0]!.reason).toBeTruthy();
  });
  it('does not charge helpers, warmups or stretches as hard sets', () => {
    const stretch = { ...move('stretch', 'back', 20), hard: false };
    expect(countHardSets([[stretch, move('row', 'back', 3)]], 'back')).toBe(3);
    const out = run([[move('row', 'back', 3)]], ['back'], [], 3, 6);
    expect(out.report.priorities[0]!.total).toBe(3);
    expect(out.report.spent).toBe(0);
  });
  it('counts an added physical set once even with multiple verified targets', () => {
    const both = { ...move('both', 'back', 2), muscles: ['back', 'biceps'], picks: ['back', 'biceps'] as const };
    const out = run([[both]], ['back', 'biceps'], [], 4, 8);
    expect(out.report.spent).toBe(2);
    expect(countHardSets(out.days, 'back')).toBe(4);
    expect(countHardSets(out.days, 'biceps')).toBe(4);
    expect(out.report.priorities.map((p) => p.extra)).toEqual([2, 2]);
  });
  it('gives mobility time, never hard sets, and checks the same duration callback', () => {
    const mobility: FocusMove = { id: 'stretch', key: 'stretch', hard: false, compound: false, muscles: [], picks: ['mobility'], sets: 1, seconds: 60 };
    const result = curateFocus({ picks: ['mobility'], days: [[], []], candidates: [[mobility], [mobility]], cap: 3, budgetMinutes: 1, minutes: (d) => d.reduce((n, m) => n + (m.seconds ?? 0) / 60, 0) });
    expect(result.report.priorities).toEqual([{ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 2, shortfall: false }]);
    expect(result.report.spent).toBe(0);
  });
});
