// PLAN 3.4a, SPEC 22: the ordering rules and Up next. The 30+ day scenario table lives in
// fixtures/order-scenarios.ts (each one reasoned, then frozen); the properties run over seeded
// random days built from every exercise the app knows (fast-check is not installed, so the
// generators are hand written and deterministic).
import { describe, expect, it } from 'vitest';
import { PLAN_EXERCISES } from '../../data/planExercises';
import { PROFILE_OVERRIDES, profileFor, upNextPool } from '../../data/order';
import { SWAP_DATA } from '../../data/patterns';
import { EQUIPMENT_IDS, type EquipmentId } from '../../db/types';
import {
  canPair,
  heaviestOf,
  SQUAT_HINGE_PRESS,
  isCompound,
  liftWord,
  orderUnits,
  profileOf,
  restFor,
  sameMusclePair,
  upNextIdeas,
  type Profile,
  type Unit,
} from '../order';
import { PATTERNS, requiresOf, supports, workoutIdOf } from '../swap';
import type { GymKit } from '../picker';
import { BODYWEIGHT, FULL_GYM, HOTEL_DUMBBELLS, SCENARIOS, type ScenarioUnit } from './fixtures/order-scenarios';

const unitOf = (u: ScenarioUnit): Unit<ScenarioUnit> => ({ items: (Array.isArray(u) ? u : [u]).map((id) => profileFor(id)), ref: u });

describe('SPEC 22 day scenarios', () => {
  it('has at least 30 scenarios covering the SPEC 22 kinds of day', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(30);
    const names = SCENARIOS.map((s) => s.name).join(' | ');
    for (const kind of ['push day', 'pull day', 'legs', 'full body', 'hotel gym', 'bodyweight only', 'strength goal', 'fat loss', 'lower back go easy']) expect(names).toContain(kind);
  });

  for (const s of SCENARIOS) {
    it(`${s.name}: order and Up next`, () => {
      const out = orderUnits(s.day.map(unitOf), { focus: s.focus ?? [] }).map((u) => u.ref);
      expect(out).toEqual(s.order);
      const done = (s.done ?? [s.order[0]!].flat()).flatMap((id) => profileFor(id));
      const ideas = upNextIdeas(done, upNextPool(s.gym), { sameAs: SWAP_DATA.sameAs, goal: s.goal, focus: s.focus, easyOn: s.easyOn, recent: s.recent });
      expect(ideas[0]?.profile.id).toBe(s.upNext);
      // Every idea is doable at that gym, never one already done, and says why in one line.
      for (const i of ideas) {
        const needs = requiresOf(SWAP_DATA, i.profile.id);
        expect(needs, i.profile.id).not.toBeNull();
        expect(supports(needs!, s.gym), i.profile.id).toBe(true);
        expect(done.map((d) => SWAP_DATA.sameAs(d.id))).not.toContain(SWAP_DATA.sameAs(i.profile.id));
        expect(i.reason).toMatch(/^[A-Z][^\n]{4,70}$/);
      }
    });
  }
});

// ---------------------------------------------------------------- generators

/** A small seeded PRNG (mulberry32): the same seed, the same run. */
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

const ALL_IDS = [...new Set([...PLAN_EXERCISES.map((e) => e.id), ...PATTERNS.flatMap((p) => SWAP_DATA.patterns[p].candidates.map(workoutIdOf))])];
const ALL = ALL_IDS.map((id) => profileFor(id));
const LIFTS = ALL.filter((p) => p.role === 'lift');

function randomDay(r: () => number): Unit<string>[] {
  const n = 2 + Math.floor(r() * 9);
  const picked = new Set<number>();
  while (picked.size < n) picked.add(Math.floor(r() * ALL.length));
  const items = [...picked].map((i) => ALL[i]!);
  const units: Unit<string>[] = [];
  for (let i = 0; i < items.length; i++) {
    // Now and then a pair of two lifts that can be paired (rule 5).
    const a = items[i]!;
    const b = items[i + 1];
    if (b && r() < 0.2 && canPair(a, b)) {
      units.push({ items: [a, b], ref: `${a.id}+${b.id}` });
      i++;
    } else units.push({ items: [a], ref: a.id });
  }
  return units;
}

function randomGym(r: () => number): GymKit {
  const equipment = EQUIPMENT_IDS.filter(() => r() < 0.5) as EquipmentId[];
  return { equipment, dumbbellRange: equipment.includes('dumbbells') ? { min: 5, max: 50, step: 5 } : null };
}

const RUNS = 400;
const tierOf = (u: Unit) => Math.min(...u.items.map((p) => (p.role === 'lift' ? p.tier : p.role === 'stretch' ? 4 : p.role === 'cardio' ? 5 : -1)));

describe('orderUnits properties (seeded random days)', () => {
  it('keeps every unit exactly once, and every pair whole', () => {
    const r = rng(1);
    for (let k = 0; k < RUNS; k++) {
      const day = randomDay(r);
      const out = orderUnits(day);
      expect(out).toHaveLength(day.length);
      expect(new Set(out)).toEqual(new Set(day));
      for (const u of out) expect(day.find((d) => d.ref === u.ref)!.items).toBe(u.items);
    }
  });

  it('compounds before isolation, isolation before calves and abs, stretches and cardio last (rule 1): the rank never goes down', () => {
    const r = rng(2);
    for (let k = 0; k < RUNS; k++) {
      const tiers = orderUnits(randomDay(r)).map(tierOf);
      for (let i = 1; i < tiers.length; i++) expect(tiers[i]!, tiers.join(',')).toBeGreaterThanOrEqual(tiers[i - 1]!);
    }
  });

  it('big lifts first by fatigue: within the big compounds, a heavier one never follows a lighter one of the same pattern', () => {
    const r = rng(3);
    for (let k = 0; k < RUNS; k++) {
      const out = orderUnits(randomDay(r)).filter((u) => u.items.length === 1 && u.items[0]!.role === 'lift' && u.items[0]!.tier === 0);
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          const a = out[i]!.items[0]!;
          const b = out[j]!.items[0]!;
          if (a.pattern === b.pattern) expect(a.load).toBeGreaterThanOrEqual(b.load);
        }
      }
    }
  });

  it('never pre-tires a helper: no isolation of a muscle a later compound leans on (rule 3)', () => {
    const r = rng(4);
    for (let k = 0; k < RUNS; k++) {
      const out = orderUnits(randomDay(r), r() < 0.5 ? { focus: [LIFTS[Math.floor(r() * LIFTS.length)]!.targets[0] ?? 'abs'] } : {});
      out.forEach((u, i) => {
        if (tierOf(u) < 2) return;
        const targets = u.items.flatMap((p) => p.targets);
        for (const later of out.slice(i + 1)) {
          for (const p of later.items) if (isCompound(p)) expect(p.helpers.some((h) => targets.includes(h)), `${u.ref} before ${p.id}`).toBe(false);
        }
      });
    }
  });

  it('same pattern never back to back when another of the same rank could go between', () => {
    const r = rng(5);
    for (let k = 0; k < RUNS; k++) {
      const out = orderUnits(randomDay(r));
      for (let i = 1; i < out.length; i++) {
        const prev = new Set(out[i - 1]!.items.map((p) => p.pattern).filter(Boolean));
        const cur = out[i]!.items.map((p) => p.pattern).filter(Boolean);
        if (!cur.some((p) => prev.has(p))) continue;
        // Back to back: then nothing later of the same rank had another pattern.
        const rank = tierOf(out[i]!);
        const rest = out.slice(i + 1).filter((u) => tierOf(u) === rank);
        expect(rest.every((u) => u.items.some((p) => p.pattern && prev.has(p.pattern))), out.map((u) => u.ref).join(', ')).toBe(true);
      }
    }
  });

  it('honest ties stay stable: equal units keep the order they came in', () => {
    const twin = (id: string, name: string): Profile => ({ ...profileOf({ id, name, pattern: 'biceps', implement: 'dumbbell' }) });
    const a = twin('a', 'Curl A');
    const b = twin('b', 'Curl B');
    const c = twin('c', 'Curl C');
    const day = [a, b, c].map((p) => ({ items: [p], ref: p.id }));
    expect(orderUnits(day).map((u) => u.ref)).toEqual(['a', 'b', 'c']);
    expect(orderUnits([...day].reverse()).map((u) => u.ref)).toEqual(['c', 'b', 'a']);
    // Ordering an ordered day changes nothing.
    const r = rng(6);
    for (let k = 0; k < RUNS; k++) {
      const once = orderUnits(randomDay(r));
      expect(orderUnits(once)).toEqual(once);
    }
  });
});

describe('pairs (rule 5)', () => {
  it('never pairs two exercises on the same muscle, one that leans on the other, or the heaviest lift', () => {
    const r = rng(7);
    for (let k = 0; k < RUNS * 4; k++) {
      const a = LIFTS[Math.floor(r() * LIFTS.length)]!;
      const b = LIFTS[Math.floor(r() * LIFTS.length)]!;
      if (!canPair(a, b)) continue;
      expect(a.targets.some((m) => b.targets.includes(m))).toBe(false);
      expect(sameMusclePair([a, b])).toBeNull();
      expect(canPair(a, b, new Set([a.id]))).toBe(false);
    }
    expect(canPair(profileFor('dumbbell-bench-press'), profileFor('single-arm-dumbbell-row'))).toBe(true);
    expect(canPair(profileFor('barbell-incline-bench-press'), profileFor('incline-plate-press'))).toBe(false);
    expect(sameMusclePair([profileFor('barbell-incline-bench-press'), profileFor('incline-plate-press')])).toBe('chest');
    expect(canPair(profileFor('machine-seated-leg-extension'), profileFor('machine-seated-calf-raise'))).toBe(true);
    expect(canPair(profileFor('barbell-bicep-curl'), profileFor('cable-tricep-pushdown'))).toBe(true);
    // Triceps lean on nothing, but bench leans on triceps: never paired.
    expect(canPair(profileFor('Barbell_Bench_Press_-_Medium_Grip'), profileFor('cable-tricep-pushdown'))).toBe(false);
    expect(canPair(profileFor('static-pigeon-stretch'), profileFor('crunch'))).toBe(false);
  });

  it('the heaviest lift of a day is its biggest compound; the rest check narrows it to squats, hinges and presses', () => {
    expect(heaviestOf(['barbell-back-squat', 'angled-machine-leg-press', 'barbell-straight-leg-romanian-deadlift'].map((id) => profileFor(id)))?.id).toBe('barbell-back-squat');
    expect(heaviestOf(['dumbbell-bench-press', 'barbell-incline-bench-press'].map((id) => profileFor(id)))?.id).toBe('barbell-incline-bench-press');
    expect(heaviestOf(['wide-grip-pull-up', 'barbell-bent-over-row', 'barbell-bicep-curl'].map((id) => profileFor(id)), SQUAT_HINGE_PRESS)).toBeUndefined();
  });
});

describe('rest (rule 6)', () => {
  it('heavy compounds 2 to 3 min (3 for strength), other compounds 2, isolation 60 to 90 s', () => {
    expect(restFor(profileFor('barbell-back-squat'))).toBe(150);
    expect(restFor(profileFor('barbell-back-squat'), 'strength')).toBe(180);
    expect(restFor(profileFor('lat-machine-wide-grip-pulldown'))).toBe(120);
    expect(restFor(profileFor('cable-tricep-pushdown'))).toBe(75);
    expect(restFor(profileFor('static-pigeon-stretch'))).toBe(0);
    for (const p of LIFTS) {
      const s = restFor(p);
      if (isCompound(p)) expect(s).toBeGreaterThanOrEqual(120);
      else expect(s).toBeLessThanOrEqual(90);
    }
  });
});

describe('Up next properties', () => {
  it('every suggestion exists in the active gym, is not done today, and the big one is the best', () => {
    const r = rng(8);
    for (let k = 0; k < RUNS; k++) {
      const gym = r() < 0.2 ? HOTEL_DUMBBELLS : r() < 0.2 ? BODYWEIGHT : randomGym(r);
      const pool = upNextPool(gym);
      for (const p of pool) expect(supports(requiresOf(SWAP_DATA, p.id)!, gym), p.id).toBe(true);
      const done = Array.from({ length: Math.floor(r() * 5) }, () => LIFTS[Math.floor(r() * LIFTS.length)]!);
      const ideas = upNextIdeas(done, pool, { sameAs: SWAP_DATA.sameAs });
      expect(ideas.length).toBeLessThanOrEqual(3);
      expect(ideas.length).toBe(Math.min(3, pool.filter((p) => !done.some((d) => SWAP_DATA.sameAs(d.id) === SWAP_DATA.sameAs(p.id))).length));
      const ids = ideas.map((i) => SWAP_DATA.sameAs(i.profile.id));
      expect(new Set(ids).size).toBe(ids.length);
      for (const i of ideas) {
        expect(done.map((d) => SWAP_DATA.sameAs(d.id))).not.toContain(SWAP_DATA.sameAs(i.profile.id));
        expect(i.profile.role).toBe('lift');
      }
      // Never the same pattern as the last lift when anything else fits.
      const last = done[done.length - 1];
      if (last?.pattern && ideas[0] && pool.some((p) => p.pattern !== last.pattern && !done.includes(p))) expect(ideas[0].profile.pattern).not.toBe(last.pattern);
    }
  });

  it('honest when fewer than 3 fit: only what the gym can do, even none', () => {
    const tiny: GymKit = { equipment: [], dumbbellRange: null };
    const pool = upNextPool(tiny);
    const everything = pool.map((p) => p);
    expect(upNextIdeas(everything, pool, { sameAs: SWAP_DATA.sameAs })).toEqual([]);
    expect(upNextIdeas(everything.slice(1), pool, { sameAs: SWAP_DATA.sameAs })).toHaveLength(1);
  });

  it('the three ideas are of different patterns when the gym allows', () => {
    const ideas = upNextIdeas([profileFor('Barbell_Bench_Press_-_Medium_Grip')], upNextPool(FULL_GYM), { sameAs: SWAP_DATA.sameAs });
    expect(new Set(ideas.map((i) => i.profile.pattern)).size).toBe(3);
  });

  it('after bench, after squat and at a dumbbell only hotel gym (the screenshot cases)', () => {
    const at = (gym: GymKit, ...ids: string[]) => upNextIdeas(ids.map((id) => profileFor(id)), upNextPool(gym), { sameAs: SWAP_DATA.sameAs });
    const bench = at(FULL_GYM, 'Barbell_Bench_Press_-_Medium_Grip');
    expect(bench[0]).toMatchObject({ profile: { id: 'barbell-bent-over-row' }, reason: 'Balances your push' });
    const squat = at(FULL_GYM, 'barbell-back-squat');
    expect(squat[0]).toMatchObject({ profile: { id: 'Barbell_Bench_Press_-_Medium_Grip' }, reason: 'Different pattern after squat' });
    const hotel = at(HOTEL_DUMBBELLS, 'dumbbell-bench-press');
    expect(hotel[0]).toMatchObject({ profile: { id: 'single-arm-dumbbell-row' }, reason: 'Balances your push' });
    for (const i of hotel) expect(supports(requiresOf(SWAP_DATA, i.profile.id)!, HOTEL_DUMBBELLS)).toBe(true);
  });

  it('after the big lifts, isolation that builds on them, with why (rule 4)', () => {
    const ideas = upNextIdeas(['Barbell_Bench_Press_-_Medium_Grip', 'barbell-bent-over-row', 'overhead-press'].map((id) => profileFor(id)), upNextPool(FULL_GYM), { sameAs: SWAP_DATA.sameAs });
    expect(ideas.every((i) => !isCompound(i.profile))).toBe(true);
    expect(ideas.map((i) => i.reason).join(' | ')).toMatch(/Finishes the .* your (rows|overhead press|bench) warmed up/);
  });

  it('avoids muscles trained in the last 48 hours and lifts a sore joint should skip', () => {
    const pool = upNextPool(FULL_GYM);
    const recent = upNextIdeas([profileFor('Barbell_Bench_Press_-_Medium_Grip')], pool, { sameAs: SWAP_DATA.sameAs, recent: ['back'] });
    expect(recent.some((i) => i.profile.targets.includes('back'))).toBe(false);
    const easy = upNextIdeas([profileFor('leg-press')], pool, { sameAs: SWAP_DATA.sameAs, easyOn: ['lower_back'] });
    expect(easy.some((i) => i.profile.pattern === 'hinge' || /bent|squat/i.test(i.profile.id))).toBe(false);
    const knees = upNextIdeas([profileFor('leg-press'), profileFor('Barbell_Bench_Press_-_Medium_Grip')], pool, { sameAs: SWAP_DATA.sameAs, easyOn: ['knees'] }, 20);
    expect(knees.some((i) => i.profile.pattern === 'lunge')).toBe(false);
  });

  it('a focus muscle is favored and says so', () => {
    const ideas = upNextIdeas([profileFor('barbell-back-squat')], upNextPool(FULL_GYM), { sameAs: SWAP_DATA.sameAs, focus: ['hamstrings'] });
    expect(ideas[0]!.reason).toBe('Your focus: hamstrings');
  });
});

describe('profiles', () => {
  it('every plan exercise and ladder candidate has a profile; only sure facts', () => {
    for (const p of ALL) {
      expect(p.tier).toBeGreaterThanOrEqual(-1);
      expect(p.tier).toBeLessThanOrEqual(5);
      // No pattern and no override: no muscle is claimed.
      if (!p.pattern && !PROFILE_OVERRIDES[p.id]) expect(p.targets, p.id).toEqual([]);
    }
    expect(profileFor('static-pigeon-stretch').role).toBe('stretch');
    expect(profileFor('dynamic-hip-flexor-stretch').role).toBe('dynamic');
    expect(profileFor('barbell-back-squat')).toMatchObject({ tier: 0, pattern: 'squat' });
    expect(profileFor('angled-machine-leg-press')).toMatchObject({ tier: 1, helpers: [] });
    expect(profileFor('hyperextension-roman-chair-back-extension')).toMatchObject({ tier: 2, targets: ['lower back'] });
    for (const id of Object.keys(PROFILE_OVERRIDES)) expect(ALL_IDS, id).toContain(id);
  });

  it('plain words for lifts in reasons', () => {
    expect(liftWord(profileFor('Barbell_Bench_Press_-_Medium_Grip'))).toBe('bench');
    expect(liftWord(profileFor('barbell-back-squat'))).toBe('squat');
    expect(liftWord(profileFor('leg-press'))).toBe('leg press');
    expect(liftWord(profileFor('deadlift'))).toBe('deadlift');
    expect(liftWord(profileFor('romanian-deadlift'))).toBe('hinge');
    expect(liftWord(profileFor('lat-machine-wide-grip-pulldown'))).toBe('pulldown');
    expect(liftWord(profileFor('wide-grip-pull-up'))).toBe('pull ups');
    expect(liftWord(profileFor('Pushups'))).toBe('push ups');
    expect(liftWord(profileFor('Machine_Bench_Press'))).toBe('bench');
    expect(liftWord(profileFor('Leverage_Chest_Press'))).toBe('chest press');
  });
});
