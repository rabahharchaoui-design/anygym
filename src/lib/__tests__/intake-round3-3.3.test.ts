import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { PLANS } from '../../data/plans';
import { planNeeds } from '../../data/places';
import { dumbbellRangeProblems, parseDumbbellRange } from '../load';
import { estimateDayMinutes } from '../plans';
import { canContinue, equipmentChoices, funnelReducer, parseDraft, sanitizeAnswers, SCREENS, startState, visibleScreens, type IntakeAnswers } from '../intake/funnel';
import { explainPick, noPlanWords, pickPlan } from '../intake/planPick';
import { GLOSSARY } from '../../data/glossary';
import { EQUIPMENT_INFO, EQUIPMENT_LABEL } from '../intake/options';

const plan = PLANS[0]!;
const full: IntakeAnswers = { place: 'full', equipment: [...EQUIPMENT_IDS] };

describe('B1: the line says only what the pick really used', () => {
  it.each([
    [{ goal: 'race', days: 2, minutes: 20, easyOn: ['knees'], experience: 'new' }],
    [{ goal: 'fat_loss', days: 3 }],
    [{ goal: 'strength', days: 5 }],
    [{ goal: 'muscle', days: 3 }],
  ] as IntakeAnswers[][])('%j is the closest plan, never "your plan"', (a) => {
    expect(explainPick(plan, { ...full, ...a }).title).toBe('Closest plan we have');
  });

  it('a race goal with bad knees is told plainly, and "muscle" is the plan, not their goal', () => {
    const e = explainPick(plan, { ...full, goal: 'race', days: 5, easyOn: ['knees'] });
    expect(e.reason).toBe('Picked for your full gym and your 5 days. It builds muscle.');
    expect(e.warning).toBe("Race goal and knees aren't built in yet.");
    expect(e.reason).not.toMatch(/built to add muscle/);
  });

  it('only a true match on goal and days is "Your plan"', () => {
    const e = explainPick(plan, { ...full, goal: 'muscle', days: 5 });
    expect(e.title).toBe('Your plan');
    expect(e.reason).toBe('Picked for your full gym, your muscle goal and your 5 days.');
    expect(e.warning).toBeNull();
  });

  it('lists focus and never as not built in; None and whole body balance are not a claim', () => {
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, focus: ['arms'], never: ['x'] }).warning).toBe("Focus and exercises to avoid aren't built in yet.");
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, focus: ['balance'], easyOn: ['none'] }).warning).toBeNull();
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, easyOn: ['knees', 'wrists', 'neck'] }).warning).toBe("Easy-on areas aren't built in yet.");
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, easyOn: ['knees'] }).warning).toBe("Knees aren't built in yet.");
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, easyOn: ['neck'] }).warning).toBe("Neck isn't built in yet.");
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, focus: ['arms'] }).warning).toBe("Focus isn't built in yet.");
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5, never: ['x'] }).warning).toBe("Exercises to avoid aren't built in yet.");
  });
});

describe('B2: session length comes from the workout header estimator', () => {
  it('every row carries the same number the workout header shows', () => {
    expect(explainPick(plan, { ...full, goal: 'muscle', days: 5 }).minutes).toEqual(plan.days.map((d) => estimateDayMinutes(d)));
  });
});

describe('B3: no plan', () => {
  it.each([
    ['hotel', 'No hotel plan yet'],
    ['home', 'No home plan yet'],
    ['outdoors', 'No outdoor plan yet'],
    ['full', 'No plan for your equipment yet'],
    ['mix', 'No plan for your equipment yet'],
  ] as const)('%s is titled %s, and the gym is said to be saved', (place, title) => {
    const w = noPlanWords(place);
    expect(w.title).toBe(title);
    expect(w.saved).toBe('Your gym and equipment are saved.');
  });
  it('pickPlan says none for less than a full gym', () => {
    expect(pickPlan(PLANS, planNeeds, { place: 'hotel', equipment: ['dumbbells'] }).kind).toBe('none');
  });
  it('Continue from the equipment goes to the notice only when told no plan fits; Keep going moves on; back returns', () => {
    const at = { step: 'equipment' as const, answers: { place: 'hotel' as const, equipment: ['dumbbells' as const] } };
    expect(funnelReducer(at, { type: 'next' }).step).toBe('style');
    const n = funnelReducer(at, { type: 'next', noFit: true });
    expect(n.step).toBe('noPlan');
    expect(visibleScreens(n.answers)).not.toContain('noPlan');
    expect(funnelReducer(n, { type: 'next' }).step).toBe('style');
    expect(funnelReducer(n, { type: 'back' }).step).toBe('equipment');
    expect(funnelReducer({ step: 'style', answers: n.answers }, { type: 'back' }).step).toBe('equipment');
    expect(parseDraft(JSON.stringify(n))?.step).toBe('noPlan');
  });
});

describe('B4: shorter', () => {
  const q = (a: IntakeAnswers) => visibleScreens(a).filter((s) => s !== 'reveal');
  it('17 question screens at most; brand new skips the exercise screen', () => {
    expect(q({})).toHaveLength(17);
    expect(q({ experience: 'new' })).not.toContain('exercises');
    expect(q({ experience: 'new', cardio: 'none' })).toHaveLength(16);
    expect(SCREENS).not.toContain('love');
    expect(SCREENS).not.toContain('name');
  });
  it('old drafts land on the merged screen, storage fields stay', () => {
    for (const [old, now] of [
      ['love', 'exercises'],
      ['never', 'exercises'],
      ['name', 'about'],
      ['height', 'about'],
      ['age', 'about'],
    ]) {
      const a = { love: ['x'], never: ['y'], name: 'Sam', height: { unit: 'cm', cm: 180 }, age: '25_34' };
      const d = parseDraft(JSON.stringify({ step: old, answers: a }))!;
      expect(d.step).toBe(now);
      expect(d.answers).toMatchObject(a);
    }
    expect(sanitizeAnswers({ skipped: ['name', 'never'] }).skipped).toEqual(['name', 'never']);
  });
  it('older age answers map onto the new ranges', () => {
    expect(sanitizeAnswers({ age: '18_24' }).age).toBe('under_25');
    expect(sanitizeAnswers({ age: 'under_18' }).age).toBe('under_25');
  });
  it('skipping a merged screen clears and marks every field in it', () => {
    const s = funnelReducer({ step: 'about', answers: { name: 'Sam', age: '25_34', height: { unit: 'cm', cm: 180 } } }, { type: 'skip' });
    expect(s.step).toBe('reveal');
    expect(s.answers.name).toBeUndefined();
    expect(s.answers.skipped).toEqual(['name', 'height', 'age']);
    expect(funnelReducer({ step: 'exercises', answers: { love: ['x'] } }, { type: 'skip' }).answers).toMatchObject({ skipped: ['love', 'never'] });
  });
  it('Continue on About marks what was left blank, so a cleared name goes (item 4 of round 2)', () => {
    const s = funnelReducer({ step: 'about', answers: { age: '25_34' } }, { type: 'next' });
    expect(s.answers.skipped).toEqual(['name', 'height']);
    expect(canContinue('about', {})).toBe(false);
    expect(canContinue('about', { age: '25_34' })).toBe(true);
    expect(canContinue('exercises', { never: ['x'] })).toBe(true);
    expect(canContinue('exercises', {})).toBe(false);
  });
  it('Skip the rest from the personal group goes straight to the reveal, with nothing kept', () => {
    const s = funnelReducer({ step: 'easyOn', answers: { easyOn: ['knees'], name: 'Sam', goal: 'muscle' } }, { type: 'skipRest' });
    expect(s.step).toBe('reveal');
    expect(s.answers.goal).toBe('muscle');
    expect(s.answers.easyOn).toBeUndefined();
    expect(s.answers.name).toBeUndefined();
    expect(s.answers.skipped).toEqual(expect.arrayContaining(['easyOn', 'love', 'never', 'when', 'bodyweight', 'name', 'height', 'age']));
    // Not before the group starts.
    const goal = startState();
    expect(funnelReducer(goal, { type: 'skipRest' })).toBe(goal);
  });
});

describe('P8: dumbbell range problems name the field', () => {
  const p = (a: string, b: string, c: string) => dumbbellRangeProblems(a, b, c, 'lb');
  it('blames only the field that is wrong', () => {
    expect(p('5', '50', 'abc')).toEqual({ step: 'number' });
    expect(p('abc', '50', '5')).toEqual({ min: 'number' });
    expect(p('5', 'x', '5')).toEqual({ max: 'number' });
    expect(p('', '', '')).toEqual({});
    expect(p('5', '', 'abc')).toEqual({ step: 'number' });
  });
  it('flags zero, reversed, too heavy, a too small step', () => {
    expect(p('0', '50', '5')).toEqual({ min: 'zero' });
    expect(p('40', '10', '5')).toEqual({ max: 'under-min' });
    expect(p('5', '900', '5')).toEqual({ max: 'too-heavy' });
    expect(p('5', '50', '0')).toEqual({ step: 'too-small' });
  });
  it('flags a step that never reaches the heaviest', () => {
    expect(p('5', '52', '5')).toEqual({ step: 'misses-max' });
    expect(parseDumbbellRange('5', '52', '5', 'lb')).toBeNull();
    expect(p('5', '50', '5')).toEqual({});
    expect(p('2.5', '10', '2.5')).toEqual({});
    expect(p('20', '20', '5')).toEqual({});
    expect(parseDumbbellRange('2,5', '10', '2,5', 'kg')).toEqual({ min: 2.5, max: 10, step: 2.5 });
  });
});

describe('P13: equipment', () => {
  it('outdoors asks only about pull up bars and bands; elsewhere everything', () => {
    expect(equipmentChoices('outdoors')).toEqual(['pull_up_bar', 'resistance_bands']);
    expect(equipmentChoices('home')).toEqual([...EQUIPMENT_IDS]);
  });
  it('every ⓘ is a real glossary entry, every machine has one, and the label breaks on spaces', () => {
    const ids = new Set(GLOSSARY.map((g) => g.id));
    for (const v of Object.values(EQUIPMENT_INFO)) expect(ids.has(v!)).toBe(true);
    for (const m of ['leg_extension', 'leg_curl', 'calf_raise_machine', 'hip_adductor_abductor', 'chest_press_machine', 'shoulder_press_machine'] as const) expect(EQUIPMENT_INFO[m]).toBeTruthy();
    expect(EQUIPMENT_LABEL.hyperextension_bench).toBe('Back extension bench');
  });
});
