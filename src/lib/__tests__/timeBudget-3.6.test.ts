// PLAN 3.6, SPEC 7.4: the time budget trim. The SPEC order (stretches → accessory sets to 2 → the
// last accessories → never the first two compounds), the change list words, the trimmed session
// order, and properties over random days built from the shipped plans (fast-check is not installed,
// so a seeded generator): never over the budget when a fit exists, nothing ever added, order kept,
// pairs whole, deterministic.
import { describe, expect, it } from 'vitest';
import { PLANS, planById } from '../../data/plans';
import { profileFor } from '../../data/order';
import { isCompound } from '../order';
import { estimateDayMinutes, itemTarget, type PlanBlock, type PlanDay } from '../plans';
import { dayWorkout } from '../planWorkout';
import { AS_PLANNED, applyTrim, changeWords, fitWords, idsForTrim, trimDay, trimmedPlan, type TrimInput } from '../timeBudget';

const profileOf: TrimInput['profileOf'] = (id, name) => profileFor(id, name);
const split = planById('five-day-split')!;
const sixWeek = planById('six-week-volume')!;
const hotel = planById('hotel-gym-3-day')!;
const day = (n: number) => split.days.find((d) => d.n === n)!;
const ids = (d: PlanDay) => d.blocks.flatMap((b) => b.items.map((it) => it.exerciseId));
const trim = (d: PlanDay, budget: number, extra: Partial<TrimInput> = {}) => trimDay(d, { budget, profileOf, ...extra });

const single = (id: string, sets: number, restSec = 60, extra: Partial<PlanBlock> = {}): PlanBlock => ({ kind: 'single', items: [{ exerciseId: id, name: profileFor(id).name, reps: [8, 12] }], sets, restSec, ...extra });

describe('SPEC 7.4 trim order', () => {
  it('75+ and a day that already fits change nothing', () => {
    const d = day(1);
    for (const b of [AS_PLANNED, 90, estimateDayMinutes(d)]) {
      const r = trim(d, b);
      expect(r.trim).toBeNull();
      expect(r.day).toBe(d);
      expect(r.changes).toEqual([]);
      expect(r.fits).toBe(true);
    }
  });

  it('step 1: the stretches become one mobility block first (Legs, hamstring focus)', () => {
    // The leg day's opening (four stretches, the squat, the leg press), short enough that the merge alone fits.
    const d: PlanDay = { ...day(1), blocks: day(1).blocks.slice(0, 6) };
    const r = trim(d, estimateDayMinutes(d) - 2);
    expect(r.trim?.mobility).toEqual(['static-quadricep-stretch', 'static-proximal-hamstring-stretch', 'static-pigeon-stretch']);
    // Only the merge was needed: no sets or exercises touched.
    expect(r.trim?.drop).toEqual([]);
    expect(r.trim?.sets).toEqual({});
    expect(r.minutes).toBeLessThanOrEqual(estimateDayMinutes(d) - 2);
    const block = r.day.blocks[0]!;
    expect(block.mobility).toBe(true);
    expect(block.items.map((i) => i.exerciseId)).toEqual(r.trim!.mobility);
    expect(block.restSec).toBe(0);
    // The dynamic warm up is not a stretch to merge (SPEC 22: keep a short dynamic warm up).
    expect(r.day.blocks[1]!.items[0]!.exerciseId).toBe('dynamic-hip-flexor-stretch');
    expect(changeWords(r.changes)).toEqual(['Stretches in one quick block: Static Quadricep Stretch, Static Proximal Hamstring Stretch, Static Pigeon Stretch']);
  });

  it('step 2: accessory sets go to 2, last in the day first, before anything is cut', () => {
    const d = day(3); // Back and biceps, 78 min
    const r = trim(d, 70);
    expect(r.fits).toBe(true);
    expect(r.trim!.drop).toEqual([]);
    const cut = Object.keys(r.trim!.sets);
    expect(cut.length).toBeGreaterThan(0);
    expect(Object.values(r.trim!.sets).every((n) => n === 2)).toBe(true);
    // Last in the day first: the cut ones are the tail of the day's accessories.
    expect(cut).toContain('wrist-twist');
    for (const id of cut) expect(isCompound(profileFor(id))).toBe(false);
    expect(changeWords(r.changes)[0]).toMatch(/^Fewer sets: .*Wrist Twist · 3 → 2$/);
  });

  it('step 3: then the last accessories go, last in the day first; "Cut: …" names them', () => {
    const d = day(3);
    const r = trim(d, 45);
    expect(r.fits).toBe(true);
    expect(r.minutes).toBeLessThanOrEqual(45);
    expect(r.trim!.drop).toEqual(['barbell-bicep-curl', 'cable-single-arm-bicep-curl', 'dumbbell-single-arm-preacher-curl', 'forearm-finger-roll', 'wrist-twist']);
    expect(changeWords(r.changes)).toEqual([
      'Fewer sets: Hyperextension Roman Chair Back Extension · 3 → 2',
      'Cut: Barbell Bicep Curl, Cable Single Arm Bicep Curl, Dumbbell Single Arm Preacher Curl, Forearm Finger Roll, Wrist Twist',
    ]);
    expect(fitWords(r)).toBe(`Fits in ~${r.minutes} min`);
  });

  it('never drops the first two compound lifts, even when the day cannot fit', () => {
    for (const p of PLANS) {
      for (const d of p.days) {
        const r = trim(d, 20);
        const firstTwo = d.blocks.filter((b) => !b.warmup && b.items.some((it) => isCompound(profileFor(it.exerciseId)))).slice(0, 2);
        for (const b of firstTwo) for (const it of b.items) expect(r.trim?.drop ?? []).not.toContain(it.exerciseId);
      }
    }
  });

  it('a day that cannot fit says the shortest it goes, honestly', () => {
    const d = day(2); // Chest and triceps: its first two compounds alone are over 30 min
    const r = trim(d, 30);
    expect(r.fits).toBe(false);
    expect(r.minutes).toBeGreaterThan(30);
    expect(r.minutes).toBeLessThan(r.before);
    expect(fitWords(r)).toBe(`Shortest it goes: ~${r.minutes} min`);
  });

  it('a pair goes whole and keeps one set count', () => {
    const d: PlanDay = {
      n: 1,
      name: 'Test',
      blocks: [
        single('barbell-back-squat', 4, 150),
        single('barbell-bench-press', 4, 150),
        { kind: 'pair', items: [{ exerciseId: 'barbell-bicep-curl', name: 'Barbell Bicep Curl', reps: 10 }, { exerciseId: 'cable-rope-tricep-extension', name: 'Cable Rope Tricep Extension', reps: 10 }], sets: 4, restSec: 60 },
        single('machine-seated-leg-extension', 3),
        single('machine-lying-leg-curl', 3),
      ],
    };
    for (let b = 20; b < estimateDayMinutes(d); b += 1) {
      const r = trim(d, b);
      const pair = ['barbell-bicep-curl', 'cable-rope-tricep-extension'];
      const dropped = pair.filter((id) => r.trim?.drop.includes(id));
      expect(dropped.length === 0 || dropped.length === 2).toBe(true);
      const sets = pair.map((id) => r.trim?.sets[id]);
      expect(sets[0]).toBe(sets[1]);
    }
  });

  it('never drops an exercise with sets logged, never sets one below its logged sets', () => {
    const d = day(3);
    const r = trim(d, 20, { logged: { 'wrist-twist': 3, 'barbell-bicep-curl': 1 } });
    expect(r.trim!.drop).not.toContain('wrist-twist');
    expect(r.trim!.drop).not.toContain('barbell-bicep-curl');
    expect(r.trim!.sets['wrist-twist']).toBeUndefined();
    expect(r.trim!.sets['barbell-bicep-curl'] ?? 3).toBeGreaterThanOrEqual(1);
  });

  it('weekly tables: the week row is the one trimmed, the other days untouched', () => {
    const i = sixWeek.days.findIndex((d) => estimateDayMinutes(d, 2) > 60);
    const d = sixWeek.days[i]!;
    const r = trim(d, 60, { weekIndex: 2 });
    expect(r.minutes).toBeLessThanOrEqual(60);
    expect(estimateDayMinutes(applyTrim(d, r.trim, 2), 2)).toBe(r.minutes);
    const plan = trimmedPlan(sixWeek, i, r.trim, 2);
    plan.days.forEach((x, j) => (j === i ? expect(x).not.toBe(sixWeek.days[j]) : expect(x).toBe(sixWeek.days[j])));
    // The plan itself is never changed.
    expect(estimateDayMinutes(sixWeek.days[i]!, 2)).toBe(r.before);
    // dayWorkout reads the trimmed sets.
    const entries = dayWorkout(plan, i, 2);
    for (const [id, n] of Object.entries(r.trim!.sets)) expect(entries.find((e) => e.exerciseId === id)?.sets).toBe(n);
  });
});

describe('the session order after a trim (idsForTrim)', () => {
  const plan = ['a', 'b', 'c', 'd', 'e'];
  it('drops leave, an Undo puts them back at their plan place; rows added by hand stay', () => {
    const now = ['a', 'b', 'c', 'd', 'e', 'x'];
    const cut = idsForTrim(now, plan, null, { drop: ['c', 'e'], sets: {} });
    expect(cut).toEqual(['a', 'b', 'd', 'x']);
    expect(idsForTrim(cut, plan, { drop: ['c', 'e'], sets: {} }, null)).toEqual(['a', 'b', 'c', 'd', 'e', 'x']);
  });
  it('a swapped slot leaves and comes back under the exercise doing it', () => {
    const slotOf = (id: string) => (id === 'c2' ? 'c' : id);
    const currentOf = (s: string) => (s === 'c' ? 'c2' : s);
    const cut = idsForTrim(['a', 'b', 'c2', 'd'], ['a', 'b', 'c', 'd'], null, { drop: ['c'], sets: {} }, slotOf, currentOf);
    expect(cut).toEqual(['a', 'b', 'd']);
    expect(idsForTrim(cut, ['a', 'b', 'c', 'd'], { drop: ['c'], sets: {} }, null, slotOf, currentOf)).toEqual(['a', 'b', 'c2', 'd']);
  });
  it('a mobility block moves its stretches together to the first one', () => {
    const plan5 = ['s1', 'w', 's2', 's3', 'lift'];
    const t = { drop: [], sets: {}, mobility: ['s1', 's2', 's3'] };
    const merged = idsForTrim(plan5, plan5, null, t);
    expect(merged).toEqual(['s1', 's2', 's3', 'w', 'lift']);
    // Applying the same trim again moves nothing; back to the plan puts every stretch back.
    expect(idsForTrim(merged, plan5, t, t)).toEqual(merged);
    expect(idsForTrim(merged, plan5, t, null)).toEqual(plan5);
    expect(idsForTrim(merged, plan5, t, { drop: ['lift'], sets: {} })).toEqual(['s1', 'w', 's2', 's3']);
  });
  it('matches the trimmed day on G’s leg day', () => {
    const d = day(1);
    const r = trim(d, 45);
    const out = idsForTrim(ids(d), ids(d), null, r.trim);
    expect(out).toEqual(ids(r.day));
  });
});

// ---------------------------------------------------------------- properties

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random day: a shuffle of real blocks from the shipped plans, in order.ts-like order (as given). */
function randomDay(r: () => number): PlanDay {
  const pool = [...split.days, ...hotel.days, ...planById('beginner-full-body-3-day')!.days].flatMap((d) => d.blocks);
  const n = 3 + Math.floor(r() * 12);
  const blocks: PlanBlock[] = [];
  const seen = new Set<string>();
  while (blocks.length < n) {
    const b = pool[Math.floor(r() * pool.length)]!;
    if (b.items.some((i) => seen.has(i.exerciseId))) continue;
    b.items.forEach((i) => seen.add(i.exerciseId));
    blocks.push({ ...b, ...(r() < 0.3 && !b.items.some((i) => i.weeks) ? { sets: 2 + Math.floor(r() * 4) } : {}) });
  }
  return { n: 1, name: 'Random', blocks };
}

describe('properties (400 random days × every budget)', () => {
  const r = rng(36);
  const days = Array.from({ length: 400 }, () => randomDay(r));

  it('never over the budget when the rules can fit it; never adds anything; keeps the order; deterministic', () => {
    for (const d of days) {
      const plan = ids(d);
      for (const budget of [20, 30, 45, 60]) {
        const a = trim(d, budget);
        const b = trim(d, budget);
        expect(b).toEqual(a);
        if (a.fits) expect(a.minutes).toBeLessThanOrEqual(budget);
        else expect(a.minutes).toBeGreaterThan(budget);
        expect(a.minutes).toBeLessThanOrEqual(a.before);
        expect(estimateDayMinutes(a.day)).toBe(a.minutes);
        const out = ids(a.day);
        // Nothing added, every id from the plan, in plan order (a mobility block keeps its stretches' order).
        expect(out.every((id) => plan.includes(id))).toBe(true);
        expect(new Set(out).size).toBe(out.length);
        const nonMobility = a.day.blocks.filter((x) => !x.mobility).flatMap((x) => x.items.map((i) => i.exerciseId));
        expect(nonMobility).toEqual([...nonMobility].sort((x, y) => plan.indexOf(x) - plan.indexOf(y)));
        // Sets never go up; accessories never below 2 unless the plan had fewer.
        for (const blk of a.day.blocks) {
          const orig = d.blocks.find((o) => o.items.some((i) => i.exerciseId === blk.items[0]!.exerciseId))!;
          if (blk.mobility) continue;
          const now = Math.max(...blk.items.map((i) => itemTarget(blk, i).sets));
          const was = Math.max(...orig.items.map((i) => itemTarget(orig, i).sets));
          expect(now).toBeLessThanOrEqual(was);
          if (now < was) expect(now).toBe(2);
        }
        // Pairs whole: a kept pair keeps all its items.
        for (const o of d.blocks.filter((x) => x.kind === 'pair')) {
          const kept = o.items.filter((i) => out.includes(i.exerciseId)).length;
          expect(kept === 0 || kept === o.items.length).toBe(true);
        }
      }
    }
  });

  it('when the full SPEC trim fits under a bigger budget, that budget is always met', () => {
    for (const d of days) {
      const floor = trim(d, 1).minutes; // as far as the rules go
      for (const budget of [20, 30, 45, 60]) if (budget >= floor) expect(trim(d, budget).fits).toBe(true);
    }
  });
});
