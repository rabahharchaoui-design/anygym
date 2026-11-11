import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { PLANS } from '../../data/plans';
import { estimateDayMinutes } from '../plans';
import { canContinue, funnelReducer, parseDraft, sanitizeAnswers, startState, visibleScreens, weekdayCountNote, type IntakeAnswers } from '../intake/funnel';
import { explainPick } from '../intake/planPick';

const plan = PLANS[0]!;
const full: IntakeAnswers = { place: 'full', equipment: [...EQUIPMENT_IDS] };
const minutes = plan.days.map((d) => estimateDayMinutes(d));
const avg = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);

describe('B2: the closest plan reveal says it in two lines at most', () => {
  it('the check belongs to Your plan only', () => {
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5 }).check).toBe(true);
    expect(explainPick(plan, { ...full, goal: 'race', days: 5 }).check).toBe(false);
  });

  it('merges length, days and what is not built in', () => {
    const e = explainPick(plan, { ...full, goal: 'muscle', days: 3, minutes: 45, easyOn: ['knees'], focus: ['arms'] });
    expect(e.warning).toBe(`About ${avg} min, 5 days. You asked for 45 min, 3 days. Knees and focus aren't built in yet.`);
  });

  it('only what differs is repeated', () => {
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 3 }).warning).toBe('5 days a week. You asked for 3 days.');
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, minutes: 45 }).warning).toBe(`About ${avg} min. You asked for 45 min.`);
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, minutes: 75 }).warning).toBeNull();
    expect(explainPick(plan, { ...full, goal: 'race', days: 5 }).warning).toBe("Race goal isn't built in yet.");
  });

  it('the worst case stays short: the rest is "and more"', () => {
    const e = explainPick(plan, { ...full, goal: 'race', days: 2, minutes: 20, easyOn: ['knees', 'neck'], focus: ['arms'], never: ['x'], style: 'bodyweight' });
    expect(e.warning).toBe(`About ${avg} min, 5 days. You asked for 20 min, 2 days. Race goal, easy-on areas and more aren't built in yet.`);
    expect(e.warning!.length).toBeLessThanOrEqual(110);
  });

  it('the reason carries the level and the place in one line', () => {
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, experience: 'new' }).reason).toBe('Picked for your full gym, your muscle goal and your 5 days. It expects some experience, so start light.');
    expect(explainPick(plan, { ...full, place: 'mix', goal: 'muscle', days: 5 }).reason).toBe('Picked for your full gym days, your muscle goal and your 5 days.');
  });

  it('offers a quick workout when sessions run well over or the user is brand new; primary at 20 or 30 minutes', () => {
    const q = (a: IntakeAnswers) => explainPick(plan, { ...full, goal: 'muscle', days: 5, ...a }).quick;
    expect(q({})).toBeNull();
    expect(q({ minutes: 75 })).toBeNull();
    expect(q({ minutes: 60 })).toBe(avg >= 75 ? 'secondary' : null);
    expect(q({ minutes: 45 })).toBe('secondary');
    expect(q({ experience: 'new' })).toBe('secondary');
    expect(q({ minutes: 30 })).toBe('primary');
    expect(q({ minutes: 20, experience: 'new' })).toBe('primary');
  });
});

describe('B3: the days answer is what gets repeated', () => {
  it('4 days then 3 weekdays says 4', () => {
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 4, weekdays: ['mon', 'wed', 'fri'] }).warning).toBe('5 days a week. You asked for 4 days.');
  });
  it('no days answer repeats no days', () => {
    expect(explainPick(plan, { ...full, goal: 'muscle', weekdays: ['mon', 'wed', 'fri'] }).warning).toBeNull();
  });
  it('the weekdays screen says so before Continue, without blocking it', () => {
    expect(weekdayCountNote({ days: 4 })).toBeNull();
    expect(weekdayCountNote({ days: 4, weekdays: ['mon', 'tue', 'wed', 'thu'] })).toBeNull();
    expect(weekdayCountNote({ days: 4, weekdays: ['mon', 'wed', 'fri'] })).toBe('That is 3 days. You said 4.');
    expect(weekdayCountNote({ days: 2, weekdays: ['mon'] })).toBe('That is 1 day. You said 2.');
    expect(canContinue('weekdays', { days: 4, weekdays: ['mon'] })).toBe(true);
  });
});

describe('P4, P5, P8, P10', () => {
  it('P4: favorites live on the cardio screen, and old drafts land there', () => {
    expect(visibleScreens({})).not.toContain('cardioFavorites');
    // 3.5u: 14, the three not built yet questions are hidden.
    expect(visibleScreens({}).filter((s) => s !== 'reveal')).toHaveLength(14);
    // PLAN 3.3a round 2 (B6): cardio is not used yet, so it is optional.
    expect(canContinue('cardio', {})).toBe(true);
    expect(canContinue('cardio', { cardio: 'little' })).toBe(true);
    const d = parseDraft(JSON.stringify({ step: 'cardioFavorites', answers: { cardio: 'little', cardioFavorites: ['bike'] } }))!;
    expect(d.step).toBe('cardio');
    expect(d.answers.cardioFavorites).toEqual(['bike']);
    expect(funnelReducer({ step: 'cardio', answers: { cardio: 'little', cardioFavorites: ['bike'] } }, { type: 'set', screen: 'cardio', value: 'none' }).answers.cardioFavorites).toBeUndefined();
  });

  it('P5: bodyweight only is named against a gym plan; other styles are not', () => {
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, style: 'bodyweight' }).warning).toBe("Bodyweight only isn't built in yet.");
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, style: 'free' }).warning).toBeNull();
  });

  it('P8: Back after Skip the rest returns to where it was tapped', () => {
    // 3.5u: when is hidden, so the same walk runs from easyOn.
    const s = funnelReducer({ step: 'easyOn', answers: { goal: 'muscle' } }, { type: 'skipRest' });
    expect(s.step).toBe('reveal');
    const b = funnelReducer(s, { type: 'back' });
    expect(b.step).toBe('easyOn');
    expect(b.answers.skipRestFrom).toBeUndefined();
    // Afterwards back is ordinary again; a reload on the reveal keeps the way back.
    expect(funnelReducer(funnelReducer(b, { type: 'skip' }), { type: 'back' }).step).toBe('easyOn');
    expect(parseDraft(JSON.stringify(s))!.answers.skipRestFrom).toBe('easyOn');
    expect(sanitizeAnswers({ skipRestFrom: 'goal' }).skipRestFrom).toBeUndefined();
  });

  it('P10: units are complete without a body pick', () => {
    const u = { weight: 'kg', distance: 'km', measure: 'cm' } as const;
    expect(canContinue('units', { units: u })).toBe(true);
    expect(sanitizeAnswers({ units: u }).units).toEqual(u);
    expect(sanitizeAnswers({ units: { ...u, body: 'x' } }).units).toEqual(u);
    expect(startState({ units: u }).answers.units).toEqual(u);
  });
});
