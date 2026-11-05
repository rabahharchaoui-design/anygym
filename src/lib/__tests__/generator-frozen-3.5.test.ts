// PLAN 3.5, SPEC 7.5 items 3 to 5: the three generated curated plans are frozen JSON that equals the
// generator's output for their fixed inputs (scripts/freeze-plans.mts writes them), run like any
// shipped plan, and use only the gear their place has.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FROZEN_PLANS, frozenPlanText } from '../../data/frozenPlans';
import { PLANS, planById } from '../../data/plans';
import { SWAP_DATA } from '../../data/patterns';
import { profileFor } from '../../data/order';
import { placesOfPlan } from '../../data/places';
import { dayWorkout } from '../planWorkout';
import { estimateDayMinutes } from '../plans';
import { requiresOf, supports } from '../swap';
import { isCompound } from '../order';

const text = (file: string) => readFileSync(new URL(`../../../data/plans/${file}`, import.meta.url), 'utf8');

describe('frozen generated plans', () => {
  it.each(FROZEN_PLANS.map((p) => [p.file, p] as const))('%s equals the generator output (run node scripts/freeze-plans.mts after a rule change)', (file, p) => {
    expect(text(file)).toBe(frozenPlanText(p));
  });

  it('are shipped and registered with the plan picker, in order after the hand written plans', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['five-day-split', 'six-week-volume', 'hotel-gym-3-day', 'no-equipment-3-day', 'beginner-full-body-3-day']);
    expect(planById('hotel-gym-3-day')!.name).toBe('Hotel Gym 3 Day');
    expect(planById('no-equipment-3-day')!.name).toBe('No Equipment 3 Day');
    expect(planById('beginner-full-body-3-day')!.name).toBe('Beginner Full Body 3 Day');
  });

  it.each(FROZEN_PLANS.map((p) => [p.file, p] as const))('%s: 3 full body days, every day a workout with targets and rests, only gear the place has', (_file, p) => {
    const plan = planById(p.input.meta!.id)!;
    expect(plan.days.map((d) => d.name)).toEqual(['Full body A', 'Full body B', 'Full body C']);
    plan.days.forEach((d, i) => {
      const w = dayWorkout(plan, i);
      expect(w.length).toBeGreaterThanOrEqual(3);
      for (const e of w) {
        expect(e.sets).toBeGreaterThan(0);
        expect(e.restSec).toBeGreaterThan(0);
        expect(e.reps !== undefined || e.seconds !== undefined).toBe(true);
        const needs = requiresOf(SWAP_DATA, e.exerciseId);
        expect(needs, e.exerciseId).not.toBeNull();
        expect(supports(needs!, p.input.gym), e.exerciseId).toBe(true);
      }
      expect(estimateDayMinutes(d)).toBeLessThanOrEqual(p.input.minutes!);
    });
  });

  it('hotel: dumbbells, a bench, one cable; no equipment: nothing at all; beginner: machines first', () => {
    const needs = (id: string) => planById(id)!.days.flatMap((d) => d.blocks.flatMap((b) => b.items.map((it) => requiresOf(SWAP_DATA, it.exerciseId)!)));
    const kit = { equipment: ['dumbbells', 'adjustable_bench', 'cable_station'] as const, dumbbellRange: { min: 5, max: 50, step: 5 } };
    for (const r of needs('hotel-gym-3-day')) expect(supports(r, { ...kit, equipment: [...kit.equipment] })).toBe(true);
    for (const r of needs('no-equipment-3-day')) expect(r).toEqual([]);
    // Machines first: the first big lift of every beginner day is a machine.
    for (const d of planById('beginner-full-body-3-day')!.days) {
      const first = d.blocks.flatMap((b) => b.items).find((it) => isCompound(profileFor(it.exerciseId)))!;
      const req = requiresOf(SWAP_DATA, first.exerciseId)!.flat();
      expect(req.some((g) => !['barbell_rack', 'dumbbells', 'kettlebells', 'flat_bench', 'adjustable_bench'].includes(g)), first.exerciseId).toBe(true);
    }
  });

  it('give the hotel, home and bodyweight tiles a real plan (PLAN 3.1)', () => {
    expect(placesOfPlan(planById('hotel-gym-3-day')!)).toEqual(['travel', 'full']);
    expect(placesOfPlan(planById('no-equipment-3-day')!)).toEqual(['home', 'travel', 'full', 'bodyweight']);
    expect(placesOfPlan(planById('beginner-full-body-3-day')!)).toEqual(['full']);
  });

  it('name no person', () => {
    for (const p of FROZEN_PLANS) expect(text(p.file)).not.toMatch(/rabah|ohrabah|\bG\b/i);
  });
});
