import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { PLANS } from '../../data/plans';
import { canContinue, funnelReducer, goalsOf, KIND, MAX_GOALS, parseDraft, sanitizeAnswers, serializeDraft, setAnswer, startState, tapGoal, type IntakeAnswers } from '../intake/funnel';
import { EQUIPMENT_GROUPS, groupsFor, toggleGroup, toggleItem } from '../intake/equipmentGroups';
import { equipmentChoices } from '../intake/funnel';
import { explainPick, fitScore, pickPlan } from '../intake/planPick';
import type { Plan } from '../plans';
import type { Need } from '../places';
import { planSoFarSlots } from '../../screens/intake/PlanSoFar';
import { ART_IDS } from '../../screens/intake/EquipmentArt';

// PLAN 3.3a: G's intake fixes. Up to two goals (Main, then Also), the grouped equipment picker,
// and the "Your plan so far" strip.

describe('goals: up to 2, Main first (SPEC 14 step 1)', () => {
  it('the first tap is Main, the second Also, a third swaps out the Also', () => {
    expect(MAX_GOALS).toBe(2);
    let g = tapGoal([], 'muscle');
    expect(g).toEqual(['muscle']);
    g = tapGoal(g, 'strength');
    expect(g).toEqual(['muscle', 'strength']);
    g = tapGoal(g, 'fat_loss');
    expect(g).toEqual(['muscle', 'fat_loss']);
    g = tapGoal(g, 'race');
    expect(g).toEqual(['muscle', 'race']);
  });

  it('a picked goal comes off; when Main goes, the Also leads', () => {
    expect(tapGoal(['muscle', 'race'], 'race')).toEqual(['muscle']);
    expect(tapGoal(['muscle', 'race'], 'muscle')).toEqual(['race']);
    expect(tapGoal(['muscle'], 'muscle')).toEqual([]);
  });

  it('setAnswer keeps goal as the Main for every older reader, and clears both when none is left', () => {
    const a = setAnswer({}, 'goal', ['tone', 'health']);
    expect(a).toMatchObject({ goal: 'tone', goals: ['tone', 'health'] });
    const b = setAnswer(a, 'goal', ['health']);
    expect(b).toMatchObject({ goal: 'health', goals: ['health'] });
    const c = setAnswer(b, 'goal', []);
    expect(c.goal).toBeUndefined();
    expect(c.goals).toBeUndefined();
    // One id from an older caller still works.
    expect(setAnswer({}, 'goal', 'race')).toMatchObject({ goal: 'race', goals: ['race'] });
    // Never more than two.
    expect(setAnswer({}, 'goal', ['muscle', 'tone', 'race']).goals).toEqual(['muscle', 'tone']);
  });

  it('goalsOf reads old answers (one goal) and new ones (a list)', () => {
    expect(goalsOf({ goal: 'muscle' })).toEqual(['muscle']);
    expect(goalsOf({ goal: 'muscle', goals: ['muscle', 'race'] })).toEqual(['muscle', 'race']);
    expect(goalsOf({})).toEqual([]);
  });

  it('stored additively: an older single goal loads as Main; goals wins over a stale goal; junk goes', () => {
    expect(sanitizeAnswers({ goal: 'tone' })).toEqual({ goal: 'tone' });
    expect(sanitizeAnswers({ goal: 'muscle', goals: ['race', 'muscle'] })).toEqual({ goal: 'race', goals: ['race', 'muscle'] });
    expect(sanitizeAnswers({ goals: ['race', 'race', 'nope', 7, 'tone', 'health'] })).toEqual({ goal: 'race', goals: ['race', 'tone'] });
    expect(sanitizeAnswers({ goals: [], goal: 'health' })).toEqual({ goal: 'health' });
    expect(sanitizeAnswers({ goals: 'muscle' })).toEqual({});
  });

  it('a draft round trips, and an old draft without goals still resumes', () => {
    const s = funnelReducer(startState(), { type: 'set', screen: 'goal', value: ['strength', 'muscle'] });
    expect(parseDraft(serializeDraft(s))?.answers).toMatchObject({ goal: 'strength', goals: ['strength', 'muscle'] });
    expect(parseDraft(JSON.stringify({ step: 'units', answers: { goal: 'muscle' } }))).toEqual({ step: 'units', answers: { goal: 'muscle' } });
  });

  it('the goal screen has Continue now, ready once one is picked', () => {
    expect(KIND.goal).toBe('multi');
    expect(canContinue('goal', {})).toBe(false);
    expect(canContinue('goal', setAnswer({}, 'goal', ['race']))).toBe(true);
    const next = funnelReducer({ step: 'goal', answers: setAnswer({}, 'goal', ['race']) }, { type: 'next' });
    expect(next.step).toBe('units');
  });
});

describe('the plan pick weights Main over Also', () => {
  const full: IntakeAnswers = { place: 'full', equipment: [...EQUIPMENT_IDS], days: 5 };
  const plan = PLANS.find((p) => p.goal === 'muscle')!;
  const g = (goals: IntakeAnswers['goals']): IntakeAnswers => ({ ...full, goals, goal: goals?.[0] });

  it('a muscle Main counts more than a muscle Also, which counts more than none', () => {
    const main = fitScore(plan, g(['muscle', 'race']));
    const also = fitScore(plan, g(['race', 'muscle']));
    const none = fitScore(plan, g(['race', 'strength']));
    expect(main).toBeGreaterThan(also);
    expect(also).toBeGreaterThan(none);
  });

  it('between two plans that differ only in goal, a Main or Also muscle goal picks the muscle one', () => {
    // Two made up plans that differ only in goal: the Main match ranks first, the Also match next.
    const base = { ...plan, days: plan.days, daysPerWeek: 5 } as Plan;
    const strength = { ...base, id: 'x-strength', goal: 'strength' } as unknown as Plan;
    const muscle = { ...base, id: 'x-muscle', goal: 'muscle' } as Plan;
    const needs = (): readonly Need[] => ['bodyweight'];
    expect((pickPlan([strength, muscle], needs, g(['muscle'])) as { plan: Plan }).plan.id).toBe('x-muscle');
    expect((pickPlan([strength, muscle], needs, g(['race', 'muscle'])) as { plan: Plan }).plan.id).toBe('x-muscle');
    expect((pickPlan([strength, muscle], needs, g(['race'])) as { plan: Plan }).plan.id).toBe('x-strength');
  });

  it('only a Main match is "Your plan" with the check; a matching Also is named, never the title', () => {
    const main = explainPick(plan, g(['muscle', 'fat_loss']));
    expect(main.title).toBe('Your plan');
    expect(main.check).toBe(true);
    expect(main.reason).toBe('Picked for your full gym, your muscle goal and your 5 days.');
    expect(main.warning).toBe("Fat loss goal isn't built in yet.");
    const also = explainPick(plan, g(['strength', 'muscle']));
    expect(also.title).toBe('Closest plan we have');
    expect(also.check).toBe(false);
    expect(also.reason).toBe('Picked for your full gym, your second goal (muscle) and your 5 days.');
    expect(also.warning).toBe("Strength goal isn't built in yet.");
    const neither = explainPick(plan, g(['race', 'strength']));
    expect(neither.reason).toBe('Picked for your full gym and your 5 days. It builds muscle.');
    expect(neither.warning).toBe("Race goal and strength goal aren't built in yet.");
  });

  it('older single goal answers read exactly as before', () => {
    expect(explainPick(plan, { ...full, goal: 'muscle' })).toEqual(explainPick(plan, g(['muscle'])));
    expect(explainPick(plan, { ...full, goal: 'race' }).warning).toBe("Race goal isn't built in yet.");
  });
});

describe('equipment groups (PLAN 3.3a)', () => {
  it('every one of the 27 is in exactly one of the five groups, and has a drawing', () => {
    const all = EQUIPMENT_GROUPS.flatMap((g) => g.items);
    expect(all).toHaveLength(27);
    expect([...all].sort()).toEqual([...EQUIPMENT_IDS].sort());
    expect(EQUIPMENT_GROUPS.map((g) => g.label)).toEqual(['Free weights', 'Benches and racks', 'Machines', 'Cables', 'Bodyweight and extras']);
    expect([...ART_IDS].sort()).toEqual([...EQUIPMENT_IDS].sort());
  });

  it('a place asks only about its own: outdoors keeps two groups', () => {
    const out = groupsFor(equipmentChoices('outdoors'));
    expect(out.map((g) => [g.id, g.items])).toEqual([
      ['benches', ['pull_up_bar']],
      ['extras', ['resistance_bands']],
    ]);
    expect(groupsFor(equipmentChoices('full')).flatMap((g) => g.items)).toHaveLength(27);
  });

  it("a group's All turns only its items on, then off; the order stays the SPEC 3 order", () => {
    const cables = EQUIPMENT_GROUPS.find((g) => g.id === 'cables')!.items;
    const on = toggleGroup(['treadmill', 'dumbbells'], cables);
    expect(on).toEqual(EQUIPMENT_IDS.filter((id) => ['treadmill', 'dumbbells', ...cables].includes(id)));
    expect(toggleGroup(on, cables)).toEqual(['dumbbells', 'treadmill']);
    // Partly on: All fills the rest.
    expect(toggleGroup(['lat_pulldown'], cables)).toEqual(EQUIPMENT_IDS.filter((id) => cables.includes(id)));
  });

  it('one tile on and off', () => {
    expect(toggleItem([], 'rower')).toEqual(['rower']);
    expect(toggleItem(['rower', 'bike'], 'rower')).toEqual(['bike']);
    expect(toggleItem(['rower'], 'barbell_rack')).toEqual(['barbell_rack', 'rower']);
  });
});

describe('"Your plan so far" (PLAN 3.3a)', () => {
  it('waits with plain words, then shows only what was answered', () => {
    expect(planSoFarSlots({}).map((s) => s.value ?? s.empty)).toEqual(['Days', 'Minutes', 'Place']);
    expect(planSoFarSlots({}).every((s) => s.value === undefined)).toBe(true);
    expect(planSoFarSlots({ days: 4, minutes: 75, place: 'hotel' }).map((s) => s.value)).toEqual(['4 days', '75+ min', 'Hotel gyms']);
    expect(planSoFarSlots({ minutes: 30, place: 'mix' }).map((s) => s.value)).toEqual([undefined, '30 min', 'Mix']);
  });
});
