// PLAN 3.6e (audit A2, A3): the next weight steps once from what was really lifted, and a "≈" line
// only ever quotes last time's real weight converted, never the raised or reset one.
import { describe, expect, it } from 'vitest';
import type { Load, Unit } from '../../db/types';
import { barbellLoad, convertForGym, dumbbellLoad, formatWeight, heldChoices, nearestLoadable, pickedWeight, type LoadSetup } from '../load';
import { RESET, beatLine, progress, type PastSession, type RepRange } from '../progression';

const KG: Omit<LoadSetup, 'unit'> = { base: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], collars: 'none', dumbbellRange: { min: 2.5, max: 50, step: 2.5 }, stackStep: 2.5 };
const LB: Omit<LoadSetup, 'unit'> = { base: 45, plates: [45, 35, 25, 10, 5, 2.5], collars: 'none', dumbbellRange: { min: 5, max: 100, step: 5 }, stackStep: 5 };
const RANGE: RepRange = [8, 12];
const session = (date: number, unit: Unit, reps: number[], load: Load): PastSession => ({ date, gymId: 'other', unit, sets: reps.map((r) => ({ kind: 'work' as const, reps: r, load })) });
const db = (reps: number[], each: number, unit: Unit, date = 2) => session(date, unit, reps, dumbbellLoad(each, unit));
const run = (unit: Unit, history: PastSession[], loadKind: Load['kind'] = 'dumbbell_each', repRange: RepRange | null = RANGE, gym = unit === 'kg' ? KG : LB) =>
  progress({ exerciseId: 'x', loadKind, unit, gym, repRange, history });

describe('A2: a weight this rack cannot make (same unit)', () => {
  it('all sets at the top: the next dumbbell up from the real weight, once (9 kg → 10 kg, not 12.5)', () => {
    const p = run('kg', [db([12, 12], 9, 'kg')]);
    expect(p.next.load).toEqual(dumbbellLoad(10, 'kg')); // was 12.5 kg
    expect(p.next.kind).toBe('increase');
    expect(p.next.reason).toBe('All sets hit 12. Time to go up');
    expect(run('kg', [db([12, 12], 8, 'kg')]).next.load).toEqual(dumbbellLoad(10, 'kg'));
    expect(run('kg', [db([12, 12], 10, 'kg')]).next.load).toEqual(dumbbellLoad(12.5, 'kg'));
  });
  it('a barbell total these plates cannot make steps to the next total above it', () => {
    const odd = barbellLoad(45, [45, 1.25], 'none', 'lb')!; // 137.5 lb, made with 1.25s elsewhere
    const p = run('lb', [session(2, 'lb', [12, 12], odd)], 'barbell');
    expect(p.next.load!.total).toBe(140); // was 135 rounded, then 140: the same here; never 145
    const heavy = barbellLoad(45, [45, 2.5, 1.25], 'none', 'lb')!; // 142.5
    expect(run('lb', [session(2, 'lb', [12, 12], heavy)], 'barbell').next.load!.total).toBe(145); // was 150
  });
  it('beat the reps: never at a heavier weight that was not lifted; the next one down, and it says so', () => {
    const p = run('kg', [db([10, 9], 9, 'kg')]);
    expect(p.next.load).toEqual(dumbbellLoad(7.5, 'kg')); // was 10 kg
    expect(p.next.kind).toBe('beat_reps');
    expect(p.next.closest).toBe(true);
    expect(p.next.reason).toBe('No 9 kg here: 7.5 kg is the next one down');
    expect(beatLine(p)).toBe('11 reps at 7.5 kg each'); // never "Beat last time" at another weight
    expect(p.perSet.map((r) => r.target.reps)).toEqual([11, 9]);
  });
  it('nothing lighter here: the lightest, said plainly', () => {
    const p = run('kg', [db([10, 9], 2, 'kg')]);
    expect(p.next.load).toEqual(dumbbellLoad(2.5, 'kg'));
    expect(p.next.reason).toBe('No 2 kg here: 2.5 kg is the lightest');
    expect(p.next.closest).toBe(true);
  });
  it('a reset takes 10% off the real weight', () => {
    const p = run('kg', [db([6, 5], 9, 'kg', 3), db([6, 5], 9, 'kg', 2)]);
    expect(p.next.kind).toBe('reset');
    expect(p.next.load).toEqual(dumbbellLoad(7.5, 'kg')); // 8.1 → 7.5
    expect(p.next.reason).toBe(RESET);
  });
  it('a weight the rack has is untouched: no flag, the usual line', () => {
    const p = run('kg', [db([10, 9], 10, 'kg')]);
    expect(p.next.load).toEqual(dumbbellLoad(10, 'kg'));
    expect(p.next.closest).toBeUndefined();
    expect(beatLine(p)).toBe('Beat last time: 11 reps at 10 kg each');
  });
});

describe('A3: the ≈ line quotes last time, converted', () => {
  it('all sets at the top: ≈ the converted weight, then the step up said as a step up', () => {
    const p = run('kg', [db([12, 12], 60, 'lb')]);
    expect(p.next.load).toEqual(dumbbellLoad(30, 'kg'));
    expect(p.next.kind).toBe('converted');
    expect(p.next.reason).toBe('≈ 27.5 kg, last time 60 lb. All sets hit 12. Time to go up'); // was "≈ 30 kg, last time 60 lb"
  });
  it('the audit screen case: 10 kg × 15 in a lb gym', () => {
    const p = run('lb', [db([15, 15, 15, 15], 10, 'kg')], 'dumbbell_each', [10, 15]);
    expect(p.next.load).toEqual(dumbbellLoad(25, 'lb'));
    expect(p.next.reason).toBe('≈ 20 lb, last time 10 kg. All sets hit 15. Time to go up'); // was "≈ 25 lb, last time 10 kg"
  });
  it('a reset keeps its reason', () => {
    const p = run('kg', [db([6, 5], 60, 'lb', 3), db([6, 5], 60, 'lb', 2)]);
    expect(p.next.load).toEqual(dumbbellLoad(25, 'kg'));
    expect(p.next.reason).toBe(`≈ 27.5 kg, last time 60 lb. ${RESET}`); // was "≈ 25 kg, last time 60 lb"
  });
  it('a barbell: 135 lb is ≈ 60 kg, then up to 62.5', () => {
    const p = run('kg', [session(2, 'lb', [12, 12], barbellLoad(45, [45], 'none', 'lb')!)], 'barbell');
    expect(p.next.load!.total).toBe(62.5);
    expect(p.next.reason).toBe('≈ 60 kg, last time 135 lb. All sets hit 12. Time to go up'); // was "≈ 62.5 kg, last time 135 lb"
  });
  it('rounding up that is already a real step up is the step: 13 kg → 30 lb, never 35, and no ≈', () => {
    const p = run('lb', [db([12, 12], 13, 'kg')]); // 13 kg is 28.7 lb
    expect(p.next.load).toEqual(dumbbellLoad(30, 'lb')); // was 35 lb
    expect(p.next.reason).toBe('Last time 13 kg. All sets hit 12. Time to go up');
  });
  it('beat the reps is as before', () => {
    const p = run('kg', [db([10, 9], 60, 'lb')]);
    expect(p.next.load).toEqual(dumbbellLoad(27.5, 'kg'));
    expect(p.next.reason).toBe('≈ 27.5 kg, last time 60 lb');
  });
});

function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

describe('properties', () => {
  const next = rng(7);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!;
  const racks = { kg: [{ min: 2.5, max: 50, step: 2.5 }, { min: 2, max: 40, step: 2 }, { min: 1, max: 30, step: 1 }, { min: 5, max: 25, step: 5 }], lb: [{ min: 5, max: 100, step: 5 }, { min: 2.5, max: 50, step: 2.5 }, { min: 10, max: 60, step: 10 }] };
  const reps = [[12, 12], [10, 9], [6, 5], [12, 11]];
  it('a conversion line always equals the conversion of the stored number', () => {
    let seen = 0;
    for (let n = 0; n < 400; n++) {
      const unit = pick(['kg', 'lb'] as const);
      const from = unit === 'kg' ? 'lb' : 'kg';
      const each = Math.round(2 + next() * 60);
      const range = pick(racks[unit]);
      const setup: LoadSetup = { ...(unit === 'kg' ? KG : LB), unit, dumbbellRange: range };
      const r = pick(reps);
      const history = next() < 0.3 ? [db(r, each, from, 3), db(r, each, from, 2)] : [db(r, each, from)];
      const p = progress({ exerciseId: 'x', loadKind: 'dumbbell_each', unit, gym: setup, repRange: RANGE, history });
      const m = /^≈ (.+?), last time (.+?)(\.|$)/.exec(p.next.reason);
      if (!m) continue;
      seen++;
      const near = nearestLoadable('dumbbell_each', convertForGym(each, from, unit), setup)!;
      expect(m[1], `${each} ${from} → ${unit} step ${range.step}`).toBe(formatWeight(near, unit));
      expect(m[2]).toBe(formatWeight(each, from));
    }
    expect(seen).toBeGreaterThan(100);
  });
  it('same unit, every set at the top: the target is the lightest dumbbell here above the real weight', () => {
    for (let n = 0; n < 400; n++) {
      const unit = pick(['kg', 'lb'] as const);
      const each = Math.round((1 + next() * 45) * 2) / 2;
      const range = pick(racks[unit]);
      const setup: LoadSetup = { ...(unit === 'kg' ? KG : LB), unit, dumbbellRange: range };
      const p = progress({ exerciseId: 'x', loadKind: 'dumbbell_each', unit, gym: setup, repRange: RANGE, history: [db([12, 12], each, unit)] });
      const above = heldChoices('dumbbell_each', setup)!.find((w) => w > each) ?? null;
      const label = `${each} ${unit} on ${range.min}-${range.max}/${range.step}`;
      if (above !== null) {
        expect(pickedWeight(p.next.load!), label).toBe(above);
        expect(p.next.kind, label).toBe('increase');
      } else expect(p.next.kind, label).toBe('beat_reps'); // top of the rack: add reps, never a made up weight
    }
  });
  it('same unit, beat the reps: the target is never heavier than what was lifted, unless nothing lighter exists', () => {
    for (let n = 0; n < 400; n++) {
      const unit = pick(['kg', 'lb'] as const);
      const each = Math.round((1 + next() * 45) * 2) / 2;
      const range = pick(racks[unit]);
      const setup: LoadSetup = { ...(unit === 'kg' ? KG : LB), unit, dumbbellRange: range };
      const p = progress({ exerciseId: 'x', loadKind: 'dumbbell_each', unit, gym: setup, repRange: RANGE, history: [db([10, 9], each, unit)] });
      const w = pickedWeight(p.next.load!)!;
      if (each >= range.min) expect(w, `${each} ${unit} step ${range.step}`).toBeLessThanOrEqual(each);
      else expect(w).toBe(range.min);
    }
  });
});
