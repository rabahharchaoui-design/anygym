// Tester check for PLAN 3.5 (written independently from SPEC 7.3, 7.4, 4.3, 15). Not the builder's tests.
import { describe, expect, it } from 'vitest';
import { generate } from '../../data/generator';
import { SWAP_DATA } from '../../data/patterns';
import { CATALOG_NAMES } from '../../data/importMatch';
import { equipmentPreset } from '../../db/gyms';
import { EQUIPMENT_IDS, type EquipmentId } from '../../db/types';
import { supports, workoutIdOf, patternOf, type Pattern } from '../swap';
import type { GeneratorInput, RawItem, RawPlan } from '../generator';
import type { GoalId, ExperienceId } from '../intake/options';
import { readFileSync } from 'node:fs';
import { profileFor } from '../../data/order';
import { isCompound } from '../order';
const DISAGREE = new Set<string>();

const full = equipmentPreset('full', 'lb');
const FULL = { equipment: full.equipment, dumbbellRange: full.dumbbellRange };
const COMPOUND: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'hinge', 'lunge', 'horizontal push', 'vertical push', 'horizontal pull', 'vertical pull']);

type Row = { item: RawItem; compound: boolean; sets: number; rest: number; day: string };
function rows(plan: RawPlan): Row[] {
  const out: Row[] = [];
  for (const d of plan.days) for (const b of d.blocks) {
    const its = b.type === 'single' ? [b] : b.items;
    for (const item of its) {
      const pat = patternOf(SWAP_DATA, item.id);
      const mine = !!pat && COMPOUND.has(pat);
      const theirs = isCompound(profileFor(item.id));
      if (mine !== theirs) DISAGREE.add(`${item.id}:${pat}:gen=${theirs}`);
      out.push({ item, compound: theirs, sets: b.sets, rest: b.restSec, day: d.name });
    }
  }
  return out;
}

const GOAL_CASES: Array<[string, GoalId, { cReps: [number, number]; aReps?: [number, number]; aRest?: number; cRestMin: number; finisher: boolean | 'any' }]> = [
  ['muscle', 'muscle', { cReps: [8, 12], aReps: [10, 15], aRest: 60, cRestMin: 90, finisher: false }],
  ['strength', 'strength', { cReps: [4, 6], aReps: [8, 10], cRestMin: 150, finisher: false }],
  ['fat loss', 'fat_loss', { cReps: [10, 15], aReps: [10, 15], aRest: 45, cRestMin: 45, finisher: true }],
  ['stay fit', 'health', { cReps: [8, 12], aReps: [8, 12], aRest: 75, cRestMin: 75, finisher: false }],
  ['athletic', 'athletic', { cReps: [5, 8], cRestMin: 0, finisher: true }],
];
const LEVELS: Array<[string, ExperienceId]> = [['new', 'new'], ['under 2 years a few months', 'months'], ['under 2 years 1 to 2', '1_2y'], ['2+', '3y']];

describe('SPEC 7.3 goal x level, 4 days, full gym', () => {
  for (const [gname, goal, exp] of GOAL_CASES) for (const [lname, level] of LEVELS) {
    it(`${gname} / ${lname}`, () => {
      const input: GeneratorInput = { goals: [goal], experience: level, days: 4, minutes: 75, gym: FULL };
      const r = generate(input);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const rs = rows(r.plan);
      expect(rs.length).toBeGreaterThan(20);
      const obs = { compRest: new Set<number>(), accRest: new Set<number>(), sets: new Set<string>() };
      for (const x of rs) {
        const timed = !!x.item.seconds;
        if (!timed) {
          if (x.compound) expect(x.item.reps, `${x.item.id} reps`).toEqual(exp.cReps);
          else if (exp.aReps) expect(x.item.reps, `${x.item.id} reps`).toEqual(exp.aReps);
        }
        if (x.compound) { expect(x.rest, `${x.item.id} rest`).toBeGreaterThanOrEqual(exp.cRestMin); obs.compRest.add(x.rest); }
        else { if (exp.aRest) expect(x.rest, `${x.item.id} acc rest`).toBe(exp.aRest); obs.accRest.add(x.rest); }
        obs.sets.add(`${x.compound ? 'c' : 'a'}${x.sets}`);
        // sets per SPEC: new 2-3, under 2y 3, 2+ 3-4
        if (level === 'new') expect([2, 3]).toContain(x.sets);
        else if (level === '3y') expect([3, 4]).toContain(x.sets);
        else expect(x.sets).toBe(3);
      }
      // finisher
      for (const d of r.plan.days) {
        if (exp.finisher === true) expect(d.finisher?.minutes, `${d.name} finisher`).toBe(10);
        if (exp.finisher === false) expect(d.finisher).toBeUndefined();
      }
      console.log(`OBS ${gname}/${lname} compRest=${[...obs.compRest]} accRest=${[...obs.accRest]} sets=${[...obs.sets].sort()} fin=${r.plan.days[0]?.finisher?.name ?? '-'}`);
    });
  }
});

it('classification disagreements (info)', () => { console.log('OBS disagree', [...DISAGREE].join(' | ')); });

describe('SPEC 7.3 splits by days', () => {
  const names: Record<number, string[]> = {
    2: ['Full body A', 'Full body B'],
    3: ['Full body A', 'Full body B', 'Full body C'],
    4: ['Upper', 'Lower', 'Upper', 'Lower'],
    5: ['Upper', 'Lower', 'Push', 'Pull', 'Legs'],
    6: ['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'],
  };
  for (const days of [2, 3, 4, 5, 6]) it(`${days} days`, () => {
    const r = generate({ goals: ['muscle'], experience: '1_2y', days, minutes: 75, gym: FULL });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.days.length).toBe(days);
    r.plan.days.forEach((d, i) => expect(d.name.startsWith(names[days]![i]!), d.name).toBe(true));
  });
});

// ---- seeded no-bad-data property
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const catalog = new Set(CATALOG_NAMES.map((c) => c.id));
const map = JSON.parse(readFileSync(new URL('../../../data/exercise-map.json', import.meta.url), 'utf8')) as unknown;

describe('no bad data over 200 seeded intakes x gyms', () => {
  it('only doable moves, honest failure under 3', () => {
    const r = rng(3535);
    const goals: GoalId[] = ['muscle', 'strength', 'fat_loss', 'tone', 'health', 'athletic', 'race', 'comeback'];
    const exps: ExperienceId[] = ['new', 'months', '1_2y', '3y', 'break'];
    let okN = 0, failN = 0, empty = 0;
    for (let n = 0; n < 200; n++) {
      const equipment = EQUIPMENT_IDS.filter(() => r() < (n % 4 === 0 ? 0 : n % 4 === 1 ? 0.15 : r())) as EquipmentId[];
      const gym = { equipment, dumbbellRange: equipment.includes('dumbbells') && r() < 0.7 ? { min: 5, max: 50, step: 5 } : null };
      const input: GeneratorInput = {
        goals: [goals[Math.floor(r() * 8)]!, ...(r() < 0.5 ? [goals[Math.floor(r() * 8)]!] : [])],
        experience: exps[Math.floor(r() * 5)], days: 2 + Math.floor(r() * 5), minutes: [20, 30, 45, 60, 75][Math.floor(r() * 5)],
        focus: r() < 0.5 ? ['arms', 'glutes'] : [], easyOn: r() < 0.3 ? ['knees', 'lower_back'] : [], gym,
      };
      const res = generate(input);
      if (!res.ok) { failN++; expect(res.moves).toBeLessThan(3); continue; }
      okN++;
      for (const d of res.plan.days) {
        const items = d.blocks.flatMap((b) => (b.type === 'single' ? [b] : b.items));
        expect(items.length, `${res.plan.id} ${d.name}`).toBeGreaterThanOrEqual(3);
        for (const it of items) {
          expect(catalog.has(it.id) || !!SWAP_DATA.planExercises[it.id] || !!SWAP_DATA.sameAs(it.id), it.id).toBe(true);
          const cand = Object.values(SWAP_DATA.patterns).flatMap((l) => l.candidates).find((c) => workoutIdOf(c) === it.id);
          const req = cand?.requires ?? SWAP_DATA.planExercises[it.id]?.requires;
          expect(req, `${it.id} has a known requirement`).toBeTruthy();
          expect(supports(req!, gym), `${it.id} doable with ${equipment}`).toBe(true);
        }
      }
      if (!res.plan.days.length) empty++;
    }
    console.log(`OBS property ok=${okN} fail=${failN} empty=${empty}`);
    expect(okN).toBeGreaterThan(50);
    expect(failN).toBeGreaterThan(0);
    expect(map).toBeTruthy();
  });
});

describe('frozen plans', () => {
  const hotel = equipmentPreset('hotel', 'lb');
  const gyms: Record<string, { equipment: EquipmentId[]; dumbbellRange: { min: number; max: number; step: number } | null }> = {
    'hotel-gym-3-day': { equipment: hotel.equipment, dumbbellRange: hotel.dumbbellRange },
    'no-equipment-3-day': { equipment: [], dumbbellRange: null },
    'beginner-full-body-3-day': FULL,
  };
  for (const [file, gym] of Object.entries(gyms)) it(file, () => {
    const plan = JSON.parse(readFileSync(new URL(`../../../data/plans/${file}.json`, import.meta.url), 'utf8')) as RawPlan;
    expect(plan.days.length).toBe(3);
    const lines: string[] = [];
    for (const d of plan.days) {
      const items = d.blocks.flatMap((b) => (b.type === 'single' ? [b] : b.items));
      expect(items.length).toBeGreaterThanOrEqual(3);
      lines.push(`${d.name}: ${items.map((i) => i.id).join(', ')}${d.finisher ? ' +' + d.finisher.name : ''}`);
      for (const it of items) {
        expect(catalog.has(it.id) || !!SWAP_DATA.planExercises[it.id], `${it.id} in catalog`).toBe(true);
        const cand = Object.values(SWAP_DATA.patterns).flatMap((l) => l.candidates).find((c) => workoutIdOf(c) === it.id);
        const req = cand?.requires ?? SWAP_DATA.planExercises[it.id]?.requires;
        expect(req, it.id).toBeTruthy();
        expect(supports(req!, gym), `${it.id} doable`).toBe(true);
        if (file === 'no-equipment-3-day') expect(req!.length === 0 || req!.every((g) => g.length === 0), `${it.id} bodyweight`).toBe(true);
      }
    }
    const text = JSON.stringify(plan).toLowerCase();
    for (const bad of ['rabah', 'ohrabah', 'harchaoui', 'anygym-private']) expect(text.includes(bad), bad).toBe(false);
    console.log(`OBS ${file}\n  ${lines.join('\n  ')}`);
  });
});

import { infoForExercise, photoEligibility } from '../../data/exerciseInfo';
import { EXERCISE_MAP } from '../../data/muscles';
describe('demo tiles', () => {
  it('no demo for none matches, across seeded plans', () => {
    const r = rng(77);
    const none = new Set(EXERCISE_MAP.filter((e) => e.match === 'none').map((e) => e.planId));
    let seen = 0, withDemo = 0, without = 0;
    for (let n = 0; n < 200; n++) {
      const equipment = EQUIPMENT_IDS.filter(() => r() < 0.6) as EquipmentId[];
      const res = generate({ goals: ['muscle'], experience: '3y', days: 2 + Math.floor(r() * 5), minutes: 75, gym: { equipment, dumbbellRange: { min: 5, max: 50, step: 5 } }, love: [], never: [] });
      if (!res.ok) continue;
      for (const d of res.plan.days) for (const b of d.blocks) for (const it of b.type === 'single' ? [b] : b.items) {
        seen++;
        const info = infoForExercise(it.id);
        const planEntry = EXERCISE_MAP.find((e) => e.planId === it.id);
        const sure = planEntry ? planEntry.match !== 'none' && !!planEntry.catalogId && photoEligibility(planEntry.catalogId) !== 'none' : photoEligibility(it.id) !== 'none';
        if (info.demo) { withDemo++; expect(sure, `${it.id} demo only when sure`).toBe(true); expect(none.has(it.id)).toBe(false); }
        else without++;
      }
    }
    console.log(`OBS demos seen=${seen} withDemo=${withDemo} without=${without}`);
  });
});
