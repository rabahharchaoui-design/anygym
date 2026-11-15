// PLAN 3.6g: a small move that focus adds to a day the trim shortened rests like that day's own
// small moves (60 s, SPEC 22 rule 6), the way a small move added to a short day does (generator/fit.ts).
// Before, it came with the goal's full rest, did not fit, and the pick got nothing on a full day.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { profileFor } from '../../data/order';
import { equipmentPreset } from '../../db/gyms';
import { isCompound } from '../order';
import type { GeneratorInput } from '../generator';

const input = (minutes: number): GeneratorInput => ({ goals: ['strength'], experience: 'months', days: 4, minutes, focusPicks: ['upper_chest'], scheduleStyle: 'flexible', gym: equipmentPreset('full', 'lb') });
const build = (i: GeneratorInput) => { const r = generate(i); if (!r.ok) throw new Error(r.reason); return { r, plan: definitionPlan(r.plan)! }; };
/** The rest of each small lift (never a big lift, a hold or a warm up), by day. */
const smallRests = (plan: ReturnType<typeof build>['plan']) => plan.days.map((d) => d.blocks.filter((b) => !b.warmup && b.items.every((it) => { const p = profileFor(it.exerciseId); return p.role === 'lift' && !isCompound(p) && it.seconds === undefined; })).map((b) => ({ ids: b.items.map((it) => it.exerciseId), rest: b.restSec! })));

describe('3.6g: the rest of a small move focus adds', () => {
  it('a strength plan at 45 minutes: the trimmed days rest 60 s on small moves, the new upper chest move too, and the pick gets its extra inside the minutes', () => {
    const { r, plan } = build(input(45));
    const base = build({ ...input(45), focusPicks: [] });
    // The days as they are with no picks were trimmed: their small moves rest 60 s (the goal's own rest is 90).
    expect(smallRests(base.plan).flat().every((b) => b.rest === 60)).toBe(true);
    const added = smallRests(plan).flat().filter((b) => b.ids.includes('Incline_Dumbbell_Flyes'));
    expect(added.length).toBeGreaterThan(0);
    for (const b of added) expect(b.rest).toBe(60);
    expect(r.applied.focusReport!.priorities[0]).toMatchObject({ id: 'upper_chest', state: 'extra' });
    expect(r.applied.focusReport!.priorities[0]!.extra).toBeGreaterThanOrEqual(4);
    for (const m of r.applied.minutes) expect(m).toBeLessThanOrEqual(45);
  });
  it('at 75 minutes nothing is trimmed: a new small move keeps the goal\'s full rest', () => {
    const { plan } = build(input(75));
    const added = smallRests(plan).flat().filter((b) => b.ids.includes('Incline_Dumbbell_Flyes'));
    expect(added.length).toBeGreaterThan(0);
    for (const b of added) expect(b.rest).toBe(90);
  });
  it('never shorter than the day\'s own small moves: on a day that kept its full rests the new move keeps them too', () => {
    for (const minutes of [45, 60]) for (const goal of ['muscle', 'health', 'strength'] as const) {
      const i = { ...input(minutes), goals: [goal] };
      const now = smallRests(build(i).plan), was = smallRests(build({ ...i, focusPicks: [] }).plan);
      for (const [d, blocks] of now.entries()) {
        const least = Math.min(60, ...was[d]!.map((b) => b.rest));
        for (const b of blocks) expect(b.rest, `${goal} ${minutes} day ${d + 1} ${b.ids}`).toBeGreaterThanOrEqual(least);
      }
    }
  });
});
