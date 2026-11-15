// PLAN 3.6w (5): one step lighter is the nearest loadable total to one step down that is strictly
// lighter than the current weight; across a gap in the plates or a short sleeve, the heaviest
// lighter loading. Expected totals are enumerated by hand from the plates and thicknesses.
import { describe, expect, it } from 'vitest';
import { lighterLoading, scaledWeight, stepDown, type LoadSetup } from '../load';

const lb: LoadSetup = { unit: 'lb', base: 45, plates: [45, 25, 10, 5, 2.5], collars: 'none', dumbbellRange: null, stackStep: 5 };

describe('lighterLoading', () => {
  it('a full inventory: exactly one step down (lb and kg)', () => {
    expect(lighterLoading(225, 5, { bar: 45, inventory: [45, 25, 10, 5, 2.5], unit: 'lb' })).toEqual({ total: 220, perSide: [45, 25, 10, 5, 2.5] });
    expect(lighterLoading(100, 2.5, { bar: 20, inventory: [20, 10, 5, 2.5, 1.25], unit: 'kg' })?.total).toBe(97.5);
  });

  it('a gap: the heaviest lighter loading below the step', () => {
    // Per side one 25 or one 2.5 fits a 1.82 in sleeve: 35, 40, 85 lb.
    expect(lighterLoading(85, 5, { bar: 35, inventory: [25, 2.5], unit: 'lb', sleeveLength: 1.82 })).toEqual({ total: 40, perSide: [2.5] });
  });

  it('the loading just above the step when it is nearer and still lighter', () => {
    // Per side 0, 1.5, 2.5, 3, 4, ...: totals 20, 23, 25, 26. From 25 one 3 kg step is 22: 23 is nearer than 20.
    expect(lighterLoading(25, 3, { bar: 20, inventory: [2.5, 1.5], unit: 'kg' })?.total).toBe(23);
  });

  it('a tie goes lighter; the empty bar and a step that is not a step have nothing lighter', () => {
    // From 30 (5 a side) one 4 kg step is 26: 24 and 28 are both 2 away.
    expect(lighterLoading(30, 4, { bar: 20, inventory: [5, 2], unit: 'kg' })?.total).toBe(24);
    expect(lighterLoading(45, 5, { bar: 45, inventory: [45], unit: 'lb' })).toBeUndefined();
    expect(lighterLoading(135, 0, { bar: 45, inventory: [45], unit: 'lb' })).toBeUndefined();
    expect(lighterLoading(135, -5, { bar: 45, inventory: [45], unit: 'lb' })).toBeUndefined();
  });

  it('collars are part of every lighter total', () => {
    // 20 kg bar + 5 kg competition collars: 25, then 1.25 a side.
    expect(lighterLoading(30, 2.5, { bar: 20, inventory: [1.25], unit: 'kg', collars: 'competition' })?.total).toBe(27.5);
    expect(lighterLoading(25, 2.5, { bar: 20, inventory: [1.25], unit: 'kg', collars: 'competition' })).toBeUndefined();
  });
});

describe('stepDown and the lighter week use it', () => {
  it('plates: a step down, a fractional step, the empty bar', () => {
    expect(stepDown('barbell', 135, lb)).toBe(130);
    expect(stepDown('barbell', 45, lb)).toBeNull();
    expect(stepDown('plate_machine', 90, { ...lb, base: 0 })).toBe(85);
    expect(stepDown('barbell', 21, { ...lb, unit: 'kg', base: 20, plates: [0.5] })).toBe(20);
  });

  it('only 45s: 225 steps to 135, and a lighter week from 135 is 45', () => {
    const only45 = { ...lb, plates: [45] };
    expect(stepDown('barbell', 225, only45)).toBe(135);
    expect(scaledWeight('barbell', 135, 0.9, only45, true)).toBe(45);
  });
});
