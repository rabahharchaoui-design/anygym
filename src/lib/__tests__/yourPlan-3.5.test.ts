// PLAN 3.5: "Your plan" on the reveal. The intake answers reach the generator whole, and the words
// say only what it really did (SPEC 14 step 14, the PLAN 3.3a honest reveal rules).
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan, PLANS } from '../../data/plans';
import { SWAP_DATA } from '../../data/patterns';
import { EQUIPMENT_IDS } from '../../db/types';
import { explainPick, pickPlan } from '../intake/planPick';
import type { Applied } from '../generator';
import { generatorInputOf, yourPlanWords } from '../intake/yourPlan';
import { presetEquipment, type IntakeAnswers } from '../intake/funnel';

const reveal = (a: IntakeAnswers) => {
  const r = generate(generatorInputOf(a));
  if (!r.ok) throw new Error(r.reason);
  const plan = definitionPlan(r.plan)!;
  return { r, plan, words: explainPick(plan, a, 0, 0, r.applied) };
};

describe('the answers reach the generator', () => {
  it('every answer it uses is passed, the rest is not', () => {
    const a: IntakeAnswers = {
      goals: ['muscle', 'fat_loss'],
      experience: '3y',
      days: 4,
      minutes: 45,
      focus: ['arms'],
      easyOn: ['knees'],
      love: ['dumbbell-bench-press'],
      never: ['crunch'],
      style: 'free',
      cardio: 'love',
      cardioFavorites: ['rower'],
      place: 'hotel',
      equipment: presetEquipment('hotel'),
      name: 'Sam',
      when: 'early',
    };
    const input = generatorInputOf(a);
    expect(input).toMatchObject({ goals: ['muscle', 'fat_loss'], experience: '3y', days: 4, minutes: 45, focus: ['arms'], easyOn: ['knees'], love: ['dumbbell-bench-press'], never: ['crunch'], style: 'free', cardio: 'love', cardioFavorites: ['rower'], place: 'hotel' });
    expect(input.gym.equipment).toEqual(presetEquipment('hotel'));
    expect(input.gym.dumbbellRange).toEqual({ min: 5, max: 50, step: 5 });
    expect(JSON.stringify(input)).not.toContain('Sam');
  });
});

describe('Your plan words', () => {
  it('a hotel, 4 days, 45 min, arms, easy on knees: two plain lines from what was built', () => {
    const a: IntakeAnswers = { goals: ['muscle'], experience: '1_2y', days: 4, minutes: 45, focus: ['arms'], easyOn: ['knees'], place: 'hotel', equipment: presetEquipment('hotel') };
    const { words, plan } = reveal(a);
    expect(words.title).toBe('Your plan');
    expect(words.check).toBe(true);
    expect(words.summary).toBeNull();
    expect(words.reason).toMatch(/^Built to build muscle: 4 days, about \d+ min, hotel friendly, extra arm work, easy on knees\.$/);
    expect(words.minutes).toHaveLength(plan.days.length);
    expect(words.goals).toBeNull();
  });
  it('two goals: both named; an Also that changed nothing says (soon)', () => {
    const base: IntakeAnswers = { experience: '1_2y', days: 3, place: 'full', equipment: [...EQUIPMENT_IDS] };
    expect(reveal({ ...base, goals: ['muscle', 'fat_loss'] }).words.goals).toBe('Main muscle · Also fat loss');
    expect(reveal({ ...base, goals: ['muscle', 'fat_loss'] }).words.reason).toContain('a 10 min treadmill finisher');
    expect(reveal({ ...base, goals: ['muscle', 'tone'] }).words.goals).toBe('Main muscle · Also tone up (soon)');
  });
  it('says what it could not do: missing gear, a focus with no room, loved moves that do not fit', () => {
    const a: IntakeAnswers = { goals: ['muscle'], experience: '1_2y', days: 3, minutes: 30, focus: ['back'], love: ['barbell-back-squat'], place: 'outdoors', equipment: [] };
    const { words } = reveal(a);
    expect(words.warning).toMatch(/^Nothing here for .+: that takes gear you don't have\./);
    expect(words.warning).toContain('No room for extra back work and the exercise you love here.');
    expect(words.reason).toContain('no equipment needed');
    expect(words.reason).not.toContain('extra back');
  });
  it('a home, outdoors, hotel or full gym brand new path gets a plan', () => {
    for (const place of ['home', 'outdoors', 'hotel', 'full'] as const) {
      const a: IntakeAnswers = { goals: ['muscle'], experience: 'new', days: 3, minutes: 45, place, equipment: presetEquipment(place) };
      expect(generate(generatorInputOf(a)).ok, place).toBe(true);
      expect(reveal(a).words.quick).toBe('secondary');
    }
  });
  it('yourPlanWords never claims a focus that was trimmed away', () => {
    const w = yourPlanWords(
      { main: 'muscle', also: null, alsoUsed: false, focus: [], focusMissed: ['chest'], loved: [], lovedMissed: [], never: 0, easyOn: [], gaps: [], finisher: null, minutes: [40, 41], over: false },
      { minutes: 45, place: 'full' },
      2,
    );
    expect(w.reason).toBe('Built to build muscle: 2 days, about 41 min, full gym.');
    expect(w.warning).toBe('No room for extra chest work here.');
  });
  it('a strength plan that kept its long rests says why it has fewer lifts', () => {
    const base: Applied = { main: 'strength', also: null, alsoUsed: false, focus: [], focusMissed: [], loved: [], lovedMissed: [], never: 0, easyOn: [], gaps: [], finisher: null, minutes: [29, 29], over: false };
    expect(yourPlanWords({ ...base, restKept: true }, { minutes: 30, place: 'hotel' }, 3).warning).toBe('Strength days keep their long rests, so this time fits fewer lifts.');
    expect(yourPlanWords(base, { minutes: 30, place: 'hotel' }, 3).warning).toBeNull();
  });
  it('a curated plan that truly matches keeps its own words (the generator is only for the rest)', () => {
    const a: IntakeAnswers = { goal: 'muscle', experience: '3y', days: 5, place: 'full', equipment: [...EQUIPMENT_IDS] };
    const p = pickPlan(PLANS, SWAP_DATA, a);
    expect(p.kind === 'plan' && explainPick(p.plan, a).check).toBe(true);
  });
});
