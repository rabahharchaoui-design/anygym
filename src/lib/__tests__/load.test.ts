import { describe, expect, it } from 'vitest';
import { defaultPlateInventory, makeGym } from '../../db/gyms';
import type { Collars, Unit } from '../../db/types';
import {
  add,
  collarsWeight,
  convertForGym,
  dumbbellsInRange,
  dumbbellTotal,
  enabledPlates,
  fitsSleeve,
  formatAmount,
  formatMathLine,
  formatWeight,
  KG_PER_LB,
  kgToLb,
  lbToKg,
  machineBase,
  nearestDumbbell,
  nearestStack,
  nextDumbbell,
  roundToLoadable,
  smallestIncrement,
  smithBase,
  solvePlates,
  stackTotal,
  sumLoad,
  type SolveOptions,
} from '../load';
import { PLATE_SPECS } from '../plates';

// ---------------------------------------------------------------- independent brute force helpers
// Integer hundredths of a unit (every plate in both inventories is a multiple of 0.01).
const H = (x: number): number => Math.round(x * 100);

/** All multisets of up to `max` plates from `sizes`, each heaviest first. */
function combos(sizes: number[], max: number): number[][] {
  const sorted = [...sizes].sort((a, b) => b - a);
  const out: number[][] = [];
  const walk = (start: number, acc: number[]) => {
    out.push(acc);
    if (acc.length === max) return;
    for (let i = start; i < sorted.length; i++) walk(i, [...acc, sorted[i]!]);
  };
  walk(0, []);
  return out;
}

/** Sleeve fit from raw thickness, independent of plates.ts helpers. */
function fitsRaw(perSide: number[], unit: Unit): boolean {
  const thickness = perSide.reduce((s, w) => s + PLATE_SPECS[unit].find((p) => p.weight === w)!.thickness, 0);
  return thickness <= (unit === 'lb' ? 16.4 : 415) + 1e-9;
}

const DEFAULT_BAR: Record<Unit, number> = { lb: 45, kg: 20 };
const ALL_PLATES = (unit: Unit) => defaultPlateInventory(unit).map((p) => p.weight);
const DEFAULT_PLATES = (unit: Unit) => enabledPlates(defaultPlateInventory(unit));

// ---------------------------------------------------------------- conversion

describe('unit conversion', () => {
  it('uses exactly 1 lb = 0.45359237 kg', () => {
    expect(KG_PER_LB).toBe(0.45359237);
    expect(lbToKg(100)).toBeCloseTo(45.359237, 9);
    expect(kgToLb(20)).toBeCloseTo(44.092452437, 9);
    expect(lbToKg(1)).toBe(0.45359237);
  });

  it('does not round when converting', () => {
    expect(kgToLb(lbToKg(132.5))).toBeCloseTo(132.5, 12);
    expect(lbToKg(60)).toBeCloseTo(27.2155422, 7);
  });

  it('convertForGym converts only across units', () => {
    expect(convertForGym(60, 'lb', 'lb')).toBe(60);
    expect(convertForGym(60, 'lb', 'kg')).toBe(lbToKg(60));
    expect(convertForGym(20, 'kg', 'lb')).toBe(kgToLb(20));
  });
});

// ---------------------------------------------------------------- sums

describe('sumLoad', () => {
  it('adds bar + 2 × plates exactly', () => {
    expect(sumLoad({ bar: 45, perSide: [45, 25], unit: 'lb' })).toEqual({ total: 185, platesTotal: 140, collarsTotal: 0 });
    expect(sumLoad({ bar: 20, perSide: [2.5, 1.25], unit: 'kg' }).total).toBe(27.5);
    expect(sumLoad({ bar: 20, perSide: [1.5, 1, 0.5, 1.25], unit: 'kg' }).total).toBe(28.5);
    expect(sumLoad({ bar: 45, perSide: [], unit: 'lb' }).total).toBe(45);
    expect(add(0.1, 0.2)).toBe(0.3);
    expect(add(2.5, 1.25)).toBe(3.75);
  });

  it('never guesses an unknown bar', () => {
    expect(sumLoad({ bar: null, perSide: [45], unit: 'lb' })).toEqual({ total: null, platesTotal: 90, collarsTotal: 0 });
  });

  it('adds competition collars: 2 × 2.5 kg, converted but not rounded in lb', () => {
    expect(collarsWeight('none', 'kg')).toBe(0);
    expect(collarsWeight('competition', 'kg')).toBe(5);
    expect(collarsWeight('competition', 'lb')).toBe(5 / 0.45359237);
    expect(sumLoad({ bar: 20, perSide: [20, 5], collars: 'competition', unit: 'kg' }).total).toBe(75);
    expect(sumLoad({ bar: 45, perSide: [45], collars: 'competition', unit: 'lb' }).total).toBeCloseTo(135 + 11.0231131092, 9);
  });

  for (const unit of ['lb', 'kg'] as const) {
    for (const [label, sizes] of [
      ['default', DEFAULT_PLATES(unit)],
      ['every', ALL_PLATES(unit)],
    ] as const) {
      it(`every combination of up to 6 plates per side sums exactly (${unit}, ${label} plates)`, () => {
        const all = combos(sizes, 6);
        let checked = 0;
        for (const bar of [0, DEFAULT_BAR[unit], 15.9]) {
          for (const collars of ['none', 'competition'] as Collars[]) {
            for (const perSide of all) {
              const expectedH = H(bar) + 2 * perSide.reduce((s, w) => s + H(w), 0) + (collars === 'competition' && unit === 'kg' ? 500 : 0);
              const { total, platesTotal } = sumLoad({ bar, perSide, collars, unit });
              expect(platesTotal).toBe((2 * perSide.reduce((s, w) => s + H(w), 0)) / 100);
              if (collars === 'competition' && unit === 'lb') expect(total!).toBeCloseTo(expectedH / 100 + 5 / KG_PER_LB, 8);
              else expect(total).toBe(expectedH / 100);
              checked++;
            }
          }
        }
        expect(checked).toBe(all.length * 6);
      });
    }
  }
});

// ---------------------------------------------------------------- solver

const opts = (unit: Unit, extra: Partial<SolveOptions> = {}): SolveOptions => ({
  bar: DEFAULT_BAR[unit],
  inventory: DEFAULT_PLATES(unit),
  unit,
  ...extra,
});

describe('solvePlates', () => {
  it('solves heaviest first', () => {
    expect(solvePlates(185, opts('lb'))).toEqual({ exact: true, total: 185, perSide: [45, 25] });
    expect(solvePlates(225, opts('lb'))).toEqual({ exact: true, total: 225, perSide: [45, 45] });
    expect(solvePlates(115, opts('lb'))).toEqual({ exact: true, total: 115, perSide: [35] });
    expect(solvePlates(100, opts('kg'))).toEqual({ exact: true, total: 100, perSide: [25, 15] });
    expect(solvePlates(27.5, opts('kg'))).toEqual({ exact: true, total: 27.5, perSide: [2.5, 1.25] });
    expect(solvePlates(45, opts('lb'))).toEqual({ exact: true, total: 45, perSide: [] });
  });

  it('gives the closest below and above with the difference', () => {
    expect(solvePlates(187, opts('lb'))).toEqual({
      exact: false,
      below: { total: 185, perSide: [45, 25] },
      above: { total: 190, perSide: [45, 25, 2.5] },
      diffBelow: 2,
      diffAbove: 3,
    });
    expect(solvePlates(28, opts('kg'))).toMatchObject({ exact: false, below: { total: 27.5 }, above: { total: 30 }, diffBelow: 0.5, diffAbove: 2 });
  });

  it('target under the bar: no below, above is the empty bar', () => {
    expect(solvePlates(30, opts('lb'))).toEqual({ exact: false, above: { total: 45, perSide: [] }, diffAbove: 15 });
  });

  it('respects the sleeve: an overflowing loading is not a solution', () => {
    // 10 × 45 per side would be 945 but needs 18.1 in of sleeve.
    const r = solvePlates(945, opts('lb'));
    expect(r.exact).toBe(false);
    if (r.exact) return;
    expect(r.above).toBeUndefined();
    expect(r.diffAbove).toBeUndefined();
    expect(fitsSleeve(r.below!.perSide, 'lb')).toBe(true);
    expect(r.below!.total).toBe(sumLoad({ bar: 45, perSide: r.below!.perSide, unit: 'lb' }).total);
    // 5 × 100 lb per side (19.9 in) does not fit; 4 × 100 + a 2.5 neither.
    const big = solvePlates(45 + 2 * 500, opts('lb', { inventory: ALL_PLATES('lb') }));
    expect(big.exact).toBe(false);
    if (!big.exact) expect(fitsSleeve(big.below!.perSide, 'lb')).toBe(true);
  });

  it('honours a custom sleeve length and max plates per side', () => {
    expect(solvePlates(225, opts('lb', { sleeveLength: 3 })).exact).toBe(false);
    expect(solvePlates(225, opts('lb', { sleeveLength: 3.62 }))).toEqual({ exact: true, total: 225, perSide: [45, 45] });
    expect(solvePlates(195, opts('lb', { maxPerSide: 2 }))).toMatchObject({ exact: false, below: { total: 185 }, above: { total: 205 } });
  });

  it('with no plates only the bar is loadable', () => {
    expect(solvePlates(100, opts('lb', { inventory: [] }))).toEqual({ exact: false, below: { total: 45, perSide: [] }, diffBelow: 55 });
    expect(solvePlates(45, opts('lb', { inventory: [] }))).toEqual({ exact: true, total: 45, perSide: [] });
  });

  it('includes collars in the target', () => {
    expect(solvePlates(75, opts('kg', { collars: 'competition' }))).toEqual({ exact: true, total: 75, perSide: [25] });
  });

  for (const unit of ['lb', 'kg'] as const) {
    for (const [label, sizes] of [
      ['default', DEFAULT_PLATES(unit)],
      ['every', ALL_PLATES(unit)],
    ] as const) {
      it(`solve then sum round trips for every fitting combination (${unit}, ${label} plates)`, () => {
        for (const perSide of combos(sizes, 6)) {
          if (!fitsRaw(perSide, unit)) continue;
          const total = (H(DEFAULT_BAR[unit]) + 2 * perSide.reduce((s, w) => s + H(w), 0)) / 100;
          const r = solvePlates(total, opts(unit, { inventory: sizes }));
          expect(r.exact).toBe(true);
          if (!r.exact) continue;
          expect(r.total).toBe(total);
          expect(sumLoad({ bar: DEFAULT_BAR[unit], perSide: r.perSide, unit }).total).toBe(total);
          expect(fitsRaw(r.perSide, unit)).toBe(true);
          expect(r.perSide).toEqual([...r.perSide].sort((a, b) => b - a));
        }
      });

      it(`nearest below and above match brute force over up to 6 plates per side (${unit}, ${label} plates)`, () => {
        const bar = DEFAULT_BAR[unit];
        const loadable = [
          ...new Set(
            combos(sizes, 6)
              .filter((p) => fitsRaw(p, unit))
              .map((p) => H(bar) + 2 * p.reduce((s, w) => s + H(w), 0)),
          ),
        ].sort((a, b) => a - b);
        const top = loadable[loadable.length - 1]!;
        const o = opts(unit, { inventory: sizes, maxPerSide: 6 });
        for (let th = H(bar) - 1000; th <= top + 1000; th += 25) {
          for (const nudge of [0, 10]) {
            const t = th + nudge;
            const r = solvePlates(t / 100, o);
            if (loadable.includes(t)) {
              expect(r).toMatchObject({ exact: true, total: t / 100 });
              continue;
            }
            expect(r.exact).toBe(false);
            if (r.exact) continue;
            const below = loadable.filter((x) => x < t).pop();
            const above = loadable.find((x) => x > t);
            expect(r.below?.total).toBe(below === undefined ? undefined : below / 100);
            expect(r.above?.total).toBe(above === undefined ? undefined : above / 100);
            if (below !== undefined) expect(H(r.diffBelow!)).toBe(t - below);
            if (above !== undefined) expect(H(r.diffAbove!)).toBe(above - t);
            for (const l of [r.below, r.above]) {
              if (!l) continue;
              expect(l.perSide.length).toBeLessThanOrEqual(6);
              expect(fitsRaw(l.perSide, unit)).toBe(true);
              expect(sumLoad({ bar, perSide: l.perSide, unit }).total).toBe(l.total);
            }
          }
        }
      });
    }
  }
});

// ---------------------------------------------------------------- Smith and plate loaded machines

describe('Smith machine and plate loaded machines', () => {
  it('Smith "plates only" counts plates only', () => {
    const bar = smithBase('plates_only')!;
    expect(bar).toBe(0);
    expect(solvePlates(90, opts('lb', { bar }))).toEqual({ exact: true, total: 90, perSide: [45] });
    expect(sumLoad({ bar, perSide: [45, 10], unit: 'lb' }).total).toBe(110);
    expect(formatMathLine(bar, [45], 'none', 'lb')).toBe('2 × 45 = 90 lb');
  });

  it('Smith with a sticker bar weight, unknown until answered', () => {
    expect(smithBase('bar', 25)).toBe(25);
    expect(smithBase('bar')).toBeNull();
    expect(sumLoad({ bar: smithBase('bar', 25), perSide: [45], unit: 'lb' }).total).toBe(115);
    expect(sumLoad({ bar: smithBase('bar'), perSide: [45], unit: 'lb' }).total).toBeNull();
  });

  it('plate loaded machine adds the starting resistance', () => {
    const base = machineBase(50)!;
    expect(sumLoad({ bar: base, perSide: [45, 45], unit: 'lb' }).total).toBe(230);
    expect(solvePlates(230, opts('lb', { bar: base }))).toEqual({ exact: true, total: 230, perSide: [45, 45] });
    expect(formatMathLine(base, [45, 45], 'none', 'lb', 'start')).toBe('50 start + 2 × (45 + 45) = 230 lb');
    expect(sumLoad({ bar: machineBase(0), perSide: [20], unit: 'kg' }).total).toBe(40);
    expect(sumLoad({ bar: machineBase(null), perSide: [20], unit: 'kg' })).toEqual({ total: null, platesTotal: 40, collarsTotal: 0 });
  });
});

// ---------------------------------------------------------------- stacks and dumbbells

describe('stacks', () => {
  it('stackTotal adds the pin and any added weight', () => {
    expect(stackTotal(50)).toBe(50);
    expect(stackTotal(47.5, 2.5)).toBe(50);
  });

  it('nearestStack snaps to the step, ties lighter, clamped', () => {
    expect(nearestStack(52, 5)).toBe(50);
    expect(nearestStack(52.5, 5)).toBe(50);
    expect(nearestStack(53, 5)).toBe(55);
    expect(nearestStack(7.4, 2.5)).toBe(7.5);
    expect(nearestStack(1, 5)).toBe(5);
    expect(nearestStack(200, 5, 150)).toBe(150);
    expect(nearestStack(200, 5, 152)).toBe(150);
    expect(nearestStack(100, 5, 150)).toBe(100);
  });
});

describe('dumbbells', () => {
  const lb = { min: 5, max: 50, step: 5 };
  const kg = { min: 2, max: 24, step: 2 };

  it('stores the pair total', () => {
    expect(dumbbellTotal(22.5)).toBe(45);
  });

  it('lists the range', () => {
    expect(dumbbellsInRange(lb)).toEqual([5, 10, 15, 20, 25, 30, 35, 40, 45, 50]);
    expect(dumbbellsInRange({ min: 1, max: 3, step: 0.5 })).toEqual([1, 1.5, 2, 2.5, 3]);
  });

  it('nearestDumbbell snaps into the range, ties lighter', () => {
    expect(nearestDumbbell(27, lb)).toBe(25);
    expect(nearestDumbbell(27.5, lb)).toBe(25);
    expect(nearestDumbbell(28, lb)).toBe(30);
    expect(nearestDumbbell(2, lb)).toBe(5);
    expect(nearestDumbbell(80, lb)).toBe(50);
    expect(nearestDumbbell(23, kg)).toBe(22);
    expect(nearestDumbbell(13.6, kg)).toBe(14);
  });

  it('nextDumbbell steps up, null at the top', () => {
    expect(nextDumbbell(25, lb)).toBe(30);
    expect(nextDumbbell(27, lb)).toBe(30);
    expect(nextDumbbell(50, lb)).toBeNull();
  });
});

// ---------------------------------------------------------------- progression helpers

describe('smallestIncrement', () => {
  const full = (unit: Unit) => makeGym({ name: 'G', type: 'full', unit });

  it('barbell: 5 lb / 2.5 kg total', () => {
    expect(smallestIncrement('barbell', full('lb'))).toBe(5);
    expect(smallestIncrement('barbell', full('kg'))).toBe(2.5);
    expect(smallestIncrement('plate_machine', full('lb'))).toBe(5);
  });

  it('never claims a step the plates cannot make', () => {
    const g = full('lb');
    g.plateInventory = g.plateInventory.map((p) => ({ ...p, enabled: p.weight >= 5 }));
    expect(smallestIncrement('barbell', g)).toBe(10);
    const k = full('kg');
    k.plateInventory = k.plateInventory.map((p) => ({ ...p, enabled: true }));
    expect(smallestIncrement('barbell', k)).toBe(2.5);
    const none = full('kg');
    none.plateInventory = none.plateInventory.map((p) => ({ ...p, enabled: false }));
    expect(smallestIncrement('barbell', none)).toBeNull();
  });

  it('dumbbells: next in range; stack: the machine step', () => {
    expect(smallestIncrement('dumbbell_each', full('lb'))).toBe(5);
    expect(smallestIncrement('single', full('kg'))).toBe(2);
    expect(smallestIncrement('dumbbell_each', makeGym({ name: 'H', type: 'home', unit: 'lb' }))).toBeNull();
    const g = full('lb');
    expect(smallestIncrement('stack', g)).toBe(5);
    expect(smallestIncrement('stack', g, 'leg_press')).toBe(5);
    g.equipmentWeights.lat_pulldown = { kind: 'stack_step', value: 10 };
    expect(smallestIncrement('stack', g, 'lat_pulldown')).toBe(10);
  });

  it('bodyweight and timed have no load step', () => {
    expect(smallestIncrement('bodyweight', full('lb'))).toBeNull();
    expect(smallestIncrement('timed', full('lb'))).toBeNull();
  });
});

describe('roundToLoadable', () => {
  it('converts a lb suggestion to the nearest loadable kg (SPEC 6.7: ≈ 27.5 kg, last time 60 lb)', () => {
    expect(roundToLoadable(convertForGym(60, 'lb', 'kg'), { kind: 'plates', ...opts('kg') })).toBe(27.5);
  });

  it('plates: exact, nearest, ties lighter, never below the bar', () => {
    expect(roundToLoadable(185, { kind: 'plates', ...opts('lb') })).toBe(185);
    expect(roundToLoadable(188.8, { kind: 'plates', ...opts('lb') })).toBe(190);
    expect(roundToLoadable(187.5, { kind: 'plates', ...opts('lb') })).toBe(185);
    expect(roundToLoadable(10, { kind: 'plates', ...opts('lb') })).toBe(45);
    expect(roundToLoadable(5000, { kind: 'plates', ...opts('lb', { inventory: [45] }) })).toBe(45 + 2 * 9 * 45);
  });

  it('dumbbells and stacks', () => {
    expect(roundToLoadable(kgToLb(12), { kind: 'dumbbell', range: { min: 5, max: 50, step: 5 } })).toBe(25);
    expect(roundToLoadable(0.9 * 100, { kind: 'stack', step: 5 })).toBe(90);
    expect(roundToLoadable(lbToKg(100), { kind: 'stack', step: 2.5, max: 100 })).toBe(45);
  });
});

// ---------------------------------------------------------------- display

describe('formatAmount and formatWeight', () => {
  it('shows real weights exactly, trailing zeros dropped', () => {
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(-0)).toBe('0');
    expect(formatAmount(60)).toBe('60');
    expect(formatAmount(2.5)).toBe('2.5');
    expect(formatAmount(102.5)).toBe('102.5');
    expect(formatAmount(132.5)).toBe('132.5');
    expect(formatAmount(1.25)).toBe('1.25');
    expect(formatAmount(133.75)).toBe('133.75');
    expect(formatAmount(add(20, 2.5, 1.25))).toBe('23.75');
  });

  it('rounds converted values to 1 decimal', () => {
    expect(formatAmount(kgToLb(20))).toBe('44.1');
    expect(formatAmount(lbToKg(60))).toBe('27.2');
    expect(formatAmount(lbToKg(100))).toBe('45.4');
    expect(formatAmount(45 + 90 + kgToLb(5))).toBe('146');
    expect(formatAmount(-lbToKg(1))).toBe('-0.5');
    expect(formatAmount(-0.001)).toBe('0');
  });

  it('appends the unit', () => {
    expect(formatWeight(102.5, 'kg')).toBe('102.5 kg');
    expect(formatWeight(185, 'lb')).toBe('185 lb');
  });
});

describe('formatMathLine', () => {
  it('matches SPEC 5.3 exactly', () => {
    expect(formatMathLine(45, [45, 25], 'none', 'lb')).toBe('45 bar + 2 × (45 + 25) = 185 lb');
    expect(formatMathLine(45, [45, 25], 'none', 'lb')).toContain('×');
  });

  it('unknown bar: "2 × 45 + bar", never a made up total', () => {
    expect(formatMathLine(null, [45], 'none', 'lb')).toBe('2 × 45 + bar');
    expect(formatMathLine(null, [45, 25], 'none', 'lb')).toBe('2 × (45 + 25) + bar');
    expect(formatMathLine(null, [20], 'competition', 'kg')).toBe('2 × 20 + 5 collars + bar');
    expect(formatMathLine(null, [], 'none', 'lb')).toBe('bar');
  });

  it('collars', () => {
    expect(formatMathLine(20, [20, 5], 'competition', 'kg')).toBe('20 bar + 2 × (20 + 5) + 5 collars = 75 kg');
    expect(formatMathLine(45, [45], 'competition', 'lb')).toBe('45 bar + 2 × 45 + 11 collars = 146 lb');
  });

  it('empty bar, plates only, change plates', () => {
    expect(formatMathLine(45, [], 'none', 'lb')).toBe('45 bar = 45 lb');
    expect(formatMathLine(0, [], 'none', 'lb')).toBe('0 bar = 0 lb');
    expect(formatMathLine(0, [25, 10], 'none', 'kg')).toBe('2 × (25 + 10) = 70 kg');
    expect(formatMathLine(20, [2.5, 1.25], 'none', 'kg')).toBe('20 bar + 2 × (2.5 + 1.25) = 27.5 kg');
  });
});
