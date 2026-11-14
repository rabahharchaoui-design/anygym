import { describe, expect, it } from 'vitest';
import { FOCUS_RANK_INTENT, focusCaption, focusDayLine, focusLine, focusPeriod, focusRankWords, focusRow, focusRowOrder } from '../focusWords';
import { focusSummary } from '../focusPriority';
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
    expect(line(p('glutes', { total: 20, extra: 2, state: 'plenty' }))).toBe('Glutes: 20 sets a week, 2 of them extra, as much as is useful');
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
    expect(lines).toEqual(['Abs: no room for it', 'Grip: no exercises for it yet', 'Mobility: your sessions are too short for stretches', 'Quads: no room for it']);
    for (const l of lines) expect(l).not.toMatch(/\d/);
    expect(line(p('biceps', { total: 2, state: 'short' }))).toBe('Biceps: 2 sets a week, no room for extra');
  });

  it('a day card says what that day adds, up to two picks in rank order and then "and more"; nothing added, no line', () => {
    expect(focusDayLine([{ id: 'upper_chest', extra: 2 }, { id: 'side_delts', extra: 2 }, { id: 'biceps', extra: 1 }])).toBe('Extra today: 2 sets for upper chest, 2 for side shoulders and more');
    expect(focusDayLine([{ id: 'upper_chest', extra: 2 }, { id: 'side_delts', extra: 2 }])).toBe('Extra today: 2 sets for upper chest and 2 for side shoulders');
    // Round 3 (critic 10): a day that opens with a focused move says which, with or without extra sets.
    expect(focusDayLine([{ id: 'lats', extra: 1 }], 'upper_chest')).toBe('Upper chest first today. Extra: 1 set for lats');
    expect(focusDayLine([], 'upper_chest')).toBe('Upper chest first today');
    expect(focusDayLine(undefined, null)).toBeNull();
    expect(focusDayLine([{ id: 'lats', extra: 1 }])).toBe('Extra today: 1 set for lats');
    expect(focusDayLine([{ id: 'mobility', extra: 0, minutes: 1 }, { id: 'back', extra: 3 }])).toBe('Extra today: 1 min of stretches and 3 sets for back');
    expect(focusDayLine([])).toBeNull();
    expect(focusDayLine(undefined)).toBeNull();
    expect(focusDayLine([{ id: 'back', extra: 0 }])).toBeNull();
  });

  it('the reveal row says the same facts in pieces: name, number, a quiet state, and more only when there is more (design round 2)', () => {
    expect(focusCaption('every 4 workouts')).toBe('Sets every 4 workouts');
    expect(focusCaption('a week')).toBe('Sets a week');
    expect(focusRow(p('lats', { extra: 6, total: 18 }))).toEqual({ name: 'Lats', amount: '18 sets', tag: '+6 extra', detail: null });
    expect(focusRow(p('calves', { extra: 1, total: 1 }))).toEqual({ name: 'Calves', amount: '1 set', tag: '+1 extra', detail: null });
    // No extra: plenty when a muscle is at the limit, else honestly none yet. Never a zero.
    expect(focusRow(p('quads', { total: 20, state: 'plenty' }))).toEqual({ name: 'Quads', amount: '20 sets', tag: 'plenty', detail: null });
    expect(focusRow(p('glutes', { total: 20, extra: 2, state: 'plenty' }))).toEqual({ name: 'Glutes', amount: '20 sets', tag: '+2 extra', detail: 'As much as is useful now' });
    expect(focusRow(p('upper_chest', { total: 4, state: 'plenty' }))).toEqual({ name: 'Upper chest', amount: '4 sets', tag: 'plenty', detail: 'Your chest already has plenty' });
    expect(focusRow(p('side_delts', { total: 4, state: 'short' }))).toEqual({ name: 'Side shoulders', amount: '4 sets', tag: 'no extra', detail: null });
    expect(focusRow(p('calves', { requested: 0, state: 'no_share' }))).toEqual({ name: 'Calves', amount: null, tag: 'no room', detail: null });
    expect(focusRow(p('grip', { state: 'no_move' }))).toEqual({ name: 'Grip', amount: null, tag: 'no exercises yet', detail: null });
    // An area of several muscles: each muscle's own count, never one summed number.
    const back = p('back', { total: 24, state: 'plenty', parts: [{ muscle: 'back', sets: 20 }, { muscle: 'lower back', sets: 4 }] });
    expect(focusRow(back)).toEqual({ name: 'Back', amount: null, tag: 'plenty', detail: 'Lats and upper back 20 · Lower back 4' });
    expect(focusRow(p('legs', { total: 9, extra: 3, parts: [{ muscle: 'quads', sets: 9 }] }))).toEqual({ name: 'Legs', amount: '9 sets', tag: '+3 extra', detail: null });
    expect(focusRow(p('posture', { extra: 3, total: 9 }))).toEqual({ name: 'Posture', amount: '9 sets', tag: '+3 extra', detail: 'Back and rear shoulder work' });
    expect(focusRow(p('mobility', { requested: 0, minutes: 3 }))).toEqual({ name: 'Mobility', amount: '3 min', tag: null, detail: 'Stretches' });
    expect(focusRow(p('mobility', { requested: 0, shortfall: true, state: 'short' }))).toEqual({ name: 'Mobility', amount: null, tag: 'no room', detail: 'Your sessions are too short for stretches' });
  });

  it('round 3 (critic 5): a row never says extra and plenty together, and a goal riding on picked muscles is said in words, not counted twice', () => {
    for (const extra of [0, 1, 2, 3]) for (const id of ['quads', 'glutes', 'upper_chest', 'back', 'posture'] as const) {
      const row = focusRow(p(id, { total: 20, extra, state: 'plenty' }));
      const said = `${row.tag ?? ''} ${row.detail ?? ''}`;
      expect(/extra/.test(said) && /plenty/i.test(said), said).toBe(false);
      expect(/extra.*plenty/.test(line(p(id, { total: 20, extra, state: 'plenty' })))).toBe(false);
    }
    // The critic's row: Back first with 20 sets, Posture second riding on the same 20.
    const posture = p('posture', { total: 20, extra: 2, state: 'plenty', coveredBy: ['back'], shared: 20 });
    expect(focusRow(posture)).toEqual({ name: 'Posture', amount: null, tag: null, detail: 'Covered by your back work: 20 sets' });
    expect(line(posture)).toBe('Posture: covered by your back work, 20 sets a week');
    expect(focusRow(p('posture', { total: 18, extra: 2, coveredBy: ['back', 'rear_delts'], shared: 18 })).detail).toBe('Covered by your back and rear shoulder work: 18 sets');
    expect(focusRow(p('grip', { total: 6, extra: 3, coveredBy: ['forearms'], shared: 6 })).detail).toBe('Covered by your forearm work: 6 sets');
    // Only some of its sets are shown elsewhere: its own number stays, and the overlap is said.
    expect(focusRow(p('posture', { total: 14, extra: 3, coveredBy: ['lats'], shared: 8 }))).toEqual({ name: 'Posture', amount: '14 sets', tag: '+3 extra', detail: 'Back and rear shoulder work · 8 of them also count for Lats' });
  });

  it('round 3 (critic 3): before the plan exists the rank words are an intent, and the reveal names who really got the most', () => {
    expect(FOCUS_RANK_INTENT).toBe('We add extra where it fits, starting from the top.');
    expect(FOCUS_RANK_INTENT).not.toMatch(/most extra|top two/);
    const of = (...priorities: ReturnType<typeof p>[]) => focusSummary({ priorities });
    expect(of(p('back', { extra: 3 }), p('side_delts', { extra: 3 }), p('abs', { extra: 2 }))).toBe('Most extra work: Back and Side shoulders.');
    // The critic's case: Back ranked first has plenty, so the pick below it leads.
    expect(of(p('back', { total: 20, state: 'plenty' }), p('side_delts', { extra: 4 }), p('abs', { extra: 2 }))).toBe('Back already gets plenty, so Side shoulders gets the most.');
    expect(of(p('grip', { state: 'no_move' }), p('lats', { extra: 3 }), p('abs', { extra: 3 }), p('quads', { extra: 1 }))).toBe('Grip has no exercises yet, so Lats and Abs get the most.');
    expect(of(p('lats', { extra: 1, state: 'short' }), p('abs', { extra: 3 }), p('quads', { extra: 2 }))).toBe('Lats has no more room on its days, so Abs gets the most.');
    // Everyone the same: said as that, never "the top two get the most".
    expect(of(p('back', { extra: 2 }), p('posture', { extra: 2 }), p('side_delts', { extra: 2 }))).toBe('Every pick gets the same extra work: +2.');
    expect(of(p('back', { extra: 3 }), p('abs', { extra: 3 }), p('quads', { extra: 3 }), p('calves', { extra: 3 }), p('glutes', { extra: 1 }))).toBe('Most extra work: Back, Abs, Quads and Calves.');
    // Nothing got extra, or one pick alone: nothing to compare, so no line.
    expect(of(p('back', { state: 'short' }), p('abs', { state: 'short' }))).toBeNull();
    expect(of(p('back', { extra: 4 }))).toBeNull();
    // Mobility is stretch time and a covered goal has no extra of its own: neither is compared.
    expect(of(p('back', { extra: 3 }), p('mobility', { requested: 0, minutes: 3 }), p('posture', { extra: 4, total: 12, coveredBy: ['back'], shared: 12 }), p('abs', { extra: 1 }))).toBe('Most extra work: Back.');
  });

  it('round 3 (critic 11, 12): the rank prompt counts what is ranked and says why Mobility is not; the reveal lists what got extra first', () => {
    expect(focusRankWords(5, false)).toEqual({ prompt: 'Rank your 5 picks', note: null });
    expect(focusRankWords(5, true)).toEqual({ prompt: 'Rank your 5 picks', note: 'Mobility is stretch time, so it is not ranked.' });
    const rows = [p('grip', { state: 'no_move' }), p('abs', { state: 'short' }), p('lats', { extra: 2 }), p('mobility', { requested: 0, minutes: 2 }), p('forearms', { state: 'no_move' }), p('quads', { extra: 1 })];
    expect(focusRowOrder(rows).map((x) => x.id)).toEqual(['lats', 'mobility', 'quads', 'abs', 'grip', 'forearms']);
  });
});

