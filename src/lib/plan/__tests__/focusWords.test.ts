import { describe, expect, it } from 'vitest';
import { focusDayLine, focusLine, focusPeriod } from '../focusWords';
import type { FocusResult } from '../focus';

const p = (id: FocusResult['id'], over: Partial<FocusResult> = {}): FocusResult => ({ id, requested: 3, extra: 0, total: 0, shortfall: false, state: 'extra', ...over });
const line = (r: FocusResult, period = 'a week') => focusLine(r, period).join(': ');

describe('focus words (PLAN 3.6f round 2: one meaning for the numbers)', () => {
  it('counts a week on a calendar plan and workouts on a flexible rotation', () => {
    expect(focusPeriod('fixed', 4)).toBe('a week');
    expect(focusPeriod('weekly', 4)).toBe('a week');
    expect(focusPeriod('flexible', 4)).toBe('every 4 workouts');
    expect(focusPeriod(undefined, 5)).toBe('every 5 workouts');
  });

  it('says the total and the extra as what they are, from the report\'s own numbers', () => {
    expect(line(p('back', { extra: 6, total: 18 }))).toBe('Back: 18 sets a week, 6 of them extra');
    expect(line(p('lats', { extra: 3, total: 13 }), 'every 4 workouts')).toBe('Lats: 13 sets every 4 workouts, 3 of them extra');
    expect(line(p('calves', { extra: 1, total: 1 }))).toBe('Calves: 1 set a week, all of them extra');
    expect(line(p('posture', { extra: 3, total: 9 }))).toBe('Posture: 9 sets of back and rear shoulder work a week, 3 of them extra');
    expect(line(p('mobility', { requested: 0, minutes: 3 }), 'every 4 workouts')).toBe('Mobility: 3 min of stretches every 4 workouts');
  });

  it('a pick at the limit says it has plenty, never "nothing extra" (critic BLOCKER 1)', () => {
    expect(line(p('quads', { total: 20, state: 'plenty' }))).toBe('Quads: 20 sets a week, already plenty');
    expect(line(p('glutes', { total: 20, extra: 2, state: 'plenty' }))).toBe('Glutes: 20 sets a week, 2 of them extra, already plenty');
    expect(line(p('upper_chest', { total: 4, state: 'plenty' }))).toBe('Upper chest: 4 sets a week, your chest already has plenty');
    // A report saved before round 2 carries atLimit instead of a state.
    expect(line({ id: 'quads', requested: 3, extra: 0, total: 20, shortfall: false, atLimit: true })).toBe('Quads: 20 sets a week, already plenty');
  });

  it('an area of several muscles shows each muscle\'s own count, the measure the 20 set limit uses (never "Back: 27 sets")', () => {
    const back = p('back', { total: 24, state: 'plenty', parts: [{ muscle: 'back', sets: 20 }, { muscle: 'lower back', sets: 4 }] });
    expect(line(back, 'every 5 workouts')).toBe('Back: lats and upper back 20 and lower back 4 sets every 5 workouts, already plenty');
    const arms = p('arms', { total: 20, extra: 2, parts: [{ muscle: 'biceps', sets: 9 }, { muscle: 'triceps', sets: 11 }] });
    expect(line(arms)).toBe('Arms: biceps 9 and triceps 11 sets a week, 2 of them extra');
    const shoulders = p('shoulders', { total: 16, extra: 3, parts: [{ muscle: 'front delts', sets: 8 }, { muscle: 'side delts', sets: 6 }, { muscle: 'rear delts', sets: 3 }] });
    expect(line(shoulders)).toBe('Shoulders: front shoulders 8, side shoulders 6 and rear shoulders 3 sets a week, 3 of them extra');
    // One muscle with sets: the plain count.
    expect(line(p('legs', { total: 9, extra: 3, parts: [{ muscle: 'quads', sets: 9 }] }))).toBe('Legs: 9 sets a week, 3 of them extra');
  });

  it('never shows a zero: a pick that got nothing says why in words', () => {
    const lines = [p('abs', { state: 'short' }), p('grip', { state: 'no_move' }), p('mobility', { requested: 0, minutes: 0, shortfall: true, state: 'short' }), p('quads', { requested: 0, state: 'no_share' })].map((x) => line(x));
    expect(lines).toEqual(['Abs: no room for it yet', 'Grip: no exercises for it yet', 'Mobility: your sessions are too short for stretches', 'Quads: no room for it yet']);
    for (const l of lines) expect(l).not.toMatch(/\d/);
    expect(line(p('biceps', { total: 2, state: 'short' }))).toBe('Biceps: 2 sets a week, no room for extra yet');
  });

  it('a day card says what that day adds, up to two picks in rank order; nothing added, no line', () => {
    expect(focusDayLine([{ id: 'upper_chest', extra: 2 }, { id: 'side_delts', extra: 2 }, { id: 'biceps', extra: 1 }])).toBe('Extra today: 2 sets for upper chest and 2 for side shoulders');
    expect(focusDayLine([{ id: 'lats', extra: 1 }])).toBe('Extra today: 1 set for lats');
    expect(focusDayLine([{ id: 'mobility', extra: 0, minutes: 1 }, { id: 'back', extra: 3 }])).toBe('Extra today: 1 min of stretches and 3 sets for back');
    expect(focusDayLine([])).toBeNull();
    expect(focusDayLine(undefined)).toBeNull();
    expect(focusDayLine([{ id: 'back', extra: 0 }])).toBeNull();
  });
});
