// PLAN 3.5a: Quick workout builds it for you. Concept generation over the committed data, the deck's
// swap and the learned soft dislikes.
import { describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS, type EquipmentId } from '../../db/types';
import { MUSCLE_MAP_REGIONS, QUICK_DEPS, workoutMuscles } from '../../data/quick';
import { PLANS } from '../../data/plans';
import { SWAP_DATA } from '../../data/patterns';
import { demoFor } from '../../data/exerciseInfo';
import { profileFor } from '../../data/order';
import type { GymKit } from '../picker';
import type { GeneratorInput } from '../generator';
import { mergeMuscleMaps } from '../muscles';
import { estimateDayMinutes } from '../plans';
import { applyTrim } from '../timeBudget';
import { patternOf } from '../swap';
import {
  buildConcepts,
  canBuild,
  fits,
  reasonsFor,
  QUICK_MINUTES,
  chipFor,
  conceptMinutes,
  dropSlot,
  honest,
  learnNever,
  learnSwap,
  nextSwap,
  planConcept,
  quickDayOf,
  rankSoft,
  recentMuscles,
  RECENT_MS,
  sureGear,
  swapItem,
  unlearnNever,
  withDislikes,
  wordList,
  type Concept,
  type QuickItem,
} from '../quick';

const FULL: GymKit = { equipment: [...EQUIPMENT_IDS], dumbbellRange: { min: 5, max: 100, step: 5 } };
const DUMBBELLS: GymKit = { equipment: ['dumbbells', 'adjustable_bench'] as EquipmentId[], dumbbellRange: { min: 5, max: 50, step: 5 } };
const NOTHING: GymKit = { equipment: [], dumbbellRange: null };

const base = (gym: GymKit, extra: Partial<GeneratorInput> = {}): GeneratorInput => ({ goals: ['muscle'], experience: '1_2y', gym, ...extra });

/** Every card doable here, with a sure demo, and its estimate the shared one. */
function expectHonest(concepts: Concept[], gym: GymKit) {
  for (const c of concepts) {
    expect(c.items.length).toBeGreaterThanOrEqual(3);
    for (const it of c.items) {
      expect(demoFor(it.id), `${c.title}: ${it.id} demo`).not.toBeNull();
      expect(sureGear(SWAP_DATA, it.id, gym), `${c.title}: ${it.id} gear`).toBe(true);
      expect(it.sets).toBeGreaterThan(0);
      expect(it.why.length).toBeGreaterThan(5);
    }
    expect(c.minutes).toBe(conceptMinutes(c));
    if (c.id !== 'plan' && c.id !== 'fresh') expect(honest(c.id, c.items.map((it) => it.pattern))).toBe(true);
    expect(new Set(c.items.map((it) => it.id)).size).toBe(c.items.length);
  }
}

describe('How long chips', () => {
  it('preselects the nearest chip to the intake minutes, a tie going up, 30 by default', () => {
    expect(chipFor(undefined)).toBe(30);
    expect(chipFor(20)).toBe(15);
    expect(chipFor(30)).toBe(30);
    expect(chipFor(45)).toBe(45);
    expect(chipFor(60)).toBe(60);
    expect(chipFor(75)).toBe(60);
    expect(chipFor(Number.NaN)).toBe(30);
  });
});

describe('concepts', () => {
  it('a full gym with no history: three honest concepts, Full body first', () => {
    const cs = buildConcepts({ base: base(FULL), minutes: 30, recent: [] }, QUICK_DEPS);
    expect(cs.map((c) => c.id)).toEqual(['full', 'upper', 'lower']);
    expect(cs[0]!.title).toBe('Full body pump');
    expectHonest(cs, FULL);
    // No fresh concept without logged sets: it would claim something it does not know.
    expect(cs.some((c) => c.id === 'fresh')).toBe(false);
  });

  it('a strength goal calls it Full body, not a pump', () => {
    const cs = buildConcepts({ base: base(FULL, { goals: ['strength'] }), minutes: 45, recent: [] }, QUICK_DEPS);
    expect(cs[0]!.title).toBe('Full body');
  });

  it("Hit what's fresh never trains a muscle trained in the last 3 days", () => {
    const recent = ['chest', 'triceps', 'quads'] as const;
    const cs = buildConcepts({ base: base(FULL), minutes: 45, recent: [...recent] }, QUICK_DEPS);
    expect(cs[0]!.id).toBe('fresh');
    expect(cs[0]!.title).toBe("Hit what's fresh");
    expect(cs[0]!.line).toBe('Skips chest and triceps (trained lately)');
    for (const it of cs[0]!.items) for (const m of profileFor(it.id).targets) expect(recent as readonly string[]).not.toContain(m);
    expect(cs).toHaveLength(3);
    expectHonest(cs, FULL);
  });

  it('the minutes trim the concepts the SPEC 7.4 way: longer time, at least as much work', () => {
    const at = (m: number) => buildConcepts({ base: base(FULL), minutes: m, recent: [] }, QUICK_DEPS)[0]!;
    const short = at(15);
    const long = at(60);
    expect(short.items.length).toBeLessThanOrEqual(long.items.length);
    expect(short.minutes).toBeLessThan(long.minutes);
    expect(long.minutes).toBeLessThanOrEqual(60);
  });

  it('a dumbbell only gym: only concepts whose name is true, every card doable with a sure demo', () => {
    const cs = buildConcepts({ base: base(DUMBBELLS), minutes: 30, recent: [] }, QUICK_DEPS);
    expect(cs.length).toBeGreaterThanOrEqual(2);
    // No sure demo of a dumbbell leg move: never "Full body" or "Legs" here.
    expect(cs.some((c) => c.id === 'full' || c.id === 'lower')).toBe(false);
    expectHonest(cs, DUMBBELLS);
  });

  it('fewer than 3 sure exercises fit: no concept at all (the honest empty state)', () => {
    expect(buildConcepts({ base: base(NOTHING), minutes: 30, recent: [] }, QUICK_DEPS)).toEqual([]);
  });

  it('the never list and go easy on are respected', () => {
    const first = buildConcepts({ base: base(FULL), minutes: 45, recent: [] }, QUICK_DEPS)[0]!;
    const out = first.items[0]!.id;
    const again = buildConcepts({ base: base(FULL, { never: [out] }), minutes: 45, recent: [] }, QUICK_DEPS);
    for (const c of again) expect(c.items.map((it) => SWAP_DATA.sameAs(it.id))).not.toContain(SWAP_DATA.sameAs(out));
  });
});

describe('learned soft dislikes', () => {
  it('a left swipe counts, a long press is never, undo takes the never back, history is not involved', () => {
    let d = learnSwap({}, 'barbell-back-squat');
    d = learnSwap(d, 'barbell-back-squat');
    expect(d.soft).toEqual({ 'barbell-back-squat': 2 });
    d = learnNever(d, 'leg-extension');
    d = learnNever(d, 'leg-extension');
    expect(d.never).toEqual(['leg-extension']);
    expect(unlearnNever(d, 'leg-extension').never).toEqual([]);
    expect(unlearnNever(d, 'leg-extension').soft).toEqual({ 'barbell-back-squat': 2 });
  });

  it('soft dislikes rank an exercise lower in the generator, never out', () => {
    const plain = buildConcepts({ base: base(FULL), minutes: 30, recent: [] }, QUICK_DEPS)[0]!;
    const squat = plain.items.find((it) => it.pattern === 'squat')!;
    const input = withDislikes(base(FULL), learnSwap({}, squat.id));
    expect(input.soft).toEqual({ [squat.id]: 1 });
    const after = buildConcepts({ base: input, minutes: 30, recent: [] }, QUICK_DEPS)[0]!;
    const squat2 = after.items.find((it) => it.pattern === 'squat')!;
    expect(squat2.id).not.toBe(squat.id);
    // Never a ban: with nothing else that fits, the disliked one still comes.
    const only: GymKit = { equipment: ['barbell_rack', 'flat_bench', 'adjustable_bench'], dumbbellRange: null };
    const disliked = withDislikes(base(only), { soft: { 'barbell-back-squat': 9, 'front-squat': 9 } });
    const c = buildConcepts({ base: disliked, minutes: 45, recent: [] }, QUICK_DEPS)[0]!;
    expect(c.items.some((it) => it.pattern === 'squat')).toBe(true);
  });

  it('never show merges into the generator never list', () => {
    const input = withDislikes(base(FULL, { never: ['deadlift'] }), { never: ['leg-extension'] });
    expect(input.never).toEqual(['deadlift', 'leg-extension']);
    const cs = buildConcepts({ base: input, minutes: 60, recent: [] }, QUICK_DEPS);
    for (const c of cs) expect(c.items.map((it) => it.id)).not.toContain('leg-extension');
  });

  it('rankSoft keeps the ladder order among equals', () => {
    expect(rankSoft(['a', 'b', 'c'], { a: 2, c: 1 })).toEqual(['b', 'c', 'a']);
    expect(rankSoft(['a', 'b'], undefined)).toEqual(['a', 'b']);
  });
});

describe('the deck swap', () => {
  const ok = (id: string) => demoFor(id) !== null;
  it('swaps for the same movement pattern, sure gear and demo, never one already in the workout, cycling through', () => {
    const c = buildConcepts({ base: base(FULL), minutes: 45, recent: [] }, QUICK_DEPS)[0]!;
    const squat = c.items.find((it) => it.pattern === 'squat')!;
    const ctx = { data: SWAP_DATA, gym: FULL, ok };
    const first = nextSwap(squat, c.items, [squat.id], ctx)!;
    expect(first).not.toBeNull();
    expect(patternOf(SWAP_DATA, first)).toBe('squat');
    expect(c.items.map((it) => it.id)).not.toContain(first);
    expect(demoFor(first)).not.toBeNull();
    const swapped = swapItem(squat, first, 'x', false);
    expect(swapped.sets).toBe(squat.sets);
    expect(swapped.restSec).toBe(squat.restSec);
    expect(swapped.reps).toEqual(squat.reps);
    const items = c.items.map((it) => (it === squat ? swapped : it));
    const second = nextSwap(swapped, items, [squat.id, first], ctx)!;
    expect(second).not.toBe(first);
    expect(patternOf(SWAP_DATA, second)).toBe('squat');
  });

  it('soft dislikes rank swap candidates last', () => {
    const c = buildConcepts({ base: base(FULL), minutes: 45, recent: [] }, QUICK_DEPS)[0]!;
    const squat = c.items.find((it) => it.pattern === 'squat')!;
    const first = nextSwap(squat, c.items, [squat.id], { data: SWAP_DATA, gym: FULL, ok })!;
    const later = nextSwap(squat, c.items, [squat.id], { data: SWAP_DATA, gym: FULL, ok, soft: { [first]: 3 } })!;
    expect(later).not.toBe(first);
  });

  it('nothing else fits: null, the card stays', () => {
    const item = { id: 'crunch', slot: 'crunch', origin: 'crunch', name: 'Crunch', pattern: 'core' as const, sets: 3, reps: [10, 15] as [number, number], restSec: 60, why: 'x' };
    const other = { ...item, id: 'dead-bug', slot: 'dead-bug', origin: 'dead-bug' };
    expect(nextSwap(item, [item, other], [item.id], { data: SWAP_DATA, gym: NOTHING, ok })).toBeNull();
  });
});

describe('the plan day concept', () => {
  const split = PLANS.find((p) => p.id === 'five-day-split') ?? PLANS[0]!;
  it('the plan day trimmed to the time, only sure demos and gear, the header estimate', () => {
    const c = planConcept({ plan: split, dayIndex: 0, weekIndex: 0, minutes: 30, gym: FULL }, QUICK_DEPS)!;
    expect(c).not.toBeNull();
    expect(c.title).toBe(`${split.days[0]!.name}, short`);
    expect(c.line).toBe(`From your ${split.name}`);
    expectHonest([c], FULL);
    expect(c.minutes).toBe(estimateDayMinutes(applyTrim(split.days[0]!, c.plan!.trim, 0), 0));
    // Every deck card is a plan slot that survived the trim.
    const kept = applyTrim(split.days[0]!, c.plan!.trim, 0).blocks.flatMap((b) => b.items.map((i) => i.exerciseId));
    for (const it of c.items) expect(kept).toContain(it.slot);
  });

  it('a long press with nothing to swap leaves the slot out of the day', () => {
    const c = planConcept({ plan: split, dayIndex: 0, weekIndex: 0, minutes: 60, gym: FULL }, QUICK_DEPS)!;
    const part = dropSlot(c.plan!, c.items[0]!.slot);
    expect(part.trim!.drop).toContain(c.items[0]!.slot);
    expect(conceptMinutes({ items: c.items, plan: part })).toBeLessThan(c.minutes);
  });

  it('comes first among the concepts', () => {
    const plan = planConcept({ plan: split, dayIndex: 1, weekIndex: 0, minutes: 45, gym: FULL }, QUICK_DEPS);
    const cs = buildConcepts({ base: base(FULL), minutes: 45, recent: [], plan }, QUICK_DEPS);
    expect(cs[0]!.id).toBe('plan');
    expect(cs).toHaveLength(3);
  });

  it('a gym where too little of the day fits: no plan concept', () => {
    expect(planConcept({ plan: split, dayIndex: 0, weekIndex: 0, minutes: 30, gym: NOTHING }, QUICK_DEPS)).toBeNull();
  });
});

describe('helpers', () => {
  it('recent muscles: logged working sets of the last 3 days only, never imported or warm ups', () => {
    const now = 10 * RECENT_MS;
    const sessions = [
      { id: 'a', startedAt: now - 1000, imported: false },
      { id: 'old', startedAt: now - RECENT_MS - 1, imported: false },
      { id: 'imp', startedAt: now - 1000, imported: true },
    ];
    const sets = [
      { sessionId: 'a', exerciseId: 'barbell-incline-bench-press', kind: 'work' },
      { sessionId: 'a', exerciseId: 'barbell-back-squat', kind: 'warmup' },
      { sessionId: 'old', exerciseId: 'deadlift', kind: 'work' },
      { sessionId: 'imp', exerciseId: 'barbell-bicep-curl', kind: 'work' },
    ];
    expect(recentMuscles(sessions, sets, (id) => profileFor(id).targets, now)).toEqual(['chest']);
  });

  it('a quick day estimates like any plan day', () => {
    const day = quickDayOf([{ id: 'x', name: 'X', sets: 3, reps: [8, 12], restSec: 90 }]);
    expect(estimateDayMinutes(day)).toBe(Math.round((3 * 40 + 3 * 90) / 60));
  });

  it('word lists read plainly', () => {
    expect(wordList(['chest'])).toBe('chest');
    expect(wordList(['chest', 'back'])).toBe('chest and back');
    expect(wordList(['a', 'b', 'c', 'd'])).toBe('a, b, c and more');
  });

  it('one muscle map per workout: sure maps only, primary wins', () => {
    const a = { primary: [{ muscle: 'chest', label: 'chest', regions: ['chest' as never] }], secondary: [], shading: { chest: 'primary' as const }, text: 'Chest' };
    const b = { primary: [{ muscle: 'triceps', label: 'triceps', regions: ['triceps' as never] }], secondary: [{ muscle: 'chest', label: 'chest', regions: ['chest' as never] }], shading: { triceps: 'primary' as const, chest: 'secondary' as const }, text: 'Triceps · Chest' };
    const m = mergeMuscleMaps([a, null, b])!;
    expect(m.shading).toEqual({ chest: 'primary', triceps: 'primary' });
    expect(m.text).toBe('Chest, triceps');
    expect(mergeMuscleMaps([null, undefined])).toBeNull();
  });
});

describe('round 2', () => {
  const ok = (id: string) => demoFor(id) !== null;
  it('B3: every concept offered fits the minutes picked (2 over at most), at every chip, full and dumbbell gyms', () => {
    for (const gym of [FULL, DUMBBELLS])
      for (const m of QUICK_MINUTES) {
        const cs = buildConcepts({ base: base(gym), minutes: m, recent: ['chest'] }, QUICK_DEPS);
        for (const c of cs) expect(fits(c.minutes, m), `${c.title} ${c.minutes} min under ${m}`).toBe(true);
        expectHonest(cs, gym);
      }
    // 15 minutes in a full gym still offers something real.
    expect(buildConcepts({ base: base(FULL), minutes: 15, recent: [] }, QUICK_DEPS).length).toBeGreaterThan(0);
  });

  it('B4: no muscle the Skips line names is lit on the fresh card map', () => {
    for (const recent of [['back'], ['chest', 'triceps'], ['quads', 'glutes'], ['back', 'biceps'], ['hamstrings']] as const) {
      const c = buildConcepts({ base: base(FULL), minutes: 45, recent: [...recent] }, QUICK_DEPS).find((x) => x.id === 'fresh');
      if (!c) continue;
      const lit = Object.keys(workoutMuscles(c.items.map((it) => it.id))?.shading ?? {});
      for (const m of recent) for (const r of MUSCLE_MAP_REGIONS[m]) expect(lit, `${recent.join('+')}: ${r}`).not.toContain(r);
    }
  });

  it('B5: nothing can be built with a pull up bar or bodyweight only; a full gym can', () => {
    expect(canBuild(base(NOTHING), QUICK_DEPS)).toBe(false);
    expect(canBuild(base({ equipment: ['pull_up_bar'], dumbbellRange: null }), QUICK_DEPS)).toBe(false);
    expect(canBuild(base(FULL), QUICK_DEPS)).toBe(true);
  });

  it('B6: the lying leg curl swaps for the seated one (photos checked), which has a demo', () => {
    const item = { id: 'machine-lying-leg-curl', slot: 'machine-lying-leg-curl', origin: 'machine-lying-leg-curl', name: 'Machine Lying Leg Curl', pattern: 'hamstrings isolation' as const, sets: 3, reps: [10, 15] as [number, number], restSec: 60, why: 'x' };
    expect(nextSwap(item, [item], [item.id], { data: SWAP_DATA, gym: FULL, ok })).toBe('Seated_Leg_Curl');
    expect(demoFor('Seated_Leg_Curl')).not.toBeNull();
  });

  it('P11: one real reason per card, never the title again', () => {
    const cs = buildConcepts({ base: base(FULL), minutes: 60, recent: [] }, QUICK_DEPS);
    for (const c of cs) {
      expect(c.items[0]!.why).toBe("Big lift first, while you're fresh");
      for (const it of c.items) expect(it.why.toLowerCase()).not.toContain(c.title.toLowerCase());
    }
    expect(reasonsFor(['barbell-incline-bench-press', 'cable-tricep-pushdown'], QUICK_DEPS)).toEqual(["Big lift first, while you're fresh", 'Finishes the triceps your bench warmed up']);
  });

  it('P15: a light slot is never swapped into a heavy lift', () => {
    const item = { id: 'romanian-deadlift', slot: 'romanian-deadlift', origin: 'romanian-deadlift', name: 'Romanian Deadlift', pattern: 'hinge' as const, sets: 3, reps: [10, 12] as [number, number], restSec: 90, why: 'x' };
    const seen: string[] = [item.id];
    for (let i = 0; i < 6; i++) {
      const to = nextSwap(item, [item], seen, { data: SWAP_DATA, gym: FULL, ok, profile: (id) => profileFor(id) });
      if (!to) break;
      expect(to).not.toBe('deadlift');
      seen.push(to);
    }
  });
});

describe('round 3', () => {
  const ok = (id: string) => demoFor(id) !== null;
  const nameOf = (id: string) => QUICK_DEPS.name(id);
  it('B2: each option once per slot, one leg press, then nothing: no loop', () => {
    const start: QuickItem = { id: 'front-squat', slot: 'front-squat', origin: 'front-squat', name: 'Front Squat', pattern: 'squat' as const, sets: 3, reps: [8, 12] as [number, number], restSec: 150, why: 'x' };
    let item = start;
    const tried: string[] = [];
    const shown = [item.id];
    for (let i = 0; i < 20; i++) {
      const to = nextSwap(item, [item], tried, { data: SWAP_DATA, gym: FULL, ok, nameOf, profile: (id) => profileFor(id) });
      if (!to) break;
      tried.push(item.id);
      item = swapItem(item, to, nameOf(to), false, 'Front Squat');
      shown.push(to);
    }
    expect(new Set(shown).size).toBe(shown.length);
    expect(shown.filter((id) => /leg press/i.test(nameOf(id)))).toHaveLength(1);
    expect(shown.length).toBeLessThan(8);
    // Exhausted: null, so the screen says "No other option here".
    expect(nextSwap(item, [item], tried, { data: SWAP_DATA, gym: FULL, ok, nameOf })).toBeNull();
  });

  it('B1: a rejected card never comes back, and never "Same movement as X" on X', () => {
    const a = { id: 'dumbbell-lateral-raise', slot: 'dumbbell-lateral-raise', origin: 'dumbbell-lateral-raise', name: 'Dumbbell Lateral Raise', pattern: 'lateral delt' as const, sets: 3, reps: [10, 15] as [number, number], restSec: 60, why: 'Isolates your shoulders' };
    // Nothing else with a sure demo fits a lateral raise: the slot's own exercise is never offered back.
    expect(nextSwap(a, [a], [], { data: SWAP_DATA, gym: FULL, ok, nameOf })).toBeNull();
    const back = swapItem(a, 'leg-press', 'Leg Press', false, 'Leg Press');
    expect(back.why).toBe(a.why);
  });
});
