// PLAN 3.5j (G, Nov 11, his Guam hotel gym): treadmill, elliptical, stair climber, leg extension, leg
// curl, chest press machine, shoulder press machine, 2 benches, dumbbells up to 22 kg, kettlebells,
// yoga mat, lat pulldown, 2 adjustable height cable machines. The picker has every item, the
// dumbbell max (kg or lb, through load.ts) caps every suggestion, and plans and Quick ideas for
// exactly this gym fill 30 and 45 minutes, with a cardio warm up once G approves a cardio move.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EQUIPMENT_IDS, type DumbbellRange, type EquipmentId, type Load, type Unit } from '../../db/types';
import { equipmentPreset } from '../../db/gyms';
import { EQUIPMENT_LABEL } from '../intake/options';
import { EQUIPMENT_GROUPS } from '../intake/equipmentGroups';
import { ART_IDS } from '../../screens/intake/EquipmentArt';
import { equipmentSummary } from '../gymPresets';
import {
  convertForGym,
  dumbbellCapIn,
  dumbbellLoad,
  dumbbellRangeProblems,
  dumbbellsInRange,
  formatInOther,
  heaviestDumbbell,
  heaviestHeld,
  heldChoices,
  levelUpWeight,
  MAX_DUMBBELLS,
  nearestLoadable,
  otherUnit,
  parseDumbbellRange,
  resetWeight,
  singleLoad,
  stepUp,
  type LoadSetup,
} from '../load';
import { progress, type PastSession } from '../progression';
import { nextWeight } from '../coach/increment';
import { supports, swapCandidates, requiresOf, type Requires } from '../swap';
import { cardioFor, rankCardio } from '../cardio';
import { WARM_UP_MIN_MINUTES, type RawDay } from '../generator';
import { buildIdeas, type Concept } from '../quick';
import { STYLES } from '../quickStyles';
import { CARDIO_MIN_MINUTES } from '../quickCardio';
import { amountText, setsText } from '../plans';
import { generate } from '../../data/generator';
import { QUICK_DEPS } from '../../data/quick';
import { SWAP_DATA, candidateLoadOf } from '../../data/patterns';
import { profileFor } from '../../data/order';
import { resolvePlanExercise, definitionPlan } from '../../data/plans';
import { approvedCardio, loadCandidateFile, setApproved } from '../../data/candidateGate';
import { demoFor } from '../../data/exerciseInfo';
import type { GymKit } from '../picker';

/** G's list, exactly (two benches: the flat and the adjustable one; two cables: the cable station). */
const G_GEAR: EquipmentId[] = [
  'treadmill',
  'elliptical',
  'stair_climber',
  'leg_extension',
  'leg_curl',
  'chest_press_machine',
  'shoulder_press_machine',
  'flat_bench',
  'adjustable_bench',
  'dumbbells',
  'kettlebells',
  'yoga_mat',
  'lat_pulldown',
  'cable_station',
];
/** "Dumbbells up to 22 kg" on the hotel preset's rack: a kg gym (2 kg steps), and a lb gym (5 lb steps, 22 kg is 45 lb there). */
const RACK: Record<Unit, DumbbellRange> = {
  kg: { min: 2, max: dumbbellCapIn(22, 'kg', 'kg', 2, 2)!, step: 2 },
  lb: { min: 5, max: dumbbellCapIn(22, 'kg', 'lb', 5, 5)!, step: 5 },
};
const gymOf = (unit: Unit): GymKit => ({ equipment: G_GEAR, dumbbellRange: RACK[unit] });
const G = gymOf('lb');
/** The cardio moves waiting for G's approval that run on his machines. */
const CARDIO_IDS = ['Running_Treadmill', 'Walking_Treadmill', 'Jogging_Treadmill', 'Stairmaster'];

/** A small seeded random (mulberry32): the same cases every run. */
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

beforeAll(async () => {
  await loadCandidateFile();
  setApproved([]);
});
afterAll(() => setApproved([]));

describe('the picker has every item G listed', () => {
  it('29 ids: SPEC 3 order kept, the elliptical and the yoga mat added last, each with a label, a group and a drawing', () => {
    expect(EQUIPMENT_IDS).toHaveLength(29);
    expect(EQUIPMENT_IDS.slice(-2)).toEqual(['elliptical', 'yoga_mat']);
    expect(EQUIPMENT_IDS.slice(0, 3)).toEqual(['barbell_rack', 'flat_bench', 'adjustable_bench']);
    for (const id of G_GEAR) {
      expect(EQUIPMENT_IDS).toContain(id);
      expect(EQUIPMENT_LABEL[id].length).toBeGreaterThan(2);
      expect(EQUIPMENT_GROUPS.filter((g) => g.items.includes(id))).toHaveLength(1);
      expect(ART_IDS).toContain(id);
    }
    expect(EQUIPMENT_LABEL.elliptical).toBe('Elliptical');
    expect(EQUIPMENT_LABEL.yoga_mat).toBe('Yoga mat');
    expect(EQUIPMENT_GROUPS.find((g) => g.id === 'extras')!.items).toEqual(['resistance_bands', 'jump_rope', 'yoga_mat', 'treadmill', 'elliptical', 'bike', 'stair_climber', 'rower']);
  });

  it('a full gym has them; the hotel preset stays SPEC 3; a gym saved before them keeps working (nothing claimed)', () => {
    expect(equipmentPreset('full', 'kg').equipment).toEqual([...EQUIPMENT_IDS]);
    expect(equipmentPreset('hotel', 'lb').equipment).toEqual(['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike']);
    const legacy = EQUIPMENT_IDS.filter((id) => id !== 'elliptical' && id !== 'yoga_mat');
    // An old full gym is not "Everything" any more, and never gets an elliptical it may not have.
    expect(equipmentSummary({ equipment: legacy, dumbbellRange: { min: 5, max: 100, step: 5 }, unit: 'lb' })).toBe('Barbell and rack, dumbbells 5 to 100 lb + 25 more');
    expect(equipmentSummary({ equipment: [...EQUIPMENT_IDS], dumbbellRange: null, unit: 'lb' })).toBe('Everything');
    expect(equipmentSummary({ equipment: G_GEAR, dumbbellRange: RACK.kg, unit: 'kg' })).toBe('Dumbbells 2 to 22 kg, cable station + 12 more');
  });

  it('the new ids are wired into the gear rules: the cardio candidates on his machines are doable here', () => {
    expect(supports([['treadmill']], G)).toBe(true);
    expect(supports([['stair_climber']], G)).toBe(true);
    expect(supports([['elliptical']], G)).toBe(true);
    expect(supports([['yoga_mat']], G)).toBe(true);
    expect(supports([['bike']], G)).toBe(false);
    expect(supports([['rower']], G)).toBe(false);
    const moves = [
      { id: 'Recumbent_Bike', requires: [['bike']] as Requires },
      { id: 'Stairmaster', requires: [['stair_climber']] as Requires },
      { id: 'Running_Treadmill', requires: [['treadmill']] as Requires },
      { id: 'Fast_Skipping', requires: [] as Requires },
    ];
    // Machine moves only, treadmill first, then the elliptical, the stairs, the bike, the rower.
    expect(rankCardio(moves).map((m) => m.id)).toEqual(['Running_Treadmill', 'Stairmaster', 'Recumbent_Bike']);
    expect(cardioFor(moves, G)?.id).toBe('Running_Treadmill');
    expect(cardioFor(moves, { ...G, equipment: G_GEAR.filter((x) => x !== 'treadmill') })?.id).toBe('Stairmaster');
    expect(cardioFor(moves, G, 'none')).toBeUndefined();
    expect(cardioFor([], G)).toBeUndefined();
  });

  it('an elliptical alone is a fat loss finisher (a 10 min block, SPEC 7.3), after every machine a favourite names', () => {
    const only = { equipment: ['elliptical', 'dumbbells', 'adjustable_bench', 'cable_station'] as EquipmentId[], dumbbellRange: RACK.lb };
    const r = generate({ goals: ['fat_loss'], experience: '1_2y', days: 3, minutes: 45, gym: only });
    expect(r.ok && r.applied.finisher).toBe('Elliptical');
    const both = generate({ goals: ['fat_loss'], experience: '1_2y', days: 3, minutes: 45, gym: G, cardioFavorites: ['stairs'] });
    expect(both.ok && both.applied.finisher).toBe('Stair climber');
  });
});

describe('the dumbbell max, through load.ts', () => {
  it('22 kg is the rack heaviest at or under it, never rounded up: 45 lb at a 5 lb rack, 22 kg at a 2 kg one', () => {
    expect(dumbbellCapIn(22, 'kg', 'lb', 5, 5)).toBe(45);
    expect(convertForGym(45, 'lb', 'kg')).toBeLessThan(22);
    expect(convertForGym(50, 'lb', 'kg')).toBeGreaterThan(22);
    expect(dumbbellCapIn(22, 'kg', 'kg', 2, 2)).toBe(22);
    expect(dumbbellCapIn(23, 'kg', 'kg', 2, 2)).toBe(22);
    // He thinks in lb too: 50 lb in a kg gym is 22.68 kg, so 22 kg; in a 2.5 kg step rack, 22.5.
    expect(dumbbellCapIn(50, 'lb', 'kg', 2, 2)).toBe(22);
    expect(dumbbellCapIn(50, 'lb', 'kg', 2.5, 2.5)).toBe(22.5);
    expect(dumbbellCapIn(50, 'lb', 'lb', 5, 5)).toBe(50);
    // An exact conversion lands on its own dumbbell (20 kg rack in lb steps of 2.5: 44.09 lb → 42.5).
    expect(dumbbellCapIn(20, 'kg', 'lb', 2.5, 2.5)).toBe(42.5);
    expect(dumbbellCapIn(22.6796185, 'kg', 'lb', 5, 5)).toBe(50);
    // Under the lightest, or not a rack: nothing.
    expect(dumbbellCapIn(1, 'kg', 'lb', 5, 5)).toBeNull();
    expect(dumbbellCapIn(22, 'kg', 'lb', 5, 0)).toBeNull();
    expect(dumbbellCapIn(Number.NaN, 'kg', 'lb', 5, 5)).toBeNull();
    expect(dumbbellCapIn(22, 'kg', 'lb', -1, 5)).toBeNull();
    // Never a longer list than any rack may have.
    expect(dumbbellCapIn(250, 'kg', 'lb', 0, 0.25)).toBe(MAX_DUMBBELLS * 0.25);
  });

  it('the heaviest, the other unit in words, and the held list top', () => {
    expect(heaviestDumbbell(RACK.lb)).toBe(45);
    expect(heaviestDumbbell(RACK.kg)).toBe(22);
    expect(heaviestDumbbell(null)).toBeNull();
    expect(heaviestDumbbell({ min: 5, max: 1, step: 5 })).toBeNull();
    expect(otherUnit('lb')).toBe('kg');
    expect(otherUnit('kg')).toBe('lb');
    expect(formatInOther(45, 'lb')).toBe('about 20.4 kg');
    expect(formatInOther(22, 'kg')).toBe('about 48.5 lb');
    expect(heaviestHeld('dumbbell_each', { dumbbellRange: RACK.lb })).toBe(45);
    expect(heaviestHeld('single', { dumbbellRange: null, heldExact: true })).toBeNull();
    expect(heaviestHeld('dumbbell_each', { dumbbellRange: null })).toBeNull();
    expect(heaviestHeld('barbell', { dumbbellRange: RACK.lb })).toBeNull();
  });

  it('typed by hand: the heaviest in the other unit becomes the cap, its only problem is under the lightest', () => {
    expect(parseDumbbellRange('5', '22', '5', 'lb', 'kg')).toEqual({ min: 5, max: 45, step: 5 });
    expect(parseDumbbellRange('2', '50', '2', 'kg', 'lb')).toEqual({ min: 2, max: 22, step: 2 });
    expect(parseDumbbellRange('5', '22', '5', 'lb')).toBeNull(); // 22 lb is not on a 5 lb rack from 5
    expect(dumbbellRangeProblems('5', '22', '5', 'lb')).toEqual({ step: 'misses-max' });
    expect(dumbbellRangeProblems('5', '22', '5', 'lb', 'kg')).toEqual({});
    expect(dumbbellRangeProblems('20', '5', '5', 'lb', 'kg')).toEqual({ max: 'under-min' });
    expect(dumbbellRangeProblems('5', '300', '5', 'lb', 'kg')).toEqual({ max: 'too-heavy' });
    expect(dumbbellRangeProblems('5', '22', '', 'lb', 'kg')).toEqual({});
    expect(dumbbellRangeProblems('x', '22', '5', 'lb', 'kg')).toEqual({ min: 'number' });
    expect(dumbbellRangeProblems('5', '22', '0', 'lb', 'kg')).toEqual({ step: 'too-small' });
    expect(parseDumbbellRange('5', '', '5', 'lb', 'kg')).toBeNull();
    expect(parseDumbbellRange('5', '1', '5', 'lb', 'kg')).toBeNull();
    // The same unit keeps every SPEC 3 rule as it was.
    expect(parseDumbbellRange('5', '50', '5', 'lb')).toEqual({ min: 5, max: 50, step: 5 });
  });

  it('last time heavier than this rack: Next is the heaviest here, said plainly ("Heaviest here is 22 kg: add reps")', () => {
    const setup: Omit<LoadSetup, 'unit'> = { base: 20, plates: [25, 20, 10, 5, 2.5], collars: 'none', dumbbellRange: RACK.kg, stackStep: 2.5 };
    const past = (each: number, reps: number[]): PastSession => ({ date: 1, gymId: 'other', unit: 'kg', sets: reps.map((r) => ({ kind: 'work', reps: r, load: dumbbellLoad(each, 'kg') })) });
    const p = progress({ exerciseId: 'dumbbell-bench-press', loadKind: 'dumbbell_each', unit: 'kg', gym: setup, repRange: [8, 12], history: [past(30, [10, 10, 9])] });
    expect(p.next.load).toEqual(dumbbellLoad(22, 'kg'));
    expect(p.next.reason).toBe('Heaviest here is 22 kg: add reps');
    expect(p.next.atTop).toBe(true);
    for (const r of p.perSet) expect(r.target.load).toEqual(dumbbellLoad(22, 'kg'));
    // At the top already, every set at the top of the range: the same words, one more rep.
    const top = progress({ exerciseId: 'x', loadKind: 'dumbbell_each', unit: 'kg', gym: setup, repRange: [8, 12], history: [past(22, [12, 12])] });
    expect(top.next).toMatchObject({ load: dumbbellLoad(22, 'kg'), reason: 'Heaviest here is 22 kg: add reps', kind: 'beat_reps', atTop: true });
    // In lb, from a kg history: 30 kg is 66 lb, the heaviest here 45 lb.
    const lb = progress({ exerciseId: 'x', loadKind: 'dumbbell_each', unit: 'lb', gym: { ...setup, dumbbellRange: RACK.lb }, repRange: [8, 12], history: [past(30, [10])] });
    expect(lb.next.load).toEqual(dumbbellLoad(45, 'lb'));
    expect(lb.next.reason).toBe('Heaviest here is 45 lb: add reps');
    // Under the rack's top: no such line.
    const under = progress({ exerciseId: 'x', loadKind: 'dumbbell_each', unit: 'kg', gym: setup, repRange: [8, 12], history: [past(16, [10])] });
    expect(under.next.reason).not.toMatch(/Heaviest/);
    expect(under.next.atTop).toBeUndefined();
  });

  it('property: no weight anything suggests is ever heavier than the gym max (Next, every row, the coach raise, a step, a reset, the wheel)', () => {
    const r = rng(35_100);
    let checked = 0;
    for (let n = 0; n < 600; n++) {
      const unit: Unit = r() < 0.5 ? 'kg' : 'lb';
      const step = unit === 'kg' ? [1, 2, 2.5][Math.floor(r() * 3)]! : [2.5, 5][Math.floor(r() * 2)]!;
      const min = step * (1 + Math.floor(r() * 3));
      const typedUnit: Unit = r() < 0.5 ? 'kg' : 'lb';
      const typed = 10 + Math.floor(r() * 40);
      const max = dumbbellCapIn(typed, typedUnit, unit, min, step);
      if (max === null) continue;
      const range = { min, max, step };
      // The cap itself is never heavier than what was typed.
      expect(convertForGym(max, unit, typedUnit)).toBeLessThanOrEqual(typed + 1e-9);
      const setup: LoadSetup = { unit, base: null, plates: [], collars: 'none', dumbbellRange: range, stackStep: 5 };
      const kind = r() < 0.7 ? 'dumbbell_each' : 'single';
      const make = (w: number): Load => (kind === 'single' ? singleLoad(w, unit) : dumbbellLoad(w, unit));
      const histUnit: Unit = r() < 0.3 ? otherUnit(unit) : unit;
      const sessions: PastSession[] = Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => {
        const w = (histUnit === 'kg' ? 2 : 5) * (1 + Math.floor(r() * 25));
        const reps = Array.from({ length: 3 }, () => 6 + Math.floor(r() * 8));
        return { date: 10 - i, gymId: 'g', unit: histUnit, sets: reps.map((x) => ({ kind: 'work', reps: x, load: kind === 'single' ? singleLoad(w, histUnit) : dumbbellLoad(w, histUnit) })) };
      });
      const p = progress({ exerciseId: 'x', loadKind: kind, unit, gym: setup, repRange: [8, 12], history: sessions });
      const weightOf = (l: Load | null | undefined) => (l ? (l.kind === 'dumbbell_each' ? l.total / 2 : l.total) : 0);
      expect(weightOf(p.next.load)).toBeLessThanOrEqual(max + 1e-9);
      for (const row of p.perSet) expect(weightOf(row.target.load)).toBeLessThanOrEqual(max + 1e-9);
      for (const w of heldChoices(kind, setup)!) expect(w).toBeLessThanOrEqual(max + 1e-9);
      expect(dumbbellsInRange(range).at(-1)).toBe(max);
      const from = dumbbellsInRange(range)[Math.floor(r() * dumbbellsInRange(range).length)]!;
      for (const w of [
        stepUp(kind, from, setup),
        resetWeight(kind, from, setup),
        nearestLoadable(kind, from * 3, setup),
        levelUpWeight(kind, from, { pct: 0.1, minAdd: 5, capPct: 0.2 }, setup),
        nextWeight(kind, from, { cls: r() < 0.5 ? 'lower' : 'upper', rate: r() * 0.05, sessions: 5, scale: 1.5, easy: true }, setup),
      ])
        if (w !== null) expect(w).toBeLessThanOrEqual(max + 1e-9);
      expect(make(max).unit).toBe(unit);
      checked++;
    }
    expect(checked).toBeGreaterThan(400);
  });
});

/** Every exercise of a plan day (a pair's two count as two, the warm up as one). */
const moves = (d: RawDay) => d.blocks.reduce((n, b) => n + (b.type === 'superset' ? b.items.length : 1), 0) + (d.finisher ? 1 : 0);
const idsOf = (d: RawDay) => d.blocks.flatMap((b) => (b.type === 'superset' ? b.items.map((i) => i.id) : [b.id]));

describe("generated plans for exactly G's gym", () => {
  for (const unit of ['lb', 'kg'] as const)
    for (const minutes of [30, 45])
      for (const experience of ['1_2y', '3y'] as const)
        for (const days of [2, 3, 4])
          it(`${unit}, ${minutes} min, ${experience}, ${days} days: every day 5 to 7 moves, within 2 min of the chip, only his gear`, () => {
            const r = generate({ goals: ['muscle'], experience, days, minutes, gym: gymOf(unit), place: 'hotel' });
            expect(r.ok).toBe(true);
            if (!r.ok) return;
            expect(r.applied.over).toBe(false);
            // A 4 day upper and lower split at 30 min holds 3 or 4 big lifts at their full rest (SPEC 22
            // rule 6) and nothing else fits: 3 or 4 moves there, said in the report, never a shortened rest.
            const least = days === 4 && minutes === 30 ? 3 : 5;
            r.plan.days.forEach((d, i) => {
              expect(moves(d), `${d.name}`).toBeGreaterThanOrEqual(least);
              expect(moves(d), `${d.name}`).toBeLessThanOrEqual(7);
              expect(r.applied.minutes[i]).toBeGreaterThanOrEqual(minutes - 2);
              expect(r.applied.minutes[i]).toBeLessThanOrEqual(minutes);
              for (const id of idsOf(d)) expect(supports(requiresOf(SWAP_DATA, id)!, gymOf(unit)), id).toBe(true);
            });
            // Machines, dumbbells, kettlebells, cables and the benches all get used across the week.
            const gear = new Set(r.plan.days.flatMap(idsOf).flatMap((id) => requiresOf(SWAP_DATA, id)!.flat()));
            expect(gear.has('dumbbells')).toBe(true);
            expect(gear.has('cable_station') || gear.has('lat_pulldown')).toBe(true);
            // No cardio move is approved: no warm up, never a guess.
            expect(r.applied.warmUp).toBeUndefined();
          });

  it('big lifts of different areas pair up before a move is dropped (SPEC 22 rule 5), never the heaviest, never a strength day', () => {
    const r = generate({ goals: ['muscle'], experience: '1_2y', days: 3, minutes: 30, gym: G, place: 'hotel' });
    if (!r.ok) throw new Error(r.reason);
    const pairs = r.plan.days.flatMap((d) => d.blocks.filter((b) => b.type === 'superset'));
    expect(pairs.length).toBeGreaterThan(0);
    for (const d of r.plan.days) {
      // The day's first lift (its heaviest) stays on its own, at its full rest.
      expect(d.blocks[0]!.type).toBe('single');
      for (const b of d.blocks) if (b.type === 'superset') for (const it of b.items) expect(it.id).not.toBe((d.blocks[0] as { id: string }).id);
    }
    const strong = generate({ goals: ['strength'], experience: '1_2y', days: 3, minutes: 30, gym: G, place: 'hotel' });
    if (!strong.ok) throw new Error(strong.reason);
    expect(strong.plan.days.every((d) => d.blocks.every((b) => b.type === 'single'))).toBe(true);
  });

  it('with cardio moves approved on the phone: a 45 min day opens with a 5 min warm up on his treadmill, a 30 min day keeps its minutes for lifts', () => {
    setApproved(CARDIO_IDS);
    try {
      expect(approvedCardio().map((m) => m.id)).toEqual(['Jogging_Treadmill', 'Running_Treadmill', 'Walking_Treadmill', 'Stairmaster']);
      const r = generate({ goals: ['muscle'], experience: '1_2y', days: 3, minutes: 45, gym: G, place: 'hotel' });
      if (!r.ok) throw new Error(r.reason);
      expect(r.applied.warmUp).toBe('Jogging, Treadmill');
      r.plan.days.forEach((d, i) => {
        expect(d.blocks[0]).toMatchObject({ type: 'single', id: 'Jogging_Treadmill', warmup: true, seconds: [300, 300], sets: 1, restSec: 0 });
        expect(moves(d)).toBeGreaterThanOrEqual(5);
        expect(moves(d)).toBeLessThanOrEqual(7);
        expect(r.applied.minutes[i]).toBeGreaterThanOrEqual(43);
        expect(r.applied.minutes[i]).toBeLessThanOrEqual(45);
      });
      // The plan runs on this phone as it is (the approved move resolves; timed).
      expect(resolvePlanExercise('Jogging, Treadmill', 'Jogging_Treadmill')).toEqual({ id: 'Jogging_Treadmill', name: 'Jogging, Treadmill' });
      expect(definitionPlan(r.plan)?.days[0]!.blocks[0]).toMatchObject({ warmup: true, items: [{ exerciseId: 'Jogging_Treadmill' }] });
      expect(candidateLoadOf('Jogging_Treadmill')).toBe('timed');
      expect(profileFor('Jogging_Treadmill').role).toBe('cardio');
      expect(WARM_UP_MIN_MINUTES).toBe(45);
      const short = generate({ goals: ['muscle'], experience: '1_2y', days: 3, minutes: 30, gym: G, place: 'hotel' });
      expect(short.ok && short.applied.warmUp).toBeUndefined();
      // "No cardio" answered: never a warm up; no machine for it: none either.
      const none = generate({ goals: ['muscle'], experience: '1_2y', days: 3, minutes: 45, gym: G, cardio: 'none' });
      expect(none.ok && none.applied.warmUp).toBeUndefined();
      const noMachine = generate({ goals: ['muscle'], experience: '1_2y', days: 3, minutes: 45, gym: { ...G, equipment: G_GEAR.filter((x) => x !== 'treadmill' && x !== 'stair_climber') } });
      expect(noMachine.ok && noMachine.applied.warmUp).toBeUndefined();
    } finally {
      setApproved([]);
    }
    expect(candidateLoadOf('Jogging_Treadmill')).toBeUndefined();
    expect(profileFor('Jogging_Treadmill').role).not.toBe('cardio');
    expect(resolvePlanExercise('Jogging, Treadmill', 'Jogging_Treadmill')).toBeUndefined();
  });
});

const CARDIO_MACHINES_HERE = new Set<EquipmentId>(['treadmill', 'elliptical', 'stair_climber']);
const isCardio = (id: string) => CARDIO_IDS.includes(id);

/** What G gets: every card on screen, checked the way the brief says. */
function expectFull(cards: readonly Concept[], minutes: number, gym: GymKit, label: string, approved: boolean) {
  expect(cards.length, label).toBe(4);
  for (const c of cards) {
    const lifts = c.items.filter((it) => !isCardio(it.id));
    const at = `${label} ${c.id}:${c.variant}`;
    // Strength focus is fewer and heavier on purpose (3 at 30, 4 at 45); every other card holds 5 to 7.
    if (c.id === 'strength') expect(c.items.length, at).toBeGreaterThanOrEqual(3);
    else {
      expect(c.items.length, at).toBeGreaterThanOrEqual(5);
      expect(c.items.length, at).toBeLessThanOrEqual(7);
    }
    expect(c.minutes, at).toBeLessThanOrEqual(minutes + 2);
    if (!c.short) expect(c.minutes, at).toBeGreaterThanOrEqual(minutes - 2);
    for (const it of lifts) {
      expect(demoFor(it.id), `${at} ${it.id}`).not.toBeNull();
      expect(supports(requiresOf(SWAP_DATA, it.id)!, gym), `${at} ${it.id}`).toBe(true);
    }
    for (const g of c.gear) expect(G_GEAR, at).toContain(g);
    for (const it of c.items.filter((x) => isCardio(x.id))) {
      expect(approved, `${at} cardio without approval`).toBe(true);
      expect(it).toMatchObject({ sets: 1, seconds: 300, restSec: 0, pattern: null });
      expect(c.gear.some((g) => CARDIO_MACHINES_HERE.has(g)), at).toBe(true);
    }
    if (c.id in STYLES && c.id !== 'cardioCore') expect(STYLES[c.id as keyof typeof STYLES].honest(lifts.map((it) => profileFor(it.id)), lifts), at).toBe(true);
  }
}

describe('a 5 min warm up reads in minutes', () => {
  it('whole minutes from 2 min up say min; shorter holds stay in seconds', () => {
    expect(amountText({ seconds: 300 })).toBe('5 min');
    expect(amountText({ seconds: [300, 300] })).toBe('5 min');
    expect(amountText({ seconds: [120, 180] })).toBe('2 to 3 min');
    expect(setsText({ sets: 1, seconds: [300, 300] })).toBe('5 min');
    expect(setsText({ sets: 2, seconds: 300 })).toBe('2 sets × 5 min');
    expect(amountText({ seconds: 90 })).toBe('90 sec');
    expect(amountText({ seconds: 60 })).toBe('60 sec');
    expect(amountText({ seconds: [120, 150] })).toBe('120 to 150 sec');
    expect(setsText({ sets: 3, seconds: [30, 45] })).toBe('3 sets × 30 to 45 sec');
  });
});

describe("Quick ideas for exactly G's gym", () => {
  for (const approved of [false, true])
    for (const unit of ['lb', 'kg'] as const)
      for (const minutes of [30, 45])
        for (const experience of ['1_2y', '3y'] as const)
          it(`${approved ? 'cardio approved' : 'nothing approved'}, ${unit}, ${minutes} min, ${experience}: four full cards from his gear`, () => {
            setApproved(approved ? CARDIO_IDS : []);
            try {
              const ideas = buildIdeas({ base: { goals: ['muscle'], experience, gym: gymOf(unit) }, minutes, recent: [] }, QUICK_DEPS);
              expect(ideas.fewer).toBeUndefined();
              expectFull(ideas.cards, minutes, gymOf(unit), `${unit} ${minutes}`, approved);
              const all = [...ideas.cards, ...ideas.more];
              const cardio = all.flatMap((c) => c.items.filter((it) => isCardio(it.id)));
              if (!approved) expect(cardio).toEqual([]);
              else {
                // A warm up appears on the cards that have room for it, first in the card.
                expect(cardio.length).toBeGreaterThan(0);
                for (const c of all) c.items.forEach((it, i) => isCardio(it.id) && c.id !== 'cardioCore' && expect(i, c.id).toBe(0));
                // Real variety: the cards that warm up do not all use the same machine move.
                if (minutes >= 45) expect(new Set(cardio.map((it) => it.id)).size).toBeGreaterThan(1);
              }
              // Machines, dumbbells, kettlebells, cables and benches between the cards on screen.
              const gear = new Set(ideas.cards.flatMap((c) => c.gear));
              for (const g of ['dumbbells', 'cable_station', 'leg_curl'] as const) expect(gear.has(g), g).toBe(true);
              expect(gear.has('flat_bench') || gear.has('adjustable_bench')).toBe(true);
            } finally {
              setApproved([]);
            }
          });

  it('a 15 min card keeps its minutes for lifts; Cardio and core is offered only once a cardio move is approved, and is true to its name', () => {
    setApproved(CARDIO_IDS);
    try {
      expect(CARDIO_MIN_MINUTES).toBe(30);
      const short = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: G }, minutes: 15, recent: [] }, QUICK_DEPS);
      for (const c of short.cards) if (c.id !== 'cardioCore') expect(c.items.some((it) => isCardio(it.id)), c.id).toBe(false);
      const styles = [30, 45].map((minutes) => buildIdeas({ base: { goals: ['fat_loss'], experience: '3y', gym: G }, minutes, recent: [] }, QUICK_DEPS));
      const cc = styles.flatMap((s) => [...s.cards, ...s.more]).filter((c) => c.id === 'cardioCore');
      for (const c of cc) {
        expect(isCardio(c.items[0]!.id)).toBe(true);
        expect(isCardio(c.items.at(-1)!.id)).toBe(true);
        expect(STYLES.cardioCore.honest(c.items.map((it) => profileFor(it.id)), c.items)).toBe(true);
      }
    } finally {
      setApproved([]);
    }
    const none = [15, 30, 45, 60].flatMap((minutes) => {
      const i = buildIdeas({ base: { goals: ['fat_loss'], experience: '3y', gym: G }, minutes, recent: [] }, QUICK_DEPS);
      return [...i.cards, ...i.more];
    });
    expect(none.some((c) => c.id === 'cardioCore')).toBe(false);
  });

  it('"No cardio" answered: no warm up on any card, even with moves approved', () => {
    setApproved(CARDIO_IDS);
    try {
      for (const minutes of [30, 45]) {
        const ideas = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: G, cardio: 'none' }, minutes, recent: [] }, QUICK_DEPS);
        expect([...ideas.cards, ...ideas.more].flatMap((c) => c.items).some((it) => isCardio(it.id))).toBe(false);
      }
    } finally {
      setApproved([]);
    }
  });

  it('swaps for every move here stay on his gear (a swap never carries a weight, SPEC 7.2)', () => {
    const ideas = buildIdeas({ base: { goals: ['muscle'], experience: '1_2y', gym: G }, minutes: 45, recent: [] }, QUICK_DEPS);
    for (const it of ideas.cards.flatMap((c) => c.items)) for (const s of swapCandidates(SWAP_DATA, it.id, G)) expect(supports(s.requires, G), `${it.id} → ${s.id}`).toBe(true);
  });
});
