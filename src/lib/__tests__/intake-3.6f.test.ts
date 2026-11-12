import { describe, expect, it } from 'vitest';
import { canContinue, funnelReducer, NOT_USED_YET, parseDraft, sanitizeAnswers, serializeDraft, startState } from '../intake/funnel';
import { generatorInputOf } from '../intake/yourPlan';
import { weekOf, unmetCustomization } from '../intake/planPick';
import { planById } from '../../data/plans';

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
    expect(canContinue('weekdays', { scheduleStyle: 'flexible' })).toBe(true);
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
