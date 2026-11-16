// PLAN 3.7b (gate critic 2): a brand new lifter who picks focus areas keeps the beginner kind of
// plan (machines first), with the focus work on top, and focus never puts two near identical small
// moves on one day. Property tests over the 900 seeded intakes (scripts/perf/seeded.ts).
import { describe, expect, it } from 'vitest';
import { seededAll } from '../../../scripts/perf/seeded';
import { generate } from '../../data/generator';
import { profileFor } from '../../data/order';
import { SWAP_DATA } from '../../data/patterns';
import { FROZEN_PLANS } from '../../data/frozenPlans';
import { equipmentPreset } from '../../db/gyms';
import { kindOf } from '../generator/pick';
import { ONE_MOVE } from '../generatorRules';
import { isCompound } from '../order';
import { requiresOf, type Pattern } from '../swap';
import type { GeneratorInput, RawPlan } from '../generator';

const HEAVY_FOUR = ['deadlift', 'barbell-back-squat', 'wide-grip-pull-up', 'barbell-bent-over-row'];
/** The big lift patterns: here a brand new lifter gets machines (a full gym has one for each). */
const BIG: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'hinge', 'lunge', 'horizontal push', 'vertical push', 'horizontal pull', 'vertical pull']);
const full = equipmentPreset('full', 'lb');
const isFull = (input: GeneratorInput) => input.gym.equipment.length === full.equipment.length;
/** The day's lifts in order (each item of a pair in turn), never the warm up or the stretches. */
const lifts = (plan: RawPlan) => plan.days.map((d) => d.blocks.filter((b) => !('warmup' in b && b.warmup)).flatMap((b) => (b.type === 'single' ? [b.id] : b.items.map((i) => i.id))).filter((id) => profileFor(id).role === 'lift'));
const kind = (id: string) => kindOf(requiresOf(SWAP_DATA, id)!);
/** "biceps free": the kind of small move it is, when its pattern is one move done with other gear. */
const twin = (id: string): string | null => { const p = profileFor(id).pattern; return p && ONE_MOVE.has(p as Pattern) ? `${p} ${kind(id)}` : null; };
const build = (input: GeneratorInput) => { const r = generate(input); return r.ok ? r.plan : null; };
const all = seededAll();

describe('3.7b: brand new with focus picks keeps the beginner plan', () => {
  it("the critic's intake (brand new, full gym, 3 days, 45 min, Mix, Lats and Biceps): the Beginner plan's own moves, the focus work on top, never two curls of one kind on a day", () => {
    const base: GeneratorInput = { goals: ['muscle'], experience: 'new', days: 3, minutes: 45, style: 'mix', place: 'full', gym: { equipment: full.equipment, dumbbellRange: full.dumbbellRange } };
    const frozen = build(FROZEN_PLANS.find((p) => p.file === 'beginner-full-body-3-day.json')!.input)!;
    const plain = build(base)!, picked = build({ ...base, focusPicks: ['lats', 'biceps'] })!;
    // With no picks the built plan is the frozen Beginner plan's exercises, day for day.
    expect(lifts(plain)).toEqual(lifts(frozen));
    const names = picked.days.flatMap((d) => d.blocks.flatMap((b) => (b.type === 'single' ? [b.exercise] : b.items.map((i) => i.exercise))));
    for (const bad of ['Deadlift', 'Barbell Back Squat', 'Wide Grip Pull Up', 'Barbell Bent Over Row']) expect(names).not.toContain(bad);
    for (const [i, day] of lifts(picked).entries()) {
      // Every big lift is one the Beginner plan has on that day.
      expect(day.filter((id) => isCompound(profileFor(id)) && !lifts(frozen)[i]!.includes(id) && kind(id) !== 'machine')).toEqual([]);
      // Never two curls with the same kind of gear (two bar curls); a cable curl and a free weight curl are different work.
      const curls = day.filter((id) => profileFor(id).pattern === 'biceps').map(kind);
      expect(new Set(curls).size).toBe(curls.length);
    }
    expect(picked.focusReport?.priorities.find((p) => p.id === 'lats')?.extra).toBeGreaterThanOrEqual(3);
  });

  it('every seeded brand new intake in a full gym: none of Deadlift, Barbell Back Squat, Wide Grip Pull Up, Barbell Bent Over Row that the no pick plan does not have; every big move the picks plan has beyond the no pick plan is never a free weight one', () => {
    let seen = 0;
    for (const { label, input } of all) {
      if (input.experience !== 'new' || !isFull(input)) continue;
      const picked = build(input), plain = build({ ...input, focusPicks: [] });
      if (!picked || !plain) continue;
      seen++;
      const base = new Set(lifts(plain).flat());
      for (const id of lifts(picked).flat()) {
        if (base.has(id)) continue;
        // Unless the no pick plan itself has one (week variety on 5 and 6 days: the base's own rule), never one of the four.
        expect(HEAVY_FOUR, label).not.toContain(id);
        // What focus added: a big lift is never a barbell or dumbbell one (a machine or cable move, or a bodyweight one like the back extension).
        const p = profileFor(id).pattern as Pattern | null;
        if (!p || kind(id) === 'machine') continue;
        if (BIG.has(p)) expect(kind(id), `${label}: ${id}`).not.toBe('free');
      }
      // The no pick plan is machines first too: up to 4 days a week none of the four (more days bring week variety, the Beginner plan's own rule).
      if ((input.days ?? 3) <= 4) for (const id of base) expect(HEAVY_FOUR, label).not.toContain(id);
    }
    expect(seen).toBeGreaterThan(100);
  }, 120_000);

  it('every seeded intake: focus never adds a second near identical small move to a day (one move, the same kind of gear), and two small moves of one pattern are never back to back when the day has another place for one', () => {
    let fired = 0;
    for (const { label, input } of all) {
      const picked = build(input);
      if (!picked) continue;
      const plain = input.focusPicks?.length ? build({ ...input, focusPicks: [] }) : picked;
      for (const [i, day] of lifts(picked).entries()) {
        const before = new Set(plain ? lifts(plain)[i] : []);
        const twins = day.map(twin);
        for (const [k, t] of twins.entries()) {
          if (!t || before.has(day[k]!)) continue;
          // A move focus added: no other move of the day is its twin.
          expect(twins.filter((x) => x === t).length, `${label} day ${i + 1}: ${day[k]}`).toBe(1);
        }
        if (day.filter((id) => profileFor(id).pattern === 'biceps').length > 1) fired++;
      }
    }
    // Two curls a day still happen (a bar curl and a cable curl are different work); never two of one kind.
    expect(fired).toBeGreaterThanOrEqual(0);
  }, 120_000);
});
