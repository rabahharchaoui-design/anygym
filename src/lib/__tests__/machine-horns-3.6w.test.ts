// PLAN 3.6w (4), Codex bughunt 1112-1918 #6: a plate machine that loads on one horn counts its
// plates once. Absent `horns` means both sides, exactly as every load before 3.6w was saved.
// Expected totals are worked out by hand from the plates listed.
import { describe, expect, it } from 'vitest';
import {
  collarsOf,
  copyLoad,
  formatMathLine,
  hornsOf,
  loadAt,
  otherOf,
  plateMachineLoad,
  platesOnly,
  solvePlates,
  stepDown,
  stepUp,
  sumLoad,
  type LoadSetup,
} from '../load';
import { plateIncrement } from '../load/increments';
import { isLoad } from '../backup';
import { buildPlanExercises } from '../loadTypeRule';
import planExercises from '../../../data/plan-exercises.json';

const lb: LoadSetup = { unit: 'lb', base: 0, plates: [45, 25, 10, 5, 2.5], collars: 'none', dumbbellRange: null, stackStep: 5 };
const kg: LoadSetup = { unit: 'kg', base: 20, plates: [20, 10, 5, 2.5, 1.25], collars: 'none', dumbbellRange: null, stackStep: 2.5 };
const one = (s: LoadSetup): LoadSetup => ({ ...s, horns: 1 });

describe('the model', () => {
  it('one 45 lb plate, plates only: 45 lb on one horn, 90 lb on two (the bug: always 90)', () => {
    expect(plateMachineLoad(0, [45], 'lb', undefined, 1)).toEqual({ kind: 'plate_machine', unit: 'lb', total: 45, barWeight: 0, perSide: [45], collars: 0, horns: 1 });
    expect(plateMachineLoad(0, [45], 'lb')).toEqual({ kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45], collars: 0 });
    expect(plateMachineLoad(0, [45], 'lb', undefined, 2)).not.toHaveProperty('horns');
  });

  it('kg with a starting weight: 20 + 20 + 5 = 45 on one horn, 20 + 2 × 25 = 70 on two', () => {
    expect(plateMachineLoad(20, [20, 5], 'kg', undefined, 1)?.total).toBe(45);
    expect(plateMachineLoad(20, [20, 5], 'kg')?.total).toBe(70);
  });

  it('a sleeve that does not fit is no loading on one horn either', () => {
    expect(plateMachineLoad(0, [45, 45, 45], 'lb', 2, 1)).toBeNull();
  });

  it('sumLoad, platesOnly and the math line count the plates once on one horn', () => {
    expect(sumLoad({ bar: 0, perSide: [45, 10], unit: 'lb', horns: 1 })).toEqual({ total: 55, platesTotal: 55, collarsTotal: 0 });
    expect(platesOnly([45, 10], 'lb', 1)).toBe(55);
    expect(platesOnly([45, 10], 'lb')).toBe(110);
    expect(formatMathLine(20, [20, 5], 'none', 'kg', 'start', 0, 1)).toBe('20 start + 20 + 5 = 45 kg');
    expect(formatMathLine(20, [20], 'none', 'kg', 'start')).toBe('20 start + 2 × 20 = 60 kg');
  });

  it('hornsOf: 1 only for a one horn snapshot', () => {
    expect(hornsOf({ horns: 1 })).toBe(1);
    expect(hornsOf({})).toBe(2);
  });
});

describe('old loads read exactly as saved', () => {
  it('an old plate machine record (no horns field) keeps its total, no other, no collars', () => {
    const old = { kind: 'plate_machine' as const, unit: 'lb' as const, total: 140, barWeight: 50, perSide: [45], collars: 0 };
    expect(otherOf(old)).toBe(0);
    expect(collarsOf({ ...old, collars: undefined })).toBe(0);
    expect(copyLoad(old, 'plate_machine', { ...lb, base: 50 })).toEqual({ load: { ...old, perSide: [45] } });
  });

  it('a one horn snapshot has no "other" weight and copies to a one horn machine only', () => {
    const load = plateMachineLoad(0, [45], 'lb', undefined, 1)!;
    expect(otherOf(load)).toBe(0);
    expect(collarsOf({ ...load, collars: undefined })).toBe(0);
    expect(copyLoad(load, 'plate_machine', one(lb))).toEqual({ load });
    // PLAN 3.6h2: on a machine counted on both sides the one side total is not the same lift: refused.
    expect(copyLoad(load, 'plate_machine', lb)).toEqual({ load: null, why: 'horns' });
    expect(copyLoad(load, 'plate_machine', { ...one(lb), plates: [25] })).toEqual({ load: null, why: 'inexact' });
  });
});

describe('solving and stepping', () => {
  it('exact solves: 70 lb on one horn is 45 + 25; on two horns 70 is 25 + 10 a side', () => {
    expect(loadAt('plate_machine', 70, one(lb))).toMatchObject({ total: 70, perSide: [45, 25], horns: 1 });
    expect(loadAt('plate_machine', 70, lb)).toMatchObject({ total: 70, perSide: [25, 10] });
    expect(solvePlates(47.5, { bar: 0, inventory: lb.plates, unit: 'lb', horns: 1 })).toEqual({ exact: true, total: 47.5, perSide: [45, 2.5] });
  });

  it('nearest solves on one horn: 1 lb is between 0 and 2.5', () => {
    expect(solvePlates(1, { bar: 0, inventory: lb.plates, unit: 'lb', horns: 1 })).toMatchObject({ exact: false, below: { total: 0 }, above: { total: 2.5 } });
  });

  it('a barbell is never one horn', () => {
    expect(loadAt('barbell', 135, { ...one(lb), base: 45 })).toMatchObject({ total: 135, perSide: [45] });
    expect(loadAt('barbell', 135, { ...one(lb), base: 45 })).not.toHaveProperty('horns');
  });

  it('the step: 5 lb / 2.5 kg, or one smallest plate (not a pair) on one horn', () => {
    expect(plateIncrement([10], 'lb', 1)).toBe(10);
    expect(plateIncrement([10], 'lb')).toBe(20);
    expect(plateIncrement([1.25], 'kg', 1)).toBe(2.5);
    expect(stepUp('plate_machine', 45, one(lb))).toBe(50);
    expect(stepDown('plate_machine', 45, one(lb))).toBe(40);
    expect(stepUp('plate_machine', 45, { ...one(kg), base: 0, plates: [20, 5] })).toBe(50);
    expect(stepDown('plate_machine', 50, { ...one(kg), base: 0, plates: [20, 5] })).toBe(45);
  });
});

describe('stored and imported data', () => {
  it('backups accept a one horn snapshot on a plate machine only', () => {
    expect(isLoad(plateMachineLoad(0, [45], 'lb', undefined, 1))).toBe(true);
    expect(isLoad({ kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45], collars: 0 })).toBe(true);
    expect(isLoad({ kind: 'barbell', unit: 'lb', total: 90, barWeight: 45, perSide: [22.5], collars: 0, horns: 1 })).toBe(false);
    expect(isLoad({ kind: 'plate_machine', unit: 'lb', total: 90, barWeight: 0, perSide: [45], horns: 2 })).toBe(false);
  });

  it('data facts: leg press sleds load both sides; nothing is marked one horn without being sure', () => {
    const horns = Object.fromEntries((planExercises as Array<{ id: string; horns?: number }>).filter((e) => e.horns).map((e) => [e.id, e.horns]));
    expect(horns).toEqual({ 'angled-machine-leg-press': 2, 'leg-press': 2, 'leg-press-machine-calf-raise': 2, 'machine-leg-press': 2 });
    expect((planExercises as Array<{ id: string; horns?: number }>).find((e) => e.id === 'machine-seated-calf-raise')).not.toHaveProperty('horns');
  });

  it('an override with horns on anything but a plate machine, or not 1 or 2, is refused', () => {
    const plans = [{ days: [{ exercise: 'Leg Press' }, { exercise: 'Barbell Row' }] }];
    expect(buildPlanExercises(plans, [{ name: 'Leg Press', loadType: 'plate_machine', horns: 1, why: 'test' }])[1]).toEqual({ id: 'leg-press', name: 'Leg Press', loadType: 'plate_machine', horns: 1 });
    expect(() => buildPlanExercises(plans, [{ name: 'Barbell Row', loadType: 'barbell', horns: 2, why: 'x' }])).toThrow(/bad horns/);
    expect(() => buildPlanExercises(plans, [{ name: 'Leg Press', loadType: 'plate_machine', horns: 3 as 1, why: 'x' }])).toThrow(/bad horns/);
  });
});
