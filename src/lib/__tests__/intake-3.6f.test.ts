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

describe('the honest focus line and its one tap (focusFit): round 2, a fix is only offered when it is true', () => {
  const p = (id: FocusResult['id'], requested: number, extra: number, total = 8, more: Partial<FocusResult> = {}): FocusResult => ({ id, requested, extra, total, shortfall: extra < Math.max(1, requested - 1), ...more });
  const report = (...priorities: FocusResult[]): FocusReport => ({ budget: 12, spent: priorities.reduce((n, x) => n + x.extra, 0), priorities, days: [] });
  const four = report(p('back', 3, 3), p('shoulders', 3, 3), p('arms', 3, 0), p('legs', 3, 0));
  const all = report(p('back', 3, 3), p('shoulders', 3, 3), p('arms', 3, 3), p('legs', 3, 3));
  it('says the PLAN line and offers a day or minutes only when a rebuild with it places every share', () => {
    expect(focusFit({ days: 3, minutes: 45 }, four, () => all)).toEqual({ line: '4 focus areas fit best with 4 days or 60 min; we prioritized Back and Shoulders.', days: 4, minutes: 60, named: true });
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 ? all : four))).toEqual({ line: '4 focus areas fit best with 4 days; we prioritized Back and Shoulders.', days: 4, named: true });
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.minutes === 60 ? all : undefined))).toEqual({ line: '4 focus areas fit best with 60 min; we prioritized Back and Shoulders.', minutes: 60, named: true });
    // No minutes answer means no limit: more minutes is never offered.
    expect(focusFit({ days: 3 }, four, () => all)).toMatchObject({ days: 4 });
    expect(focusFit({ days: 3 }, four, () => all)!.minutes).toBeUndefined();
    expect(focusFit({ days: 2, minutes: 20 }, report(p('glutes', 4, 0)), () => report(p('glutes', 4, 4)))!.line).toBe('Glutes fits best with 3 days or 30 min.');
  });
  it('round 3 (critic 8): a step that helps but still leaves a shortfall is offered as exactly what it does, never as the fix', () => {
    const better = report(p('back', 3, 3), p('shoulders', 3, 3), p('arms', 3, 3), p('legs', 3, 0));
    // Every step helps the same: minutes before a day before both.
    expect(focusFit({ days: 3, minutes: 45 }, four, () => better)).toEqual({ line: 'With 60 min, Arms gets extra. That is the most that fits.', minutes: 60, partial: true });
    // The step that helps most wins; two picks are named, more are counted.
    const more = report(p('back', 3, 3), p('shoulders', 3, 3), p('arms', 3, 2), p('legs', 3, 1));
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 && a.minutes === 45 ? more : a.minutes === 60 && a.days === 3 ? better : four))).toEqual({ line: 'With 4 days, Arms and Legs get extra. That is the most that fits.', days: 4, partial: true });
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 && a.minutes === 60 ? more : four))).toEqual({ line: 'With 4 days and 60 min, Arms and Legs get extra. That is the most that fits.', days: 4, minutes: 60, both: true, partial: true });
    // A pick that already had some gets "more"; stretches are named as stretches.
    const some = report(p('back', 3, 1), p('legs', 3, 0));
    expect(focusFit({ days: 3, minutes: 45 }, some, () => report(p('back', 3, 2), p('legs', 3, 0)))!.line).toBe('With 60 min, Back gets more. That is the most that fits.');
    const stretch = (minutes: number): FocusResult => ({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes, shortfall: minutes < 2, state: minutes < 2 ? 'short' : 'extra' });
    expect(focusFit({ days: 3, minutes: 20 }, report(p('back', 4, 1), stretch(0)), () => report(p('back', 4, 1), stretch(2)))!.line).toBe('With 30 min, Mobility gets its stretches. That is the most that fits.');
  });
  it('a step that takes extra away from any pick is not offered (critic t-07: Add a day, and Chest lost its extra)', () => {
    const lost = report(p('back', 3, 2), p('shoulders', 3, 3), p('arms', 3, 3), p('legs', 3, 3));
    // Truth pass: the step exists but lowers Back, so the line says what it would do, never that it "would not add".
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 ? lost : four))).toEqual({ line: 'Another day or more minutes would only move extra work from one pick to another, so Arms and Legs stay as they are.' });
    // Minutes alone does it: only minutes is named and offered.
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 ? lost : all))).toEqual({ line: '4 focus areas fit best with 60 min; we prioritized Back and Shoulders.', minutes: 60, named: true });
  });
  it('tries the combined step once when no single step fixes it, and says "and"', () => {
    const fit = focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 && a.minutes === 60 ? all : four));
    expect(fit).toEqual({ line: '4 focus areas fit best with 4 days and 60 min; we prioritized Back and Shoulders.', days: 4, minutes: 60, both: true, named: true });
  });
  it('with nothing that fixes it, the plain truth and no button; nothing more to add at 6 days and 75 min', () => {
    // Round 3 (critic 8): one plain sentence that says why, never "yet" as if it would change by itself.
    expect(focusFit({ days: 3, minutes: 45 }, four, () => four)).toEqual({ line: 'Another day or more minutes would not add extra work for Arms or Legs.' });
    expect(focusFit({ days: 6, minutes: 75 }, four, () => all)).toEqual({ line: 'This is all the extra work 6 days of 75 min can hold.' });
    const nothing = report(p('lats', 4, 0), p('biceps', 4, 0));
    // Short names in a list: never "Lats and width or Biceps".
    expect(focusFit({ days: 4, minutes: 60 }, nothing, () => nothing)).toEqual({ line: 'Another day or more minutes would not add extra work for Lats or Biceps.' });
  });
  it('stays quiet when every pick got its share, is one set short, or already has plenty', () => {
    expect(focusFit({ days: 3, minutes: 45 }, all, () => all)).toBeNull();
    expect(focusFit({ days: 3, minutes: 45 }, undefined, () => all)).toBeNull();
    expect(focusFit({ days: 3, minutes: 45 }, report(p('back', 4, 3)), () => all)).toBeNull();
    expect(focusFit({ days: 6, minutes: 75 }, report(p('back', 4, 0, 20, { state: 'plenty' })), () => all)).toBeNull();
    // A report saved before round 2 has no state: its old marks still read.
    expect(focusFit({ days: 6, minutes: 75 }, report(p('back', 4, 0, 20, { atLimit: true })), () => all)).toBeNull();
    expect(focusFit({ days: 3, minutes: 45 }, report({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 2, shortfall: false }), () => all)).toBeNull();
  });
  it('names a pick past the 12 set budget, and one the app has no exercises for (never "with your equipment")', () => {
    const many = report(p('lats', 3, 3), p('quads', 3, 3), p('abs', 1, 1), p('calves', 0, 0, 6, { state: 'no_share' }));
    expect(focusFit({ days: 4, minutes: 60 }, many, () => many)).toEqual({ line: 'Extra work stops at 12 sets a week, so Calves got none.' });
    const none = report(p('lats', 4, 4), p('grip', 4, 0, 0, { state: 'no_move' }), p('forearms', 4, 0, 0, { state: 'no_move' }), p('obliques', 4, 0, 0, { state: 'no_move' }));
    expect(focusFit({ days: 4, minutes: 60 }, none, () => none)).toEqual({ line: 'No exercises for grip, forearms or obliques yet.' });
  });
  it('mobility: says the session is too short, and offers minutes only when the stretches then fit', () => {
    const stretch = report({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 0, shortfall: true, state: 'short' });
    const fits = report({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 2, shortfall: false, state: 'extra' });
    expect(focusFit({ days: 4, minutes: 20 }, stretch, (a) => (a.minutes === 30 ? fits : stretch))).toEqual({ line: 'Mobility fits best with 30 min.', minutes: 30 });
    expect(focusFit({ days: 4, minutes: 20 }, stretch, () => stretch)).toEqual({ line: 'Your sessions are too short for stretches.' });
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
