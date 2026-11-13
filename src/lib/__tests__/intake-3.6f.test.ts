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

describe('the honest focus line and its one tap (focusFit)', () => {
  const p = (id: FocusResult['id'], requested: number, extra: number, total = 8, more: Partial<FocusResult> = {}): FocusResult => ({ id, requested, extra, total, shortfall: extra < requested, ...more });
  const report = (...priorities: FocusResult[]): FocusReport => ({ budget: 12, spent: priorities.reduce((n, x) => n + x.extra, 0), priorities, days: [] });
  const four = report(p('back', 3, 3), p('shoulders', 3, 3), p('arms', 3, 0), p('legs', 3, 0));
  const all = report(p('back', 3, 3), p('shoulders', 3, 3), p('arms', 3, 3), p('legs', 3, 3));
  it('says the PLAN line and offers only what a rebuild shows really helps', () => {
    expect(focusFit({ days: 3, minutes: 45 }, four, () => all)).toEqual({ line: '4 focus areas fit best with 4 days or 60 min; we prioritized Back and Shoulders.', days: 4, minutes: 60 });
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.days === 4 ? all : four))).toEqual({ line: '4 focus areas fit best with 4 days; we prioritized Back and Shoulders.', days: 4 });
    expect(focusFit({ days: 3, minutes: 45 }, four, (a) => (a.minutes === 60 ? all : undefined))).toEqual({ line: '4 focus areas fit best with 60 min; we prioritized Back and Shoulders.', minutes: 60 });
    // Nothing helps (or nothing is left to add): no tap, and it still says so.
    expect(focusFit({ days: 3, minutes: 45 }, four, () => four)).toEqual({ line: 'Not all the extra arms and legs work fits here; we prioritized Back and Shoulders.' });
    expect(focusFit({ days: 6, minutes: 75 }, four, () => all)).toEqual({ line: 'Not all the extra arms and legs work fits here; we prioritized Back and Shoulders.' });
    // No minutes answer means no limit: more minutes is never offered.
    expect(focusFit({ days: 3 }, four, () => all)).toMatchObject({ days: 4 });
    expect(focusFit({ days: 3 }, four, () => all)!.minutes).toBeUndefined();
    expect(focusFit({ days: 2, minutes: 20 }, report(p('glutes', 4, 0)), () => report(p('glutes', 4, 4)))!.line).toBe('1 focus area fits best with 3 days or 30 min.');
  });
  it('names as prioritized only the picks that got their full share, never a short one', () => {
    const shortBoth = report(p('lats', 4, 1), p('biceps', 4, 1));
    const line = focusFit({ days: 4, minutes: 60 }, shortBoth, () => shortBoth)!.line;
    expect(line).toBe('Not all the extra lats and width and biceps work fits here; we fit what we could of each.');
    expect(line).not.toMatch(/prioritized/);
    expect(focusFit({ days: 3, minutes: 45 }, shortBoth, () => report(p('lats', 4, 4), p('biceps', 4, 4)))!.line).toBe('2 focus areas fit best with 4 days or 60 min; we fit what we could of each.');
    const oneFull = report(p('lats', 4, 4), p('biceps', 4, 1), p('quads', 4, 0));
    expect(focusFit({ days: 6, minutes: 75 }, oneFull, () => oneFull)!.line).toBe('Not all the extra biceps and quads work fits here; we prioritized Lats and width.');
  });
  it('stays quiet when every pick got its share, is one set short, or is at the 20 set limit', () => {
    expect(focusFit({ days: 3, minutes: 45 }, all, () => all)).toBeNull();
    expect(focusFit({ days: 3, minutes: 45 }, undefined, () => all)).toBeNull();
    expect(focusFit({ days: 3, minutes: 45 }, report(p('back', 4, 3)), () => all)).toBeNull();
    expect(focusFit({ days: 6, minutes: 75 }, report(p('back', 4, 0, 20, { atLimit: true })), () => all)).toBeNull();
    expect(focusFit({ days: 3, minutes: 45 }, report({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 2, shortfall: false }), () => all)).toBeNull();
  });
  it('names a pick past the 12 set budget, and one no sure move trains', () => {
    const many = report(p('lats', 3, 3), p('quads', 3, 3), p('abs', 1, 1), p('calves', 0, 0, 6));
    expect(focusFit({ days: 4, minutes: 60 }, many, () => many)).toEqual({ line: 'Extra work stops at 12 sets a week, so Calves got none; we prioritized Lats and width and Quads.' });
    const grip = report(p('lats', 4, 4), p('grip', 4, 0, 0, { noMove: true }));
    expect(focusFit({ days: 4, minutes: 60 }, grip, () => grip)).toEqual({ line: 'Nothing sure for grip with your equipment yet.' });
    const stretch = report({ id: 'mobility', requested: 0, extra: 0, total: 0, minutes: 0, shortfall: true });
    expect(focusFit({ days: 4, minutes: 20 }, stretch, (a) => (a.minutes === 30 ? report({ ...stretch.priorities[0]!, minutes: 2, shortfall: false }) : stretch))).toEqual({ line: '1 focus area fits best with 30 min.', minutes: 30 });
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
