import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { BODYWEIGHT_STEP, cmToFtIn, convertBodyweight, convertForGym, ftInToCm, roundToStep } from '../load';
import { regionOf, unitsForLocale } from '../intake/region';
import {
  canContinue,
  HIDDEN_SCREENS,
  funnelReducer,
  KIND,
  needsDumbbellRange,
  parseDraft,
  presetEquipment,
  prevScreen,
  progressOf,
  sanitizeAnswers,
  SCREENS,
  serializeDraft,
  setAnswer,
  SKIPPABLE,
  NOT_USED_YET,
  startState,
  type FunnelState,
  type AnswerId,
  type IntakeAnswers,
  type ScreenId,
} from '../intake/funnel';
import { flipBodyweight, labels, offsetFor, snapBodyweight, TICK_PX, tickCount, valueAt } from '../intake/ruler';
import { explainPick, fittingPlans, noPlanWords, pickPlan, weekOf } from '../intake/planPick';
import { SWAP_DATA } from '../../data/patterns';
import { PLANS } from '../../data/plans';

describe('units from the phone region (PLAN 3.3)', () => {
  it.each([
    ['en-US', 'US'],
    ['es-US', 'US'],
    ['fr-FR', 'FR'],
    ['en_GB', 'GB'],
    ['zh-Hant-TW', 'TW'],
    ['es-419', '419'],
    ['en', null],
    ['', null],
    [undefined, null],
  ])('%s → region %s', (tag, region) => expect(regionOf(tag)).toBe(region));

  it('US gets lb, mi, in; everywhere else kg, km, cm', () => {
    expect(unitsForLocale('en-US')).toEqual({ weight: 'lb', distance: 'mi', measure: 'in' });
    expect(unitsForLocale('es-US')).toEqual({ weight: 'lb', distance: 'mi', measure: 'in' });
    for (const l of ['fr-FR', 'en-GB', 'de-DE', 'ja-JP', 'en-CA', 'en', null]) expect(unitsForLocale(l)).toEqual({ weight: 'kg', distance: 'km', measure: 'cm' });
  });
});

const walk = (s: FunnelState, ...actions: Parameters<typeof funnelReducer>[1][]) => actions.reduce(funnelReducer, s);
const units = { weight: 'kg', distance: 'km', measure: 'cm', body: 'female' } as const;

/** One valid answer for every question screen. */
const ANSWER: Record<AnswerId, unknown> = {
  goal: 'muscle',
  units,
  focus: ['arms', 'glutes'],
  win: ['energy'],
  experience: '1_2y',
  days: 4,
  weekdays: ['mon', 'wed', 'fri', 'sat'],
  minutes: 45,
  place: 'hotel',
  equipment: ['dumbbells', 'adjustable_bench'],
  style: 'free',
  cardio: 'little',
  cardioFavorites: ['bike'],
  easyOn: ['knees'],
  love: ['barbell-back-squat'],
  never: ['burpee'],
  when: 'after_work',
  name: 'Sam',
  bodyweight: { value: 72.5, unit: 'kg' },
  height: { unit: 'cm', cm: 180 },
  age: '25_34',
};

describe('the funnel state machine', () => {
  it('walks every screen in order, saving each answer as it is given', () => {
    let s = startState();
    const seen: ScreenId[] = [];
    const fields: Partial<Record<ScreenId, AnswerId[]>> = { cardio: ['cardio', 'cardioFavorites'], exercises: ['love', 'never'], about: ['name', 'height', 'age'] };
    while (s.step !== 'reveal') {
      seen.push(s.step);
      const screen = s.step;
      // Nothing to continue with before the answer, except equipment (preset by the place) and,
      // since PLAN 3.3a round 2 (B6), the questions not used yet (optional).
      expect(canContinue(screen, s.answers)).toBe(screen === 'equipment' || NOT_USED_YET.has(screen));
      for (const f of fields[screen] ?? [screen as AnswerId]) s = funnelReducer(s, { type: 'set', screen: f, value: ANSWER[f] });
      s = funnelReducer(s, { type: 'next' });
    }
    // 3.5u: the three questions whose feature is not built yet (win, when, bodyweight) are not asked.
    expect(seen).toEqual(SCREENS.filter((x) => x !== 'reveal' && x !== 'noPlan' && !HIDDEN_SCREENS.has(x)));
    expect(seen).toHaveLength(14);
    // Equipment was set after the place preset: the user's pick is kept.
    const asked = Object.fromEntries(Object.entries(ANSWER).filter(([k]) => !HIDDEN_SCREENS.has(k as ScreenId)));
    expect(s.answers).toMatchObject({ ...asked, equipmentFor: 'hotel' });
    expect(s.answers.skipped).toBeUndefined();
    expect(progressOf('reveal', s.answers)).toBe(1);
    expect(progressOf('goal', s.answers)).toBe(0);
  });

  it('Continue does nothing until the screen has its answer', () => {
    const s = startState();
    expect(funnelReducer(s, { type: 'next' })).toBe(s);
    const focus = walk(s, { type: 'goto', screen: 'focus' });
    expect(focus.step).toBe('focus');
    // PLAN 3.3a round 2 (B6, supersedes): focus is not used yet, so it is optional; blank is skipped.
    const blank = walk(focus, { type: 'set', screen: 'focus', value: [] }, { type: 'next' });
    // 3.5u: win is hidden, so experience comes next.
    expect(blank.step).toBe('experience');
    expect(blank.answers.skipped).toEqual(['focus']);
    expect(walk(focus, { type: 'set', screen: 'focus', value: ['back'] }, { type: 'next' }).step).toBe('experience');
    const units = walk(s, { type: 'goto', screen: 'units' });
    expect(canContinue('units', { ...units.answers, units: undefined })).toBe(false);
    // A blank name is no name.
    const name = walk(s, { type: 'goto', screen: 'about' }, { type: 'set', screen: 'name', value: '   ' });
    expect(canContinue('about', name.answers)).toBe(false);
  });

  it('single choice screens are the ones that advance on their own; the rest have Continue', () => {
    const single = SCREENS.filter((s) => KIND[s] === 'single');
    // PLAN 3.3a: the goal takes up to 2 picks now, so it has Continue (superseded: it was single).
    expect(single).toEqual(['experience', 'days', 'minutes', 'place', 'style', 'when']);
  });

  it('Skip only on personal screens: clears the answer, remembers the skip, moves on', () => {
    // PLAN 3.3a round 2: style (not used yet, a single choice with no Continue) gets Skip too.
    expect([...SKIPPABLE].sort()).toEqual(['about', 'bodyweight', 'easyOn', 'exercises', 'style', 'weekdays', 'when'].sort());
    // 3.5u: bodyweight is hidden, so the same walk runs on easyOn (exercises comes next).
    const s = walk(startState(), { type: 'goto', screen: 'easyOn' }, { type: 'set', screen: 'easyOn', value: ['knees'] }, { type: 'skip' });
    expect(s.step).toBe('exercises');
    expect(s.answers.easyOn).toBeUndefined();
    expect(s.answers.skipped).toEqual(['easyOn']);
    // Answering later takes it off the skipped list.
    const back = walk(s, { type: 'back' }, { type: 'set', screen: 'easyOn', value: ['knees'] });
    expect(back.step).toBe('easyOn');
    expect(back.answers.skipped).toBeUndefined();
    // Skip on a question that is not personal does nothing.
    const goal = startState();
    expect(funnelReducer(goal, { type: 'skip' })).toBe(goal);
  });

  it('Back goes to the screen before and keeps every answer; on the first screen it stays', () => {
    const s = walk(startState(), { type: 'set', screen: 'goal', value: 'fat_loss' }, { type: 'next' }, { type: 'set', screen: 'units', value: units }, { type: 'next' });
    expect(s.step).toBe('focus');
    const b = walk(s, { type: 'back' }, { type: 'back' });
    expect(b.step).toBe('goal');
    expect(b.answers).toEqual(s.answers);
    expect(funnelReducer(b, { type: 'back' })).toBe(b);
    expect(prevScreen('goal', {})).toBeNull();
  });

  it('a new place presets the equipment (SPEC 3); the same place keeps the edits', () => {
    const hotel = walk(startState(), { type: 'goto', screen: 'place' }, { type: 'set', screen: 'place', value: 'hotel' });
    expect(hotel.answers.equipment).toEqual(presetEquipment('hotel'));
    const edited = walk(hotel, { type: 'set', screen: 'equipment', value: ['dumbbells'] }, { type: 'set', screen: 'place', value: 'hotel' });
    expect(edited.answers.equipment).toEqual(['dumbbells']);
    const full = walk(edited, { type: 'set', screen: 'place', value: 'full' });
    expect(full.answers.equipment).toEqual([...EQUIPMENT_IDS]);
    expect(walk(full, { type: 'set', screen: 'place', value: 'outdoors' }).answers.equipment).toEqual([]);
    // Nothing picked is a real equipment answer.
    expect(canContinue('equipment', { equipment: [] })).toBe(true);
  });

  it('a saved draft resumes exactly; junk is dropped, never trusted', () => {
    const s = walk(startState(), { type: 'set', screen: 'goal', value: 'race' }, { type: 'next' });
    expect(parseDraft(serializeDraft(s))).toEqual(s);
    expect(parseDraft('not json')).toBeNull();
    expect(parseDraft(null)).toBeNull();
    const junk = parseDraft(JSON.stringify({ step: 'nope', answers: { goal: 'fly', days: 9, focus: ['arms', 'wings'], bodyweight: { value: 9999, unit: 'kg' }, height: { unit: 'in', ft: 5, in: 12 }, name: '  Al  ' } }));
    expect(junk).toEqual({ step: 'goal', answers: { focus: ['arms'], name: 'Al' } });
    expect(sanitizeAnswers({ units: { weight: 'kg', distance: 'mi', measure: 'cm', body: 'male' } }).units).toEqual({ weight: 'kg', distance: 'mi', measure: 'cm', body: 'male' });
    expect(sanitizeAnswers({ units: { weight: 'st', distance: 'mi', measure: 'cm', body: 'male' } }).units).toBeUndefined();
  });
});

describe('item 3: dumbbells outside a preset need a range the user gave', () => {
  const home: IntakeAnswers = { units: { weight: 'lb', distance: 'mi', measure: 'in', body: 'male' }, place: 'home', equipment: ['dumbbells'] };
  it('only home and outdoors ask, and only with Dumbbells on', () => {
    expect(needsDumbbellRange(home)).toBe(true);
    expect(needsDumbbellRange({ ...home, place: 'outdoors' })).toBe(true);
    expect(needsDumbbellRange({ ...home, equipment: [] })).toBe(false);
    expect(needsDumbbellRange({ ...home, place: 'hotel' })).toBe(false);
    expect(needsDumbbellRange({ ...home, place: 'full' })).toBe(false);
    expect(needsDumbbellRange({ ...home, place: 'mix' })).toBe(false);
  });
  it('Continue waits for a valid range', () => {
    expect(canContinue('equipment', home)).toBe(false);
    expect(canContinue('equipment', { ...home, dumbbellRange: { min: 5, max: 50, step: 5 } })).toBe(true);
    expect(canContinue('equipment', { ...home, dumbbellRange: { min: 50, max: 5, step: 5 } })).toBe(false);
  });
  it('a range is dropped when the weight unit or the place changes (never 50 lb read as 50 kg)', () => {
    const a: IntakeAnswers = { ...home, dumbbellRange: { min: 5, max: 50, step: 5 } };
    expect(setAnswer(a, 'units', { ...a.units!, weight: 'kg' }).dumbbellRange).toBeUndefined();
    expect(setAnswer(a, 'units', { ...a.units!, distance: 'km' }).dumbbellRange).toEqual({ min: 5, max: 50, step: 5 });
    expect(setAnswer(a, 'place', 'hotel').dumbbellRange).toBeUndefined();
  });
  it('sanitize keeps valid ranges only', () => {
    expect(sanitizeAnswers({ dumbbellRange: { min: 5, max: 50, step: 5 } }).dumbbellRange).toEqual({ min: 5, max: 50, step: 5 });
    expect(sanitizeAnswers({ dumbbellRange: { min: 5, max: 50, step: 0 } }).dumbbellRange).toBeUndefined();
    expect(sanitizeAnswers({ dumbbellRange: 'x' }).dumbbellRange).toBeUndefined();
  });
});

describe('body measurement math in load.ts', () => {
  it('rounds to a step exactly', () => {
    expect(roundToStep(70.24, 0.5)).toBe(70);
    expect(roundToStep(70.25, 0.5)).toBe(70.5);
    expect(roundToStep(154.32, 0.5)).toBe(154.5);
    expect(() => roundToStep(1, 0)).toThrow();
  });
  it('flips a bodyweight through convertForGym, snapped to 0.5', () => {
    expect(convertBodyweight(70, 'kg', 'lb')).toBe(154.5);
    expect(convertBodyweight(155, 'lb', 'kg')).toBe(70.5);
    expect(convertBodyweight(80, 'kg', 'kg')).toBe(80);
    for (let kg = 30; kg <= 250; kg += 0.5) expect(convertBodyweight(kg, 'kg', 'lb')).toBe(roundToStep(convertForGym(kg, 'kg', 'lb'), BODYWEIGHT_STEP));
  });
  it('converts height both ways to whole cm and whole inches', () => {
    expect(ftInToCm(5, 10)).toBe(178);
    expect(cmToFtIn(178)).toEqual({ ft: 5, in: 10 });
    expect(cmToFtIn(183)).toEqual({ ft: 6, in: 0 });
    for (let ft = 4; ft <= 7; ft++) for (let i = 0; i < 12; i++) expect(cmToFtIn(ftInToCm(ft, i))).toEqual({ ft, in: i });
  });
});

describe('the bodyweight ruler', () => {
  it('snaps every position to a 0.5 tick inside the range', () => {
    expect(TICK_PX).toBeGreaterThan(0);
    expect(valueAt(0, 'kg')).toBe(30);
    expect(valueAt(TICK_PX, 'kg')).toBe(30.5);
    expect(valueAt(TICK_PX * 1.4, 'kg')).toBe(30.5);
    expect(valueAt(TICK_PX * 1.6, 'kg')).toBe(31);
    expect(valueAt(-500, 'kg')).toBe(30);
    expect(valueAt(1e9, 'lb')).toBe(550);
    for (const unit of ['kg', 'lb'] as const) {
      for (let t = 0; t < tickCount(unit); t += 7) {
        const v = valueAt(t * TICK_PX + 3, unit);
        expect((v * 2) % 1).toBe(0);
        expect(offsetFor(v, unit)).toBe(t * TICK_PX);
      }
    }
    expect(snapBodyweight(72.3, 'kg')).toBe(72.5);
    expect(labels('kg')[0]).toBe(30);
    expect(labels('lb').at(-1)).toBe(550);
  });
  it('the unit toggle equals the load.ts conversion', () => {
    for (let kg = 40; kg <= 200; kg += 0.5) expect(flipBodyweight(kg, 'kg', 'lb')).toBe(convertBodyweight(kg, 'kg', 'lb'));
    for (let lb = 90; lb <= 440; lb += 0.5) expect(flipBodyweight(lb, 'lb', 'kg')).toBe(convertBodyweight(lb, 'lb', 'kg'));
  });
});

describe('the plan reveal picks honestly from the plans that exist', () => {
  const full: IntakeAnswers = { goal: 'muscle', experience: '3y', days: 5, place: 'full', equipment: [...EQUIPMENT_IDS] };

  it('a full gym gets a curated plan, the alternatives and the whole week', () => {
    const p = pickPlan(PLANS, SWAP_DATA, full);
    expect(p.kind).toBe('plan');
    if (p.kind !== 'plan') return;
    expect(p.plan.id).toBe('five-day-split');
    expect(explainPick(p.plan, full).reason).toBe('Picked for your full gym, your muscle goal and your 5 days.');
    expect(explainPick(p.plan, full).warning).toBeNull();
    // PLAN 3.5: the generated curated plans fit a full gym too (a hotel or bodyweight plan runs anywhere with that gear).
    expect(p.others.map((o) => o.id)).toEqual(['six-week-volume', 'hotel-gym-3-day', 'beginner-full-body-3-day', 'no-equipment-3-day']);
    expect(weekOf(p.plan, full).map((w) => w.label)).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5']);
  });

  it('PLAN 3.5: a hotel gets the hotel plan, home and outdoors the no equipment plan; only the plans their gear runs', () => {
    const fit = (place: 'hotel' | 'home' | 'outdoors') => fittingPlans(PLANS, SWAP_DATA, { place, equipment: presetEquipment(place) }).map((x) => x.plan.id);
    expect(fit('hotel')).toEqual(['hotel-gym-3-day', 'no-equipment-3-day']);
    expect(fit('home')).toEqual(['no-equipment-3-day']);
    expect(fit('outdoors')).toEqual(['no-equipment-3-day']);
    // A plan that needs gear the gym lacks is never offered (the full gym plans at a hotel).
    for (const place of ['hotel', 'home', 'outdoors'] as const) for (const id of ['five-day-split', 'six-week-volume', 'beginner-full-body-3-day']) expect(fit(place)).not.toContain(id);
    expect(noPlanWords('hotel').title).toBe('No hotel plan yet');
    // PLAN 3.3a B1 (supersedes 3.3): a full gym with one machine off still fits, through a swap.
    const partial = EQUIPMENT_IDS.filter((e) => e !== 'leg_press');
    expect(pickPlan(PLANS, SWAP_DATA, { place: 'full', equipment: partial }).kind).toBe('plan');
  });

  it('lays the week on the picked weekdays only when the count equals the plan days, Monday first', () => {
    const plan = PLANS[0]!;
    const w = weekOf(plan, { weekdays: ['fri', 'mon', 'wed', 'tue', 'thu'] });
    expect(w.map((x) => x.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(w.map((x) => x.dayName)).toEqual(plan.days.map((d) => d.name));
  });

  it.each([[['mon', 'wed', 'fri']], [['mon', 'tue', 'wed', 'thu', 'fri', 'sat']]] as const)('never hides or repeats a workout: %j shows Day 1 to N with a caveat', (weekdays) => {
    const plan = PLANS[0]!;
    const a: IntakeAnswers = { ...full, weekdays: [...weekdays] };
    const w = weekOf(plan, a);
    expect(w.map((x) => x.label)).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5']);
    expect(w.map((x) => x.dayIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(explainPick(plan, a).warning).toBeNull();
  });

  it('matching weekdays need no scheduling caveat', () => {
    const plan = PLANS[0]!;
    expect(explainPick(plan, { ...full, weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'] }).warning).toBeNull();
  });

  it('ranks by days, goal and experience; ties keep the shipped order', () => {
    const p = pickPlan(PLANS, SWAP_DATA, { place: 'full', equipment: [...EQUIPMENT_IDS] });
    expect(p.kind === 'plan' && p.plan.id).toBe('five-day-split');
  });
});
