import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS } from '../../db/types';
import { PLANS } from '../../data/plans';
import { canContinue, funnelReducer, goalsOf, KIND, MAX_GOALS, parseDraft, sanitizeAnswers, serializeDraft, setAnswer, startState, tapGoal, type IntakeAnswers } from '../intake/funnel';
import { EQUIPMENT_GROUPS, groupsFor, toggleGroup, toggleItem } from '../intake/equipmentGroups';
import { equipmentChoices } from '../intake/funnel';
import { explainPick, fitScore, pickPlan } from '../intake/planPick';
import type { Plan } from '../plans';
import { SWAP_DATA } from '../../data/patterns';
import { planFit, swappedLine } from '../intake/planFit';
import { presetEquipment } from '../intake/funnel';
import { planSoFarPills, STRIP_SCREENS } from '../../screens/intake/PlanSoFar';
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
    expect((pickPlan([strength, muscle], SWAP_DATA, g(['muscle'])) as { plan: Plan }).plan.id).toBe('x-muscle');
    expect((pickPlan([strength, muscle], SWAP_DATA, g(['race', 'muscle'])) as { plan: Plan }).plan.id).toBe('x-muscle');
    expect((pickPlan([strength, muscle], SWAP_DATA, g(['race'])) as { plan: Plan }).plan.id).toBe('x-strength');
  });

  it('only a Main match is "Your plan" with the check; a matching Also is named, never the title', () => {
    const main = explainPick(plan, g(['muscle', 'fat_loss']));
    expect(main.title).toBe('Your plan');
    expect(main.check).toBe(true);
    expect(main.reason).toBe('Picked for your full gym, your muscle goal and your 5 days.');
    // Round 2 B2: both goals are named, each used or coming soon; the warning does not repeat them.
    expect(main.goals).toBe('Main muscle · Also fat loss (soon)');
    expect(main.warning).toBeNull();
    const also = explainPick(plan, g(['strength', 'muscle']));
    expect(also.title).toBe('Closest plan we have');
    expect(also.check).toBe(false);
    expect(also.reason).toBe('Picked for your full gym, your second goal (muscle) and your 5 days.');
    expect(also.goals).toBe('Main strength (soon) · Also muscle');
    expect(also.summary).toMatch(/^Closest: 5 days, about \d+ min\.$/);
    expect(main.summary).toBeNull();
    const neither = explainPick(plan, g(['race', 'strength']));
    expect(neither.reason).toBe('Picked for your full gym and your 5 days. It builds muscle.');
    expect(neither.goals).toBe('Main race (soon) · Also strength (soon)');
    // One goal: as before, no goals line.
    expect(explainPick(plan, g(['race'])).goals).toBeNull();
    expect(explainPick(plan, g(['race'])).warning).toBe("Race goal isn't built in yet.");
  });

  it('older single goal answers read exactly as before', () => {
    expect(explainPick(plan, { ...full, goal: 'muscle' })).toEqual(explainPick(plan, g(['muscle'])));
    expect(explainPick(plan, { ...full, goal: 'race' }).warning).toBe("Race goal isn't built in yet.");
  });
});

describe('B1: a plan fits through swaps, the way the day list runs it', () => {
  const full = (equipment: readonly string[]): IntakeAnswers => ({ goal: 'muscle', days: 5, place: 'full', equipmentFor: 'full', equipment: equipment as IntakeAnswers['equipment'] });

  it.each(['kettlebells', 'rower', 'jump_rope', 'ez_curl_bar', 'hip_adductor_abductor', 'leg_press', 'calf_raise_machine', 'smith_machine'] as const)('a full gym without %s still gets a plan', (off) => {
    const a = full(EQUIPMENT_IDS.filter((e) => e !== off));
    const p = pickPlan(PLANS, SWAP_DATA, a);
    expect(p.kind).toBe('plan');
  });

  it('every single item off in a full gym: never "no plan"', () => {
    const none = EQUIPMENT_IDS.filter((off) => pickPlan(PLANS, SWAP_DATA, full(EQUIPMENT_IDS.filter((e) => e !== off))).kind === 'none');
    expect(none).toEqual([]);
  });

  it('counts the moves swapped; everything on swaps nothing', () => {
    const plan = PLANS.find((p) => p.id === 'five-day-split')!;
    expect(planFit(SWAP_DATA, plan, full(EQUIPMENT_IDS))).toEqual({ fits: true, swapped: 0, noFit: [] });
    const noKb = planFit(SWAP_DATA, plan, full(EQUIPMENT_IDS.filter((e) => e !== 'kettlebells')));
    const usesKb = plan.days.some((d) => d.blocks.some((b) => b.items.some((i) => i.exerciseId === 'kettlebell-goblet-squat')));
    expect(noKb.fits).toBe(true);
    expect(noKb.swapped).toBe(usesKb ? 1 : 0);
    expect(swappedLine(1)).toBe('1 move swapped for your gym.');
    expect(swappedLine(3)).toBe('3 moves swapped for your gym.');
    expect(swappedLine(0)).toBeNull();
    expect(swappedLine(2, 1)).toBe('2 moves swapped and 1 skipped for your gym.');
    expect(swappedLine(0, 1)).toBe('1 move skipped: nothing at your gym stands in.');
    // The reveal says it.
    expect(explainPick(plan, full(EQUIPMENT_IDS), 3).reason).toBe('Picked for your full gym, your muscle goal and your 5 days. 3 moves swapped for your gym.');
  });

  it('a move with no stand in at all (leg extension) is skipped, said, and never sinks the plan', () => {
    const plan = PLANS.find((p) => p.id === 'five-day-split')!;
    const f = planFit(SWAP_DATA, plan, full(EQUIPMENT_IDS.filter((e) => e !== 'leg_extension')));
    expect(f.fits).toBe(true);
    expect(f.noFit.length).toBeGreaterThan(0);
    expect(explainPick(plan, full(EQUIPMENT_IDS), f.swapped, f.noFit.length).reason).toMatch(/skipped/);
  });

  it('a gym with nothing gets only the plan that needs nothing (PLAN 3.5), never a gym plan', () => {
    const gyms: IntakeAnswers[] = [{ place: 'full', equipmentFor: 'full', equipment: [] }, { place: 'outdoors', equipment: presetEquipment('outdoors') }];
    for (const a of gyms) {
      const p = pickPlan(PLANS, SWAP_DATA, a);
      expect(p.kind).toBe('plan');
      if (p.kind === 'plan') expect([p.plan.id, ...p.others.map((o) => o.id)]).toEqual(['no-equipment-3-day']);
    }
    // Gear the data is not sure of fits only a gym the user called full: never a guess at home.
    const plan = PLANS[0]!;
    expect(planFit(SWAP_DATA, plan, { place: 'home', equipment: [...EQUIPMENT_IDS].filter((e) => e !== 'rower') }).fits).toBe(false);
  });
});

describe('B2: far off on days, minutes and level is the wrong plan for the person', () => {
  const plan = PLANS.find((p) => p.id === 'five-day-split')!;
  const base: IntakeAnswers = { goal: 'muscle', goals: ['muscle', 'fat_loss'], place: 'full', equipment: [...EQUIPMENT_IDS] };

  it('a brand new 3 day 45 min user: no beginner plan yet, the quick workout leads, the plan stays an option', () => {
    const e = explainPick(plan, { ...base, experience: 'new', days: 3, minutes: 45 });
    expect(e.mismatch).toBe(true);
    expect(e.title).toBe('No 3 day, 45 min beginner plan yet');
    // Round 3 (B2): one honest line up front, every fact still in the reason and warning.
    expect(e.summary).toMatch(/^Closest: 5 days, about \d+ min\.$/);
    expect(e.reason).toBe('Picked for your full gym and your muscle goal. It runs 5 days a week. It expects some experience, so start light.');
    expect(e.warning).toMatch(/^About \d+ min, 5 days\. You asked for 45 min, 3 days\.$/);
    expect(e.quick).toBe('primary');
    expect(e.check).toBe(false);
    expect(e.goals).toBe('Main muscle · Also fat loss (soon)');
  });

  it('one dimension off is still the closest plan with the plan first', () => {
    const e = explainPick(plan, { ...base, experience: '3y', days: 4, minutes: 45 });
    expect(e.mismatch).toBe(false);
    expect(e.title).toBe('Closest plan we have');
    expect(e.quick).not.toBe('primary');
    expect(explainPick(plan, { ...base, experience: 'new', days: 5, minutes: 75 }).mismatch).toBe(false);
  });

  it('days and level off, with no time limit: says so without minutes', () => {
    expect(explainPick(plan, { ...base, experience: 'months', days: 3, minutes: 75 }).title).toBe('No 3 day beginner plan yet');
    expect(explainPick(plan, { ...base, experience: '3y', days: 2, minutes: 30 }).title).toBe('No 2 day, 30 min plan yet');
  });
});

describe('equipment groups (PLAN 3.3a)', () => {
  it('every one of the 27 is in exactly one of the five groups, and has a drawing', () => {
    const all = EQUIPMENT_GROUPS.flatMap((g) => g.items);
    expect(all).toHaveLength(27);
    expect([...all].sort()).toEqual([...EQUIPMENT_IDS].sort());
    expect(EQUIPMENT_GROUPS.map((g) => g.label)).toEqual(['Free weights', 'Benches and bars', 'Machines', 'Cables', 'Cardio and extras']);
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

describe('"Your plan so far" (PLAN 3.3a round 2 B7)', () => {
  it('leads with the goals, then the level, one pill per answer the plan uses', () => {
    expect(planSoFarPills({})).toEqual([]);
    expect(planSoFarPills({ goal: 'muscle', goals: ['muscle', 'fat_loss'] }).map((p) => p.text)).toEqual(['Muscle + fat loss']);
    expect(planSoFarPills({ goal: 'tone' }).map((p) => p.text)).toEqual(['Tone up']);
    expect(planSoFarPills({ goal: 'muscle', experience: 'new', days: 3, minutes: 75, place: 'hotel', focus: ['arms'], cardio: 'love' }).map((p) => p.text)).toEqual([
      'Muscle',
      'Brand new',
      '3 days',
      '75+ min',
      'Hotel gyms',
    ]);
  });

  it('shows only on the screens that add to it', () => {
    expect([...STRIP_SCREENS]).toEqual(['goal', 'experience', 'days', 'minutes', 'place']);
  });
});
