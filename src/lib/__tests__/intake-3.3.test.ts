import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { BODYWEIGHT_STEP, cmToFtIn, convertBodyweight, convertForGym, ftInToCm, roundToStep } from '../load';
import { regionOf, unitsForLocale } from '../intake/region';
import {
  canContinue,
  funnelReducer,
  KIND,
  parseDraft,
  presetEquipment,
  prevScreen,
  progressOf,
  sanitizeAnswers,
  SCREENS,
  serializeDraft,
  SKIPPABLE,
  startState,
  visibleScreens,
  type FunnelState,
  type IntakeAnswers,
  type ScreenId,
} from '../intake/funnel';
import { flipBodyweight, labels, offsetFor, snapBodyweight, TICK_PX, tickCount, valueAt } from '../intake/ruler';
import { caveatFor, fittingPlans, needsCovered, pickPlan, weekOf } from '../intake/planPick';
import { PLANS } from '../../data/plans';
import { planNeeds } from '../../data/places';

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
const ANSWER: Record<Exclude<ScreenId, 'reveal'>, unknown> = {
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
    while (s.step !== 'reveal') {
      seen.push(s.step);
      const screen = s.step as Exclude<ScreenId, 'reveal'>;
      // Nothing to continue with before the answer, except equipment (preset by the place).
      expect(canContinue(screen, s.answers)).toBe(screen === 'equipment');
      s = walk(s, { type: 'set', screen, value: ANSWER[screen] }, { type: 'next' });
    }
    expect(seen).toEqual(SCREENS.filter((x) => x !== 'reveal'));
    // Equipment was set after the place preset: the user's pick is kept.
    expect(s.answers).toMatchObject({ ...ANSWER, equipmentFor: 'hotel' });
    expect(s.answers.skipped).toBeUndefined();
    expect(progressOf('reveal', s.answers)).toBe(1);
    expect(progressOf('goal', s.answers)).toBe(0);
  });

  it('Continue does nothing until the screen has its answer', () => {
    const s = startState();
    expect(funnelReducer(s, { type: 'next' })).toBe(s);
    const focus = walk(s, { type: 'goto', screen: 'focus' });
    expect(focus.step).toBe('focus');
    expect(walk(focus, { type: 'set', screen: 'focus', value: [] }, { type: 'next' }).step).toBe('focus');
    expect(walk(focus, { type: 'set', screen: 'focus', value: ['back'] }, { type: 'next' }).step).toBe('win');
    // A blank name is no name.
    const name = walk(s, { type: 'goto', screen: 'name' }, { type: 'set', screen: 'name', value: '   ' });
    expect(canContinue('name', name.answers)).toBe(false);
  });

  it('single choice screens are the ones that advance on their own; the rest have Continue', () => {
    const single = SCREENS.filter((s) => KIND[s] === 'single');
    expect(single).toEqual(['goal', 'experience', 'days', 'minutes', 'place', 'style', 'cardio', 'when', 'age']);
  });

  it('Skip only on personal screens: clears the answer, remembers the skip, moves on', () => {
    expect([...SKIPPABLE].sort()).toEqual(['age', 'bodyweight', 'cardioFavorites', 'easyOn', 'height', 'love', 'name', 'never', 'weekdays', 'when'].sort());
    const s = walk(startState(), { type: 'goto', screen: 'bodyweight' }, { type: 'set', screen: 'bodyweight', value: { value: 80, unit: 'kg' } }, { type: 'skip' });
    expect(s.step).toBe('height');
    expect(s.answers.bodyweight).toBeUndefined();
    expect(s.answers.skipped).toEqual(['bodyweight']);
    // Answering later takes it off the skipped list.
    const back = walk(s, { type: 'back' }, { type: 'set', screen: 'bodyweight', value: { value: 81, unit: 'kg' } });
    expect(back.step).toBe('bodyweight');
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

  it('cardio None hides the favorites screen and clears them', () => {
    const a: IntakeAnswers = { cardio: 'little', cardioFavorites: ['bike'] };
    expect(visibleScreens(a)).toContain('cardioFavorites');
    const s = walk({ step: 'cardio', answers: a }, { type: 'set', screen: 'cardio', value: 'none' }, { type: 'next' });
    expect(s.step).toBe('easyOn');
    expect(s.answers.cardioFavorites).toBeUndefined();
    expect(funnelReducer(s, { type: 'back' }).step).toBe('cardio');
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

  it('a full gym gets a curated plan, with the reason in one line', () => {
    const p = pickPlan(PLANS, planNeeds, full);
    expect(p.kind).toBe('plan');
    if (p.kind !== 'plan') return;
    expect(p.plan.id).toBe('five-day-split');
    expect(p.reason).toBe('5 days a week in a full gym, built to add muscle.');
    expect(p.caveat).toBeNull();
    expect(p.others.map((o) => o.id)).toEqual(['six-week-volume']);
    expect(p.week.map((w) => w.label)).toEqual(['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5']);
  });

  it('every shipped plan needs a full gym today: anything less gets an honest none', () => {
    for (const place of ['hotel', 'home', 'outdoors'] as const) {
      const a: IntakeAnswers = { place, equipment: presetEquipment(place) };
      expect(fittingPlans(PLANS, planNeeds, a)).toEqual([]);
      const p = pickPlan(PLANS, planNeeds, a);
      expect(p.kind).toBe('none');
    }
    expect(pickPlan(PLANS, planNeeds, { place: 'hotel', equipment: presetEquipment('hotel') })).toEqual({
      kind: 'none',
      reason: 'No plan made for hotel gyms yet.',
      caveat: 'A quick workout works anywhere: add exercises as you go.',
    });
    // A full gym with one machine turned off no longer covers the plans' unknown needs.
    const partial = EQUIPMENT_IDS.filter((e) => e !== 'leg_press');
    expect(pickPlan(PLANS, planNeeds, { place: 'full', equipment: partial }).kind).toBe('none');
  });

  it('covered needs come from the equipment only', () => {
    expect(needsCovered([...EQUIPMENT_IDS])).toBe('all');
    expect(needsCovered([])).toEqual(['bodyweight']);
    expect(needsCovered(['dumbbells', 'treadmill', 'cable_station'])).toEqual(['bodyweight', 'dumbbell', 'cable', 'cardio']);
    // One machine does not cover "a machine": the plan does not say which.
    expect(needsCovered(['leg_press'])).toEqual(['bodyweight']);
  });

  it('says the one caveat that matters', () => {
    const plan = PLANS[0]!;
    expect(caveatFor(plan, { ...full, place: 'mix' })).toBe('It needs a full gym. On the road, start a quick workout.');
    expect(caveatFor(plan, { ...full, days: 3 })).toBe('You picked 3 days. Do the days in order at your own pace.');
    expect(caveatFor(plan, { ...full, experience: 'new' })).toBe('It is made for lifters with some experience, so start light.');
    expect(caveatFor(plan, { ...full, minutes: 20 })).toBe('Some days run longer than 20 min.');
  });

  it('lays the week on the picked weekdays, Monday first, in plan order', () => {
    const plan = PLANS[0]!;
    const w = weekOf(plan, { weekdays: ['fri', 'mon', 'wed'] });
    expect(w).toEqual([
      { label: 'Mon', dayName: plan.days[0]!.name, dayIndex: 0 },
      { label: 'Wed', dayName: plan.days[1]!.name, dayIndex: 1 },
      { label: 'Fri', dayName: plan.days[2]!.name, dayIndex: 2 },
    ]);
    const six = weekOf(plan, { weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] });
    expect(six.at(-1)).toEqual({ label: 'Sat', dayName: plan.days[0]!.name, dayIndex: 0 });
  });

  it('ranks by days, goal and experience; ties keep the shipped order', () => {
    const p = pickPlan(PLANS, planNeeds, { place: 'full', equipment: [...EQUIPMENT_IDS] });
    expect(p.kind === 'plan' && p.plan.id).toBe('five-day-split');
  });
});
