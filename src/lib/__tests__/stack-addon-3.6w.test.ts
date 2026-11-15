// PLAN 3.6w (2), Codex bughunt 1112-1918 item 7: beginner test set targets and the lighter week keep
// a stack's add-on. Strength and limits come from the WHOLE resistance; the target is rebuilt as an
// explicit pin plus add-on, not above the intended total. Expected numbers are worked by hand.
import { describe, expect, it } from 'vitest';
import { pickedWeight, scaledTarget, scaledWeight, stackLoad, stackSplit, testSetLoad, testSetNumber, type LoadSetup } from '../load';

const lb: LoadSetup = { unit: 'lb', base: null, plates: [], collars: 'none', dumbbellRange: null, stackStep: 5 };
const kg: LoadSetup = { ...lb, unit: 'kg', stackStep: 2.5 };

describe('the bug as the screen computed it', () => {
  it('the pin alone gives 110 lb for 100 pin + 50 added × 10 (the add-on was dropped)', () => {
    const test = stackLoad(100, 'lb', 50);
    expect(testSetNumber('stack', pickedWeight(test)!, 10, 8, lb)).toBe(110);
  });
});

describe('stackSplit', () => {
  it('the heaviest pin under the add-on, never above the total (lb and kg)', () => {
    expect(stackSplit(165, 50, 5)).toEqual({ value: 115, added: 50 });
    expect(stackSplit(163, 50, 5)).toEqual({ value: 110, added: 50 });
    expect(stackSplit(67.5, 25, 2.5)).toEqual({ value: 42.5, added: 25 });
    expect(stackSplit(66, 25, 2.5)).toEqual({ value: 40, added: 25 });
  });

  it('an add-on that is not a whole step keeps the total under the intent', () => {
    // 2.5 lb add-on on a 5 lb stack: 135 → 130 pin + 2.5 = 132.5 (135 itself cannot be made with it).
    expect(stackSplit(135, 2.5, 5)).toEqual({ value: 130, added: 2.5 });
  });

  it('no pin fits under the add-on: the pin alone; nothing fits: null', () => {
    expect(stackSplit(40, 50, 5)).toEqual({ value: 40, added: 0 });
    expect(stackSplit(52, 50, 5)).toEqual({ value: 50, added: 0 });
    expect(stackSplit(120, 0, 5)).toEqual({ value: 120, added: 0 });
    expect(stackSplit(4, 0, 5)).toBeNull();
    expect(stackSplit(100, 50, 0)).toBeNull();
    expect(stackSplit(Number.NaN, 50, 5)).toBeNull();
  });
});

describe('testSetLoad', () => {
  it('100 lb pin + 50 lb added × 10 for 8 reps: 115 pin + 50 = 165 lb', () => {
    // Whole 150 × (10 + 3 left = 13 reps, Brzycki) = 225; for 10 reps 168.75; cap 180; stack steps → 165.
    expect(testSetLoad('stack', stackLoad(100, 'lb', 50), 10, 8, lb)).toEqual({ kind: 'stack', unit: 'lb', total: 165, stackValue: 115, added: 50 });
  });

  it('kg: 50 pin + 25 added × 10 for 8 reps: 57.5 pin + 25 = 82.5 kg', () => {
    // Whole 75 × 13 reps (Brzycki) = 112.5; for 10 reps 84.375; cap 90; 2.5 kg steps from 75 → 82.5.
    expect(testSetLoad('stack', stackLoad(50, 'kg', 25), 10, 8, kg)).toEqual({ kind: 'stack', unit: 'kg', total: 82.5, stackValue: 57.5, added: 25 });
  });

  it('a pin with nothing added and any other load: the same number as testSetNumber', () => {
    expect(testSetLoad('stack', stackLoad(100, 'lb'), 10, 8, lb)).toEqual({ kind: 'stack', unit: 'lb', total: 110, stackValue: 110 });
    const db: LoadSetup = { ...lb, dumbbellRange: { min: 5, max: 100, step: 5 } };
    // 40 lb each × 10: 60 for 13 reps, 45 for 10 reps, cap 48 → 45 each (90 total).
    expect(testSetLoad('dumbbell_each', { kind: 'dumbbell_each', unit: 'lb', total: 80 }, 10, 8, db)).toEqual({ kind: 'dumbbell_each', unit: 'lb', total: 90 });
  });

  it('nothing for another unit, another kind, a hold, or no number', () => {
    expect(testSetLoad('stack', stackLoad(100, 'kg', 50), 10, 8, lb)).toBeNull();
    expect(testSetLoad('single', stackLoad(100, 'lb', 50), 10, 8, lb)).toBeNull();
    expect(testSetLoad('timed', { kind: 'timed', unit: 'lb', total: 0 }, 10, 8, lb)).toBeNull();
    expect(testSetLoad('stack', stackLoad(100, 'lb', 50), 0, 8, lb)).toBeNull();
  });
});

describe('scaledTarget (the lighter week)', () => {
  it('150 lb (100 pin + 50) → 85 pin + 50 = 135; 75 kg (50 + 25) → 42.5 + 25 = 67.5', () => {
    expect(scaledTarget('stack', 100, 0.9, lb, true, 50)).toEqual({ value: 85, added: 50 });
    expect(scaledTarget('stack', 50, 0.9, kg, true, 25)).toEqual({ value: 42.5, added: 25 });
  });

  it('was a pin-only 135 before: the pin alone needed a stack the machine may not have', () => {
    expect(scaledWeight('stack', 100, 0.9, lb, true, 50)).toBe(135);
  });

  it('no add-on and other loads: scaledWeight, nothing added', () => {
    expect(scaledTarget('stack', 100, 0.9, lb, true)).toEqual({ value: 90, added: 0 });
    expect(scaledTarget('barbell', 225, 0.9, { ...lb, base: 45, plates: [45, 25, 10, 5, 2.5] }, true)).toEqual({ value: 200, added: 0 });
    expect(scaledTarget('barbell', 225, 0.9, lb, true)).toBeNull();
  });
});
