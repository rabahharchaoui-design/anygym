import { describe, expect, it } from 'vitest';
import { canContinue, funnelReducer, NOT_USED_YET, parseDraft, sanitizeAnswers, serializeDraft, startState } from '../intake/funnel';
import { generatorInputOf } from '../intake/yourPlan';
import { weekOf, unmetCustomization } from '../intake/planPick';
import { planById } from '../../data/plans';
import { focusFit } from '../intake/focusFit';
import { FOCUS, FOCUS_OBJECTIVES, FOCUS_PARTS, SCHEDULE_STYLES } from '../intake/options';
import { normalizeFocusPicks } from '../plan/focus';
import { scheduleStyleOf } from '../plan/schedule';
import type { FocusReport, FocusResult } from '../plan/focus';

describe('schedule and ranked focus answers', () => {
  it('sanitizes ids without changing ordered picks, deduplicates groups, and preserves old broad answers', () => {
    const picks = ['quads', 'lats', 'biceps', 'abs', 'side_delts'] as const;
    expect(sanitizeAnswers({ focusPicks: [...picks, 'bad', 'lats'], scheduleStyle: 'weekly' })).toEqual({ focusPicks: [...picks], scheduleStyle: 'weekly' });
    expect(sanitizeAnswers({ focus: ['arms', 'back'] })).toEqual({ focus: ['arms', 'back'] });
    expect(generatorInputOf({ focus: ['arms'] }).focus).toEqual(['arms']);
    expect(generatorInputOf({ focus: ['arms'], focusPicks: [] }).focusPicks).toEqual([]);
    expect(sanitizeAnswers({ focusPicks: ['arms', 'biceps'] }).focusPicks).toEqual(['arms']);
    expect(sanitizeAnswers({ focusPicks: ['biceps', 'balance'], scheduleStyle: 'nonsense' })).toEqual({ focusPicks: ['balance'] });
  });
  it('keeps ranking and schedule through Back, serialization and reload; balance clears other choices', () => {
    let s = startState();
    s = funnelReducer(s, { type: 'goto', screen: 'focus' });
    s = funnelReducer(s, { type: 'set', screen: 'focusPicks', value: ['lats', 'quads', 'abs', 'biceps'] });
    s = funnelReducer(s, { type: 'set', screen: 'scheduleStyle', value: 'flexible' });
    const saved = parseDraft(serializeDraft(s))!;
    expect(funnelReducer(funnelReducer(saved, { type: 'next' }), { type: 'back' })).toEqual(saved);
    const balanced = funnelReducer(saved, { type: 'set', screen: 'focusPicks', value: ['balance'] });
    expect(balanced.answers.focusPicks).toEqual(['balance']);
    expect(NOT_USED_YET.has('focus')).toBe(false);
    expect(canContinue('focus', {})).toBe(true);
    // Continue with nothing picked is a skip, never a made up answer; picking one clears it.
    const left = funnelReducer({ step: 'focus', answers: {} }, { type: 'next' });
    expect(left.answers.skipped).toEqual(['focus']);
    expect(funnelReducer(left, { type: 'set', screen: 'focusPicks', value: ['back'] }).answers.skipped).toBeUndefined();
    expect(canContinue('weekdays', { scheduleStyle: 'flexible' })).toBe(true);
    expect(canContinue('weekdays', { scheduleStyle: 'weekly' })).toBe(true);
    expect(canContinue('weekdays', { scheduleStyle: 'fixed' })).toBe(false);
    expect(canContinue('weekdays', { scheduleStyle: 'fixed', weekdays: ['mon'] })).toBe(true);
  });
  it('never overwrites schedule when a traveler chooses hotel or a mix later', () => {
    for (const style of ['fixed', 'flexible', 'weekly'] as const) {
      let s = startState({ scheduleStyle: style, weekdays: ['mon', 'fri'] });
      s = funnelReducer(s, { type: 'set', screen: 'place', value: 'hotel' });
      expect(s.answers.scheduleStyle).toBe(style);
      s = funnelReducer(s, { type: 'set', screen: 'place', value: 'mix' });
      expect(s.answers.scheduleStyle).toBe(style);
    }
  });
  it('calendar-labels only fixed plans and detects detailed customization', () => {
    const plan = planById('hotel-gym-3-day')!;
    const weekdays = ['mon', 'wed', 'fri'] as const;
    expect(weekOf(plan, { weekdays: [...weekdays] }).map((s) => s.label)).toEqual(['Mon', 'Wed', 'Fri']);
    for (const scheduleStyle of ['flexible', 'weekly'] as const) expect(weekOf(plan, { scheduleStyle, weekdays: [...weekdays] }).map((s) => s.label)).toEqual(['Day 1', 'Day 2', 'Day 3']);
    expect(unmetCustomization({ focusPicks: ['upper_chest'] })).toBe(true);
    expect(unmetCustomization({ focusPicks: ['balance'] })).toBe(false);
  });
});

describe('the honest focus line and its one tap (focusFit): a step is only offered when it is true, with its real numbers (PLAN 3.6g2)', () => {
  /** A pick with 8 sets before any extra; `under` is what it is short of 12, as the generator reports it. */
  const p = (id: FocusResult['id'], requested: number, extra: number, total = 8 + extra, more: Partial<FocusResult> = {}): FocusResult => ({ id, requested, extra, total, shortfall: extra < Math.max(1, requested - 1), ...(total < 12 && !more.state ? { under: 12 - total } : {}), ...more });
  const report = (...priorities: FocusResult[]): FocusReport => ({ budget: 12, spent: priorities.reduce((n, x) => n + x.extra, 0), priorities, days: [] });
  const room = { held: 'room' as const }, rank = { held: 'rank' as const, heldBy: 'arms' as const };
  const four = report(p('back', 3, 4), p('shoulders', 3, 4), p('arms', 3, 0, 8, room), p('legs', 3, 0, 8, rank));
  const all = report(p('back', 3, 4), p('shoulders', 3, 4), p('arms', 3, 4), p('legs', 3, 4));
  it('names the step with the rebuilt plan\'s numbers and puts the value on the button; a day or minutes only when the rebuild with it really gives that', () => {
    expect(focusFit({ days: 3, minutes: 45 }, four, () => all)).toEqual({ line: 'Make it 60 min: Arms 8 to 12 and Legs 8 to 12. Or make it 4 days: Arms 8 to 12 and Legs 8 to 12.', days: 4, minutes: 60, labels: { days: 'Make it 4 days', minutes: 'Make it 60 min' } });
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 ? all : four))).toEqual({ line: 'Make it 4 days: Arms 8 to 12 and Legs 8 to 12.', days: 4, labels: { days: 'Make it 4 days' } });
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.minutes === 60 ? all : undefined))).toEqual({ line: 'Make it 60 min: Arms 8 to 12 and Legs 8 to 12.', minutes: 60, labels: { minutes: 'Make it 60 min' } });
    // No minutes answer means no limit: more minutes is never offered.
    expect(focusFit({ days: 3 }, four, () => all)).toMatchObject({ days: 4 });
    expect(focusFit({ days: 3 }, four, () => all)!.minutes).toBeUndefined();
    // The critic's silent jump: the button says where it goes.
    expect(focusFit({ days: 2, minutes: 20 }, report(p('glutes', 4, 0, 8, room)), (a) => (a.minutes === 60 && a.days === 2 ? report(p('glutes', 4, 4)) : report(p('glutes', 4, 0, 8, room))))).toEqual({ line: 'Make it 60 min: Glutes 8 to 12.', minutes: 60, labels: { minutes: 'Make it 60 min' } });
  });
  it('a step that helps but leaves a pick under 12 says exactly what it does, and the pick it does not help is told why it stays', () => {
    const better = report(p('back', 3, 4), p('shoulders', 3, 4), p('arms', 3, 4), p('legs', 3, 0, 8, room));
    // Every step helps the same: minutes and a day are both offered, each with its numbers.
    expect(focusFit({ days: 3, minutes: 45 }, four, () => better)).toEqual({ line: 'Make it 60 min: Arms 8 to 12. Or make it 4 days: Arms 8 to 12. Legs stays under 12 sets: it gets no more than Arms, ranked above it.', minutes: 60, days: 4, partial: true, labels: { days: 'Make it 4 days', minutes: 'Make it 60 min' } });
    // A step that brings a pick to 12 comes before one that only adds.
    const more = report(p('back', 3, 4), p('shoulders', 3, 4), p('arms', 3, 2), p('legs', 3, 1));
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 && a.minutes === 45 ? more : a.minutes === 60 && a.days === 3 ? better : four))).toMatchObject({ line: 'Make it 60 min: Arms 8 to 12. Legs stays under 12 sets: it gets no more than Arms, ranked above it.', minutes: 60, partial: true });
    // No step reaches 12: the one that places the most is offered, with what it really gives.
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 && a.minutes === 60 ? more : four))).toEqual({ line: 'Make it 4 days and 60 min: Arms 8 to 10 and Legs 8 to 9.', days: 4, minutes: 60, both: true, partial: true, labels: { both: 'Make it 4 days and 60 min' } });
    // Stretches are named as stretches.
    const stretch = (minutes: number): FocusResult => ({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes, session: minutes, shortfall: minutes < 5, state: minutes < 5 ? 'short' : 'extra' });
    expect(focusFit({ days: 3, minutes: 20 }, report(p('back', 4, 4), stretch(0)), () => report(p('back', 4, 4), stretch(5)))!.line).toBe('Make it 30 min: Mobility gets its stretches. Or make it 4 days: Mobility gets its stretches.');
    // Truth pass (critic r3 3): two minutes of stretches is not a stretch block, so no step is offered for it.
    expect(focusFit({ days: 3, minutes: 20 }, report(p('back', 4, 4), stretch(0)), () => report(p('back', 4, 4), stretch(2)))).toBeNull();
  });
  it('a step that takes sets or extra away from any pick is not offered (critic t-07: Add a day, and Chest lost its extra)', () => {
    const lost = report(p('back', 3, 3), p('shoulders', 3, 4), p('arms', 3, 4), p('legs', 3, 4));
    // The step exists but lowers Back: no button, and the picks are told why they stay.
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 ? lost : four))).toEqual({ line: 'Arms stays under 12 sets: its days are full. Legs stays under 12 sets: it gets no more than Arms, ranked above it.' });
    // Minutes alone does it: only minutes is named and offered.
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 ? lost : all))).toEqual({ line: 'Make it 60 min: Arms 8 to 12 and Legs 8 to 12.', minutes: 60, labels: { minutes: 'Make it 60 min' } });
    // Fewer sets in all with the same extra (the bigger plan gives the muscle less before any extra) is lower too.
    const thinner = report(p('back', 3, 4, 11), p('shoulders', 3, 4), p('arms', 3, 4), p('legs', 3, 4));
    expect(focusFit({ days: 3, minutes: 45 }, four, () => thinner)!.days).toBeUndefined();
  });
  it('tries the combined step once when no single step does it, and the button says both values', () => {
    const fit = focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 && a.minutes === 60 ? all : four));
    expect(fit).toEqual({ line: 'Make it 4 days and 60 min: Arms 8 to 12 and Legs 8 to 12.', days: 4, minutes: 60, both: true, labels: { both: 'Make it 4 days and 60 min' } });
  });
  it('with nothing that helps, the plain truth and no button: each pick with the reason from its report', () => {
    expect(focusFit({ days: 3, minutes: 45 }, four, () => four)).toEqual({ line: 'Arms stays under 12 sets: its days are full. Legs stays under 12 sets: it gets no more than Arms, ranked above it.' });
    expect(focusFit({ days: 6, minutes: 75 }, four, () => all)).toEqual({ line: 'Arms stays under 12 sets: its days are full. Legs stays under 12 sets: it gets no more than Arms, ranked above it.' });
    const budget = { held: 'budget' as const };
    const nothing = report(p('lats', 4, 0, 8, budget), p('biceps', 4, 0, 8, budget));
    // Short names in a list: never "Lats and width and Biceps".
    expect(focusFit({ days: 4, minutes: 60 }, nothing, () => nothing)).toEqual({ line: 'Lats and Biceps stay under 12 sets: extra work stops at 12 sets a week.' });
    // At 12 sets or more and only short of its share: "no extra", never "under 12".
    expect(focusFit({ days: 4, minutes: 60 }, report(p('lats', 4, 0, 14, room)), () => undefined)).toEqual({ line: 'Lats gets no extra: its days are full.' });
    // A report saved before PLAN 3.6g2 has no reason on record: at the last choice the old plain line stays.
    expect(focusFit({ days: 6, minutes: 75 }, report(p('lats', 4, 0, 14)), () => undefined)).toEqual({ line: 'This is all the extra work 6 days of 75 min can hold.' });
  });
  it('stays quiet when every pick got its share and is at 12 sets, or already has plenty', () => {
    expect(focusFit({ days: 3, minutes: 45 }, all, () => all)).toBeNull();
    expect(focusFit({ days: 3, minutes: 45 }, undefined, () => all)).toBeNull();
    expect(focusFit({ days: 3, minutes: 45 }, report(p('back', 4, 3, 12)), () => all)).toBeNull();
    expect(focusFit({ days: 6, minutes: 75 }, report(p('back', 4, 0, 20, { state: 'plenty' })), () => all)).toBeNull();
    // A report saved before round 2 has no state: its old marks still read.
    expect(focusFit({ days: 6, minutes: 75 }, report(p('back', 4, 0, 20, { atLimit: true })), () => all)).toBeNull();
    expect(focusFit({ days: 3, minutes: 45 }, report({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 10, session: 5, shortfall: false }), () => all)).toBeNull();
  });
  it('names a pick past the 12 set budget, and one the app has no exercises for (never "with your equipment")', () => {
    const many = report(p('lats', 3, 4), p('quads', 3, 4), p('abs', 1, 4), p('calves', 0, 0, 6, { state: 'no_share' }));
    expect(focusFit({ days: 4, minutes: 60 }, many, () => many)).toEqual({ line: 'Extra work stops at 12 sets a week, so Calves got none.' });
    const none = report(p('lats', 4, 4), p('grip', 4, 0, 0, { state: 'no_move' }), p('forearms', 4, 0, 0, { state: 'no_move' }), p('obliques', 4, 0, 0, { state: 'no_move' }));
    expect(focusFit({ days: 4, minutes: 60 }, none, () => none)).toEqual({ line: 'No exercises for grip, forearms or obliques yet.' });
  });
  it('mobility: says the session is too short, and offers minutes only when the stretches then fit', () => {
    const stretch = report({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 0, shortfall: true, state: 'short' });
    const fits = report({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 10, session: 5, shortfall: false, state: 'extra' });
    expect(focusFit({ days: 4, minutes: 20 }, stretch, (a) => (a.minutes === 30 ? fits : stretch))).toEqual({ line: 'Make it 30 min: Mobility gets its stretches.', minutes: 30, labels: { minutes: 'Make it 30 min' } });
    // Truth pass (critic r3 3): when no choice of days and minutes has room for a stretch block there is no box at all: the row says it ("No room for a stretch block in these sessions yet"), and a minute or two of stretches is never offered as the fix.
    expect(focusFit({ days: 4, minutes: 20 }, stretch, () => stretch)).toBeNull();
    const token = report({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 2, session: 1, shortfall: true, state: 'short' });
    expect(focusFit({ days: 4, minutes: 20 }, stretch, () => token)).toBeNull();
    expect(focusFit({ days: 4, minutes: 60 }, token, () => token)).toBeNull();
  });
});

describe('the options are the PLAN\'s, word for word', () => {
  it('three schedule styles, flexible when nothing was chosen', () => {
    expect(SCHEDULE_STYLES.map((s) => s.label)).toEqual(['Same days each week', 'Flexible, whenever I can', 'Changes week to week']);
    expect(scheduleStyleOf({})).toBe('flexible');
    expect(generatorInputOf({}).scheduleStyle).toBe('flexible');
    expect(generatorInputOf({ weekdays: ['mon'] }).scheduleStyle).toBe('fixed');
  });
  it('8 area tiles, their parts, and the three goal tiles', () => {
    expect(FOCUS.map((f) => f.label)).toEqual(['Chest', 'Back', 'Shoulders', 'Arms', 'Abs and core', 'Glutes', 'Legs', 'Whole body balance']);
    const parts = Object.fromEntries(Object.entries(FOCUS_PARTS).map(([area, list]) => [area, list.map((x) => x.label)]));
    expect(parts).toEqual({
      chest: ['Upper chest', 'Overall chest'], back: ['Lats and width', 'Upper back thickness', 'Lower back'], shoulders: ['Front shoulders', 'Side shoulders for width', 'Rear shoulders'],
      arms: ['Biceps', 'Triceps', 'Forearms'], core: ['Abs', 'Obliques'], glutes: [], legs: ['Quads', 'Hamstrings', 'Calves'],
    });
    expect(FOCUS_OBJECTIVES.map((f) => f.label)).toEqual(['Posture', 'Grip', 'Mobility']);
  });
  it('any number of picks in the person\'s order; balance clears the rest; an area swallows its own parts', () => {
    const many = ['lats', 'side_delts', 'quads', 'biceps', 'abs', 'glutes', 'upper_chest', 'posture', 'grip', 'mobility', 'calves'];
    expect(normalizeFocusPicks(many)).toEqual(many);
    expect(normalizeFocusPicks([...many, 'balance'])).toEqual(['balance']);
    expect(normalizeFocusPicks(['quads', 'legs', 'chest', 'upper_chest'])).toEqual(['legs', 'chest']);
    expect(sanitizeAnswers({ focusPicks: many }).focusPicks).toEqual(many);
  });
});
