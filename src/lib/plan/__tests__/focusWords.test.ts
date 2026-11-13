import { describe, expect, it } from 'vitest';
import { focusLine, focusPeriod } from '../focusWords';
import type { FocusResult } from '../focus';

const p = (id: FocusResult['id'], over: Partial<FocusResult> = {}): FocusResult => ({ id, requested: 3, extra: 0, total: 0, shortfall: false, ...over });

describe('focus words (PLAN 3.6f)', () => {
  it('counts a week on a calendar plan and workouts on a flexible rotation', () => {
    expect(focusPeriod('fixed', 4)).toBe('a week');
    expect(focusPeriod('weekly', 4)).toBe('a week');
    expect(focusPeriod('flexible', 4)).toBe('every 4 workouts');
    expect(focusPeriod(undefined, 5)).toBe('every 5 workouts');
  });

  it('says extra work the way a coach would, with the report\'s own numbers', () => {
    expect(focusLine(p('back', { extra: 4, total: 16 }), 'a week').join(': ')).toBe('Extra back work: 16 sets a week');
    expect(focusLine(p('lats', { extra: 3, total: 13 }), 'every 4 workouts').join(': ')).toBe('Extra lats and width work: 13 sets every 4 workouts');
    expect(focusLine(p('biceps', { total: 2 }), 'a week').join(': ')).toBe('Biceps: 2 sets a week, nothing extra');
    expect(focusLine(p('calves', { total: 1 }), 'a week').join(': ')).toBe('Calves: 1 set a week, nothing extra');
    expect(focusLine(p('posture', { extra: 3, total: 9 }), 'a week').join(': ')).toBe('Posture: 9 sets of back and rear shoulder work a week');
    expect(focusLine(p('mobility', { requested: 0, minutes: 3 }), 'every 4 workouts').join(': ')).toBe('Mobility: 3 min of stretches every 4 workouts');
  });

  it('never shows a zero: a pick that got nothing says why in words', () => {
    const lines = [p('abs'), p('grip', { noMove: true }), p('mobility', { requested: 0, minutes: 0, shortfall: true }), p('quads', { requested: 0 })].map((x) => focusLine(x, 'a week').join(': '));
    expect(lines).toEqual(['Abs: no room for it yet', 'Grip: no sure exercises yet', 'Mobility: no stretch time fits yet', 'Quads: no room for it yet']);
    for (const line of lines) expect(line).not.toMatch(/\d/);
  });
});
