import { describe, expect, it } from 'vitest';
import { defaultPlateInventory } from '../../db/gyms';
import { fitsSleeve, LENGTH_UNIT, PLATE_SPECS, plateSpec, SLEEVE_LENGTH, stackThickness } from '../plates';

describe('plate dimension tables (SPEC 5.3)', () => {
  it('has the SPEC lb dimensions', () => {
    expect(plateSpec(45, 'lb')).toMatchObject({ diameter: 17.01, thickness: 1.81, approx: false });
    expect(plateSpec(35, 'lb')).toMatchObject({ diameter: 14.92, thickness: 1.8 });
    expect(plateSpec(25, 'lb')).toMatchObject({ diameter: 12.6, thickness: 1.81 });
    expect(plateSpec(10, 'lb')).toMatchObject({ diameter: 10.04, thickness: 1.52 });
    expect(plateSpec(5, 'lb')).toMatchObject({ diameter: 7.24, thickness: 1.05 });
    expect(plateSpec(2.5, 'lb')).toMatchObject({ diameter: 6.34, thickness: 0.94 });
  });

  it('draws 55 and 100 lb at 17.7 in and 1.2 / 2.2 times the 45 thickness', () => {
    expect(plateSpec(55, 'lb')).toMatchObject({ diameter: 17.7, approx: true });
    expect(plateSpec(55, 'lb').thickness).toBeCloseTo(1.81 * 1.2, 12);
    expect(plateSpec(100, 'lb')).toMatchObject({ diameter: 17.7, approx: true });
    expect(plateSpec(100, 'lb').thickness).toBeCloseTo(1.81 * 2.2, 12);
  });

  it('has the SPEC kg dimensions and IWF colours, approx for change plates', () => {
    expect(plateSpec(25, 'kg')).toMatchObject({ diameter: 450, thickness: 64, color: 'red', approx: false });
    expect(plateSpec(20, 'kg')).toMatchObject({ diameter: 450, thickness: 54, color: 'blue' });
    expect(plateSpec(15, 'kg')).toMatchObject({ diameter: 450, thickness: 44, color: 'yellow' });
    expect(plateSpec(10, 'kg')).toMatchObject({ diameter: 450, thickness: 32, color: 'green' });
    expect(plateSpec(5, 'kg')).toMatchObject({ diameter: 230, thickness: 26, color: 'white', approx: true });
    expect(plateSpec(1.25, 'kg')).toMatchObject({ diameter: 160, thickness: 16, color: 'chrome', approx: true });
    expect(plateSpec(0.5, 'kg')).toMatchObject({ diameter: 135, thickness: 12, approx: true });
  });

  it('covers every plate in the gym inventories, heaviest first', () => {
    for (const unit of ['lb', 'kg'] as const) {
      const weights = PLATE_SPECS[unit].map((p) => p.weight);
      expect(weights).toEqual(defaultPlateInventory(unit).map((p) => p.weight));
    }
  });

  it('throws for an unknown plate instead of guessing', () => {
    expect(() => plateSpec(7, 'lb')).toThrow('Unknown lb plate: 7');
  });

  it('uses the Olympic sleeve 16.4 in / 415 mm', () => {
    expect(SLEEVE_LENGTH).toEqual({ lb: 16.4, kg: 415 });
    expect(LENGTH_UNIT).toEqual({ lb: 'in', kg: 'mm' });
  });
});

describe('fitsSleeve', () => {
  it('sums thickness per side', () => {
    expect(stackThickness([45, 25], 'lb')).toBeCloseTo(3.62, 12);
    expect(stackThickness([], 'kg')).toBe(0);
  });

  it('fits nine 45s but not ten on a lb sleeve', () => {
    expect(fitsSleeve(Array(9).fill(45), 'lb')).toBe(true); // 16.29 in
    expect(fitsSleeve(Array(10).fill(45), 'lb')).toBe(false); // 18.1 in
  });

  it('fits six 25 kg plates but not seven', () => {
    expect(fitsSleeve(Array(6).fill(25), 'kg')).toBe(true); // 384 mm
    expect(fitsSleeve(Array(7).fill(25), 'kg')).toBe(false); // 448 mm
  });

  it('accepts a custom sleeve length and an exact fit', () => {
    expect(fitsSleeve([25, 20], 'kg', 118)).toBe(true);
    expect(fitsSleeve([25, 20], 'kg', 117)).toBe(false);
    expect(fitsSleeve([100, 100, 100, 100], 'lb')).toBe(true); // 15.928 in
    expect(fitsSleeve([100, 100, 100, 100, 2.5], 'lb')).toBe(false);
  });
});
