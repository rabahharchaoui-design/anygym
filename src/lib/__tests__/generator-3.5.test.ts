// PLAN 3.5: the plan generator (SPEC 7.3, 7.4, 15, 22). Tables for the split and the prescriptions,
// the curation from every intake answer, determinism, and seeded properties over random intakes and
// gyms (fast-check is not installed: the generators are hand written and deterministic).
import { describe, expect, it } from 'vitest';
import { generate, GENERATOR_DEPS } from '../../data/generator';
import { definitionPlan } from '../../data/plans';
import { profileFor } from '../../data/order';
import { SWAP_DATA } from '../../data/patterns';
import { CATALOG_NAMES } from '../../data/importMatch';
import { equipmentPreset } from '../../db/gyms';
import { EQUIPMENT_IDS, type EquipmentId } from '../../db/types';
import { generatePlan, hashText, type GeneratorInput, type RawItem, type RawPlan } from '../generator';
import { EFFORT, FAMILY_OF, PRESCRIPTION, splitFor } from '../generatorRules';
import { canPair, easyOnAvoids, heaviestOf, isCompound, restFor, type Profile } from '../order';
import { estimateDayMinutes } from '../plans';
import { patternOf, supports, workoutIdOf, type Candidate, type Pattern } from '../swap';
import type { GymKit } from '../picker';
import { DAYS, EXPERIENCE, FOCUS, GOALS, MINUTES, STYLES, type ExperienceId, type FocusId, type GoalId } from '../intake/options';

const FULL: GymKit = (() => {
  const p = equipmentPreset('full', 'lb');
  return { equipment: p.equipment, dumbbellRange: p.dumbbellRange };
})();
const HOTEL: GymKit = (() => {
  const p = equipmentPreset('hotel', 'lb');
  return { equipment: p.equipment, dumbbellRange: p.dumbbellRange };
})();
const NOTHING: GymKit = { equipment: [], dumbbellRange: null };

const ok = (input: GeneratorInput): RawPlan => {
  const r = generate(input);
  if (!r.ok) throw new Error(r.reason);
  return r.plan;
};
const itemsOf = (plan: RawPlan): RawItem[] => plan.days.flatMap((d) => d.blocks.flatMap((b) => (b.type === 'single' ? [b] : b.items)));
const blocksOf = (plan: RawPlan) => plan.days.flatMap((d) => d.blocks);

/** Every candidate a workout id can be, across the ladders. */
const CANDIDATE = new Map<string, Candidate>();
for (const l of Object.values(SWAP_DATA.patterns)) for (const c of l.candidates) CANDIDATE.set(workoutIdOf(c), c);
const CATALOG = new Set(CATALOG_NAMES.map((c) => c.id));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickOne = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const some = <T,>(r: () => number, xs: readonly T[], p: number): T[] => xs.filter(() => r() < p);

function randomInput(seed: number): GeneratorInput {
  const r = rng(seed);
  const ids = [...CANDIDATE.keys()];
  const goals = some(r, GOALS.map((g) => g.id), 0.2).slice(0, 2) as GoalId[];
  const equipment = some(r, EQUIPMENT_IDS, r()) as EquipmentId[];
  const input: GeneratorInput = {
    goals,
    experience: pickOne(r, EXPERIENCE.map((e) => e.id)) as ExperienceId,
    days: pickOne(r, DAYS),
    minutes: pickOne(r, MINUTES),
    focus: some(r, FOCUS.map((f) => f.id), 0.2) as FocusId[],
    easyOn: some(r, ['lower_back', 'knees', 'shoulders', 'wrists', 'neck', 'hips'], 0.15),
    love: some(r, ids, 0.03),
    never: some(r, ids, 0.05),
    style: pickOne(r, STYLES.map((s) => s.id)),
    gym: { equipment, dumbbellRange: equipment.includes('dumbbells') && r() < 0.8 ? { min: 5, max: 50, step: 5 } : null },
  };
  return input;
}

describe('SPEC 7.3 split by days per week', () => {
  it.each([
    [2, ['Full body A', 'Full body B']],
    [3, ['Full body A', 'Full body B', 'Full body C']],
    [4, ['Upper A', 'Lower A', 'Upper B', 'Lower B']],
    [5, ['Upper', 'Lower', 'Push', 'Pull', 'Legs']],
    [6, ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']],
  ] as const)('%i days: %j', (days, names) => {
    const plan = ok({ goals: ['muscle'], experience: '1_2y', days, minutes: 75, gym: FULL });
    expect(plan.days.map((d) => d.name)).toEqual(names);
    expect(plan.daysPerWeek).toBe(days);
    expect(plan.progressionMode).toBe('double');
    expect(splitFor(days).days.map((d) => d.name)).toEqual(names);
  });
  it('anything else is 3 days', () => {
    expect(ok({ goals: ['muscle'], days: 9, gym: FULL }).days).toHaveLength(3);
    expect(ok({ goals: ['muscle'], gym: FULL }).days).toHaveLength(3);
  });
  it('weekly balance on a full gym: legs every week, push and pull roughly equal, big muscles about twice a week', () => {
    const PUSH = new Set<Pattern>(['horizontal push', 'vertical push', 'chest isolation', 'triceps', 'lateral delt']);
    const PULL = new Set<Pattern>(['horizontal pull', 'vertical pull', 'rear delt', 'biceps']);
    const LEGS = new Set<Pattern>(['squat', 'hinge', 'lunge', 'quads isolation', 'hamstrings isolation', 'glutes', 'calves']);
    for (const days of DAYS) {
      const plan = ok({ goals: ['muscle'], experience: '1_2y', days, minutes: 75, gym: FULL });
      const sets = (s: ReadonlySet<Pattern>) =>
        plan.days.flatMap((d) => d.blocks.flatMap((b) => (b.type === 'single' ? [{ id: b.id, sets: b.sets }] : b.items.map((i) => ({ id: i.id, sets: b.sets }))))).filter((x) => s.has(patternOf(SWAP_DATA, x.id)!)).reduce((n, x) => n + x.sets, 0);
      expect(sets(LEGS), `${days} days legs`).toBeGreaterThan(0);
      const push = sets(PUSH);
      const pull = sets(PULL);
      expect(Math.abs(push - pull) / Math.max(push, pull), `${days} days push ${push} pull ${pull}`).toBeLessThanOrEqual(0.5);
      // Chest and back: on at least two days (about twice a week) from 3 days up.
      const daysWith = (ps: Pattern[]) => plan.days.filter((d) => d.blocks.some((b) => (b.type === 'single' ? [b] : b.items).some((i) => ps.includes(patternOf(SWAP_DATA, i.id)!)))).length;
      if (days >= 3) {
        expect(daysWith(['horizontal push', 'chest isolation'])).toBeGreaterThanOrEqual(2);
        expect(daysWith(['horizontal pull', 'vertical pull'])).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('SPEC 7.3 reps, rest and sets by goal and level', () => {
  const firstBlocks = (goal: GoalId, experience: ExperienceId = '1_2y') => blocksOf(ok({ goals: [goal], experience, days: 3, minutes: 75, gym: FULL }));
  it.each([
    ['muscle', [8, 12], [10, 15], 60],
    ['tone', [8, 12], [10, 15], 60],
    ['strength', [4, 6], [8, 10], 90],
    ['fat_loss', [10, 15], [10, 15], 45],
    ['health', [8, 12], [8, 12], 75],
    ['race', [8, 12], [8, 12], 75],
    ['comeback', [8, 12], [8, 12], 75],
    ['athletic', [5, 8], [8, 12], 75],
  ] as const)('%s: compounds %j, accessories %j at %i s rest; compound rest never below SPEC 22 rule 6', (goal, compound, accessory, accRest) => {
    const fam = FAMILY_OF[goal];
    for (const b of firstBlocks(goal)) {
      for (const it of b.type === 'single' ? [b] : b.items) {
        if (it.seconds) continue;
        const p = profileFor(it.id);
        if (isCompound(p)) {
          expect(it.reps, it.id).toEqual(compound);
          if (b.type === 'single') expect(b.restSec, it.id).toBeGreaterThanOrEqual(PRESCRIPTION[fam].compoundRest);
          const body = (CANDIDATE.get(it.id)?.requires ?? []).every((g) => g.every((e) => e === 'flat_bench' || e === 'adjustable_bench' || e === 'pull_up_bar' || e === 'dip_station'));
          if (!body) expect(b.restSec, it.id).toBeGreaterThanOrEqual(restFor(p, fam === 'strength' ? 'strength' : 'muscle'));
        } else {
          expect(it.reps, it.id).toEqual(accessory);
          expect(b.restSec, it.id).toBe(accRest);
        }
      }
    }
  });
  it('strength: heavy compounds rest 3 min, never paired (rule 5 and 6)', () => {
    const plan = ok({ goals: ['strength'], experience: '3y', days: 3, minutes: 75, gym: FULL });
    expect(blocksOf(plan).some((b) => b.type === 'superset')).toBe(false);
    const squat = blocksOf(plan).find((b) => b.type === 'single' && b.id === 'barbell-back-squat');
    expect(squat && squat.type === 'single' ? squat.restSec : 0).toBe(180);
  });
  it.each([
    ['new', 3, 2],
    ['months', 3, 3],
    ['1_2y', 3, 3],
    ['break', 3, 3],
    ['3y', 4, 3],
  ] as const)('%s lifters: %i sets on compounds, %i on the rest', (experience, c, a) => {
    for (const b of firstBlocks('muscle', experience)) {
      const items = b.type === 'single' ? [b] : b.items;
      const compound = items.some((it) => isCompound(profileFor(it.id)));
      expect(b.sets, items[0]!.id).toBe(compound ? c : a);
    }
  });
  it('fat loss adds a 10 min finisher with gear the gym has; athletic a conditioning one; none for muscle', () => {
    expect(ok({ goals: ['fat_loss'], days: 3, gym: HOTEL, cardioFavorites: ['bike'] }).days.every((d) => d.finisher?.name === 'Bike' && d.finisher.minutes === 10)).toBe(true);
    expect(ok({ goals: ['fat_loss'], days: 3, gym: NOTHING }).days[0]!.finisher).toEqual({ name: 'Bodyweight circuit', minutes: 10, requires: [] });
    expect(ok({ goals: ['athletic'], days: 3, gym: HOTEL }).days[0]!.finisher).toEqual({ name: 'Treadmill intervals', minutes: 10, requires: [['treadmill']] });
    expect(ok({ goals: ['muscle'], days: 3, gym: FULL }).days.some((d) => d.finisher)).toBe(false);
  });
  it('effort in plain words (SPEC 22 rule 8): newer lifters 2 to 3 reps left on everything', () => {
    for (const it of itemsOf(ok({ goals: ['muscle'], experience: 'new', days: 3, gym: FULL }))) if (!it.seconds) expect(it.note).toBe(EFFORT.newer);
    for (const it of itemsOf(ok({ goals: ['muscle'], experience: '3y', days: 3, gym: FULL }))) {
      if (it.seconds) continue;
      expect(it.note).toBe(isCompound(profileFor(it.id)) ? EFFORT.compound : EFFORT.isolation);
    }
  });
});

describe('Main leads, Also adds (SPEC 14)', () => {
  it('Also fat loss on muscle: same reps, plus the finisher', () => {
    const r = generate({ goals: ['muscle', 'fat_loss'], experience: '1_2y', days: 3, minutes: 75, gym: FULL });
    expect(r.ok && r.applied.alsoUsed).toBe(true);
    expect(r.ok && r.plan.goal).toBe('muscle');
    expect(r.ok && r.plan.days.every((d) => d.finisher?.minutes === 10)).toBe(true);
  });
  it('Also strength: the first big lift of each day trains heavy', () => {
    const plan = ok({ goals: ['muscle', 'strength'], experience: '1_2y', days: 3, minutes: 75, gym: FULL });
    for (const d of plan.days) {
      const items = d.blocks.flatMap((b) => (b.type === 'single' ? [b] : b.items));
      const lead = heaviestOf(items.map((i) => profileFor(i.id)))!;
      expect(items.find((i) => i.id === lead.id)!.reps).toEqual([4, 6]);
      expect(items.filter((i) => i.id !== lead.id && isCompound(profileFor(i.id))).every((i) => i.reps![0] === 8)).toBe(true);
    }
  });
  it('an Also goal that changes nothing is said so', () => {
    const r = generate({ goals: ['muscle', 'tone'], days: 3, gym: FULL });
    expect(r.ok && r.applied.alsoUsed).toBe(false);
  });
});

describe('plan curation from the intake (SPEC 15)', () => {
  const base: GeneratorInput = { goals: ['muscle'], experience: '1_2y', days: 3, minutes: 75, gym: FULL };
  it('never wanted exercises never appear, even when loved too', () => {
    const plain = ok(base);
    const first = itemsOf(plain)[0]!.id;
    const without = ok({ ...base, never: [first], love: [first] });
    expect(itemsOf(without).map((i) => SWAP_DATA.sameAs(i.id))).not.toContain(SWAP_DATA.sameAs(first));
  });
  it('a loved exercise is included where it fits, and named', () => {
    const r = generate({ ...base, love: ['dumbbell-bench-press'] });
    expect(r.ok && itemsOf(r.plan).map((i) => i.id)).toContain('dumbbell-bench-press');
    expect(r.ok && r.applied.loved).toEqual(['dumbbell-bench-press']);
  });
  it('a loved exercise the gym cannot do is reported, never forced in', () => {
    const r = generate({ ...base, gym: HOTEL, love: ['barbell-back-squat'] });
    expect(r.ok && itemsOf(r.plan).map((i) => i.id)).not.toContain('barbell-back-squat');
    expect(r.ok && r.applied.lovedMissed).toEqual(['barbell-back-squat']);
  });
  it.each(['lower_back', 'knees', 'shoulders', 'wrists', 'hips', 'neck'])('go easy on %s: no lift that loads it', (joint) => {
    for (const days of DAYS) {
      const plan = ok({ ...base, days, easyOn: [joint] });
      for (const it of itemsOf(plan)) expect(easyOnAvoids([joint], profileFor(it.id)), it.id).toBe(false);
    }
  });
  it('knees: no lunges (leg press or squats instead); lower back: no barbell squats, deadlifts or bent over rows', () => {
    const knees = itemsOf(ok({ ...base, easyOn: ['knees'] }));
    expect(knees.some((i) => patternOf(SWAP_DATA, i.id) === 'lunge')).toBe(false);
    const back = itemsOf(ok({ ...base, easyOn: ['lower_back'] })).map((i) => i.id);
    for (const id of ['barbell-back-squat', 'deadlift', 'romanian-deadlift', 'barbell-bent-over-row']) expect(back).not.toContain(id);
  });
  it.each(['chest', 'back', 'shoulders', 'arms', 'core', 'glutes', 'legs'] as const)('focus %s adds 2 to 4 weekly sets for it', (focus) => {
    const r = generate({ ...base, focus: [focus] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f = r.applied.focus.find((x) => x.id === focus);
    expect(f, focus).toBeDefined();
    expect(f!.sets).toBeGreaterThanOrEqual(2);
    expect(f!.sets).toBeLessThanOrEqual(4);
    const total = (p: RawPlan) => blocksOf(p).reduce((n, b) => n + b.sets * (b.type === 'single' ? 1 : b.items.length), 0);
    expect(total(r.plan) - total(ok(base))).toBeGreaterThanOrEqual(2);
  });
  it('arms: both biceps and triceps get theirs', () => {
    const r = generate({ ...base, focus: ['arms'] });
    expect(r.ok && r.applied.focus).toEqual([{ id: 'arms', sets: 4 }]);
  });
  it('whole body balance adds nothing and claims nothing', () => {
    const r = generate({ ...base, focus: ['balance'] });
    expect(r.ok && r.applied.focus).toEqual([]);
    expect(r.ok && r.applied.focusMissed).toEqual([]);
  });
  it('style: machines first, free weights first, bodyweight first among what fits', () => {
    const first = (style: 'machines' | 'free' | 'bodyweight') => ok({ ...base, style }).days[0]!.blocks.map((b) => (b.type === 'single' ? b.id : b.items[0]!.id));
    expect(first('machines')).toContain('Smith_Machine_Squat');
    expect(first('free')).toContain('barbell-back-squat');
    expect(first('bodyweight')).toContain('Bodyweight_Squat');
  });
  it('focus muscles go earlier in the day, never before the big lifts (SPEC 22 rule 2)', () => {
    const plan = ok({ ...base, focus: ['arms'] });
    for (const d of plan.days) {
      const profiles = d.blocks.flatMap((b) => (b.type === 'single' ? [b] : b.items)).map((i) => profileFor(i.id));
      const firstArm = profiles.findIndex((p) => p.pattern === 'biceps' || p.pattern === 'triceps');
      if (firstArm === -1) continue;
      expect(profiles.slice(firstArm).some((p) => p.tier === 0 && p.role === 'lift')).toBe(false);
    }
  });
});

describe('the time picked (SPEC 7.4)', () => {
  it.each(MINUTES.filter((m) => m < 75))('%i min: every day fits, or is trimmed down to its floor', (minutes) => {
    for (const days of DAYS) {
      for (const goal of ['muscle', 'strength', 'fat_loss'] as const) {
        const r = generate({ goals: [goal], experience: '3y', days, minutes, gym: FULL });
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        const plan = definitionPlan({ ...r.plan, id: `mine-${days}-${minutes}` })!;
        plan.days.forEach((d, i) => {
          const m = estimateDayMinutes(d);
          expect(m).toBe(r.applied.minutes[i]);
          if (m <= minutes) return;
          // Over: the trim went as far as SPEC 7.4 allows: 3 moves, or only protected lifts and 2 set accessories left.
          const items = d.blocks.flatMap((b) => b.items);
          const accessories = d.blocks.filter((b) => b.items.every((it) => !isCompound(profileFor(it.exerciseId))));
          expect(items.length <= 3 || accessories.length === 0, `${goal} ${days}d ${minutes}min day ${i + 1}: ${m} min`).toBe(true);
          for (const b of accessories) expect(b.sets).toBeLessThanOrEqual(2);
          expect(r.applied.over).toBe(true);
        });
      }
    }
  });
  it('75+ is open ended: no trim, more moves', () => {
    const long = ok({ goals: ['muscle'], experience: '3y', days: 3, minutes: 75, gym: FULL });
    const short = ok({ goals: ['muscle'], experience: '3y', days: 3, minutes: 30, gym: FULL });
    expect(itemsOf(long).length).toBeGreaterThan(itemsOf(short).length);
  });
  it('never drops the first two compound lifts of a day: even 20 min keeps two big lifts', () => {
    for (const days of DAYS) {
      for (const d of ok({ goals: ['muscle'], experience: '3y', days, minutes: 20, gym: FULL }).days) {
        const compounds = d.blocks.flatMap((b) => (b.type === 'single' ? [b] : b.items)).filter((it) => isCompound(profileFor(it.id)));
        expect(compounds.length, `${days}d ${d.name}`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('order and pairs come from order.ts (SPEC 22)', () => {
  it('every day is in orderUnits order, pairs are safe and never hold the heaviest lift', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const input = randomInput(seed);
      const r = generate(input);
      if (!r.ok) continue;
      for (const d of r.plan.days) {
        const units = d.blocks.map((b) => ({ items: (b.type === 'single' ? [b] : b.items).map((i) => profileFor(i.id)), ref: b }));
        const all = units.flatMap((u) => u.items);
        const heaviest = heaviestOf(all);
        for (const b of d.blocks) {
          if (b.type !== 'superset') continue;
          const [a, c] = b.items.map((i) => profileFor(i.id)) as [Profile, Profile];
          expect(canPair(a, c, new Set(heaviest ? [heaviest.id] : [])), `${a.id} + ${c.id}`).toBe(true);
        }
        // Rule 3 holds: no isolation of a helper before a compound that needs it.
        all.forEach((p, i) => {
          if (isCompound(p) || p.role !== 'lift') return;
          for (const later of all.slice(i + 1)) if (isCompound(later)) expect(later.helpers.some((h) => p.targets.includes(h)), `seed ${seed}: ${p.id} before ${later.id}`).toBe(false);
        });
        // Rule 1: the big compounds first while fresh.
        const lastBig = all.map((p) => p.role === 'lift' && p.tier === 0).lastIndexOf(true);
        const firstSmall = all.findIndex((p) => p.role === 'lift' && p.tier >= 2);
        if (lastBig !== -1 && firstSmall !== -1) expect(lastBig, `seed ${seed} ${d.name}`).toBeLessThan(firstSmall);
      }
    }
  });
});

describe('properties over random intakes and gyms (seeded)', () => {
  const runs = Array.from({ length: 300 }, (_, i) => i + 1);
  it('every exercise is a catalog ladder candidate the gym surely has; no never, no easy-on lift; normalizes', () => {
    let built = 0;
    for (const seed of runs) {
      const input = randomInput(seed);
      const r = generate(input);
      if (!r.ok) {
        expect(r.reason).toMatch(/^Not enough moves fit your equipment for .+: \d of 3\.$/);
        expect(r.moves).toBeLessThan(3);
        continue;
      }
      built++;
      const plan = definitionPlan(r.plan);
      expect(plan, `seed ${seed}`).toBeDefined();
      const never = new Set((input.never ?? []).map(SWAP_DATA.sameAs));
      for (const d of r.plan.days) {
        const items = d.blocks.flatMap((b) => (b.type === 'single' ? [b] : b.items));
        expect(items.length, `seed ${seed} ${d.name}`).toBeGreaterThanOrEqual(3);
        expect(new Set(items.map((i) => SWAP_DATA.sameAs(i.id))).size).toBe(items.length);
        for (const it of items) {
          const c = CANDIDATE.get(it.id);
          expect(c, `${it.id} is a ladder candidate`).toBeDefined();
          expect(CATALOG.has(c!.id), `${c!.id} in the catalog`).toBe(true);
          expect(supports(c!.requires, input.gym), `seed ${seed}: ${it.id} doable here`).toBe(true);
          expect(never.has(SWAP_DATA.sameAs(it.id))).toBe(false);
          expect(easyOnAvoids(input.easyOn, profileFor(it.id))).toBe(false);
          if (profileFor(it.id).advanced) expect(input.experience).toBe('3y');
          expect(it.exercise).toBe(GENERATOR_DEPS.name(it.id));
        }
        if (d.finisher) expect(supports(d.finisher.requires, input.gym)).toBe(true);
      }
    }
    expect(built).toBeGreaterThan(100);
  });
  it('deterministic: the same inputs give the same plan and id, other inputs another id', () => {
    for (const seed of runs.slice(0, 60)) {
      const a = generate(randomInput(seed));
      const b = generate(randomInput(seed));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
    const one = ok({ goals: ['muscle'], days: 3, gym: FULL });
    const two = ok({ goals: ['muscle'], days: 4, gym: FULL });
    expect(one.id).toMatch(/^mine-[0-9a-z]+$/);
    expect(one.id).not.toBe(two.id);
    expect(hashText('abc')).toBe(hashText('abc'));
  });
  it('never padding: a gym that cannot fill a day says so', () => {
    const r = generate({ goals: ['muscle'], days: 5, gym: NOTHING });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.dayName).toBe('Upper');
    expect(r.reason).toBe('Not enough moves fit your equipment for Upper: 1 of 3.');
    // Three full body days with just your body work, and say what is missing.
    const body = generate({ goals: ['muscle'], days: 3, gym: NOTHING });
    expect(body.ok).toBe(true);
    expect(body.ok && body.applied.gaps).toContain('horizontal pull');
  });
  it('the generator is pure: it never reads beyond its inputs', () => {
    const input: GeneratorInput = { goals: ['muscle'], days: 3, gym: HOTEL };
    expect(JSON.stringify(generatePlan(input, GENERATOR_DEPS))).toBe(JSON.stringify(generate(input)));
  });
});
