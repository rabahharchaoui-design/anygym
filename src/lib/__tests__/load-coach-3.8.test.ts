import { describe, expect, it } from 'vitest';
import {
  COACH_MIN_ADD,
  formatBodyweight,
  MAX_ESTIMATE_REPS,
  emptyBarWeight,
  estimatedMax,
  levelUpWeight,
  loadAt,
  loadableUpTo,
  scaledWeight,
  stepDown,
  testSetNumber,
  warmUpLadder,
  weightChange,
  weightForReps,
  type LoadSetup,
} from '../load';
import { KG, LB } from './coach/fixtures';

// PLAN 3.8 (SPEC 15, 5.4): every weight the coach suggests is made in load.ts and is loadable.

const loadable = (kind: Parameters<typeof loadAt>[0], v: number, s: LoadSetup) => loadAt(kind, v, s) !== null;

describe('estimatedMax (internal only, never shown)', () => {
  it('one rep is the weight itself; Epley to 10 reps; Brzycki above; capped at 15', () => {
    expect(estimatedMax(100, 1)).toBe(100);
    expect(estimatedMax(100, 5)).toBeCloseTo(116.667, 2);
    expect(estimatedMax(100, 10)).toBeCloseTo(133.333, 2);
    expect(estimatedMax(100, 12)).toBeCloseTo(144, 6);
    expect(estimatedMax(100, 15)).toBeCloseTo((100 * 36) / 22, 6);
    expect(estimatedMax(100, 30)).toBe(estimatedMax(100, MAX_ESTIMATE_REPS));
    expect(estimatedMax(100, 5.9)).toBe(estimatedMax(100, 5));
  });
  it('nothing to estimate: no weight, no rep, not a number', () => {
    expect(estimatedMax(0, 5)).toBeNull();
    expect(estimatedMax(-5, 5)).toBeNull();
    expect(estimatedMax(100, 0)).toBeNull();
    expect(estimatedMax(Number.NaN, 5)).toBeNull();
    expect(estimatedMax(100, Number.POSITIVE_INFINITY)).toBeNull();
  });
  it('weightForReps is the inverse at every rep count', () => {
    for (let r = 1; r <= 15; r++) expect(weightForReps(estimatedMax(100, r)!, r)).toBeCloseTo(100, 9);
    expect(weightForReps(150, 0)).toBe(150);
    expect(weightForReps(150, 40)).toBeCloseTo(weightForReps(150, 15), 9);
  });
});

describe('levelUpWeight: about pct heavier, at least minAdd, in real loadable steps', () => {
  it('SPEC 15 defaults at an lb gym', () => {
    // Squat 200: +5% = 10, min +10 lb → 210. Bench 135: 2.5% = 3.4, min +5 → 140.
    expect(levelUpWeight('barbell', 200, { pct: 0.05, minAdd: COACH_MIN_ADD.lower.lb, capPct: 0.1 }, LB)).toBe(210);
    expect(levelUpWeight('barbell', 135, { pct: 0.025, minAdd: COACH_MIN_ADD.upper.lb, capPct: 0.05 }, LB)).toBe(140);
    // Squat 315 at 5%: 15.75 → the first loadable at or above 330.75 is 335, within the 10% cap.
    expect(levelUpWeight('barbell', 315, { pct: 0.05, minAdd: 10, capPct: 0.1 }, LB)).toBe(335);
  });
  it('SPEC 15 defaults at a kg gym', () => {
    expect(levelUpWeight('barbell', 100, { pct: 0.05, minAdd: COACH_MIN_ADD.lower.kg, capPct: 0.1 }, KG)).toBe(105);
    expect(levelUpWeight('barbell', 60, { pct: 0.025, minAdd: COACH_MIN_ADD.upper.kg, capPct: 0.05 }, KG)).toBe(62.5);
    expect(levelUpWeight('barbell', 140, { pct: 0.05, minAdd: 5, capPct: 0.1 }, KG)).toBe(147.5);
  });
  it('the minimum wins over the cap on a light weight: an empty bar squat goes up 10 lb', () => {
    expect(levelUpWeight('barbell', 45, { pct: 0.05, minAdd: 10, capPct: 0.1 }, LB)).toBe(55);
  });
  it('never past the cap, unless the very next weight already is (the smallest step there is)', () => {
    expect(levelUpWeight('barbell', 200, { pct: 0.3, minAdd: 0, capPct: 0.1 }, LB)).toBe(220);
    // Dumbbells go up by 5: 20 → 25 is 25%, still the smallest jump possible.
    expect(levelUpWeight('dumbbell_each', 20, { pct: 0.025, minAdd: 5, capPct: 0.05 }, LB)).toBe(25);
    expect(levelUpWeight('stack', 100, { pct: 0, minAdd: 0, capPct: 0 }, LB)).toBe(105);
  });
  it('null when there is no step up here', () => {
    expect(levelUpWeight('dumbbell_each', 100, { pct: 0.05, minAdd: 5, capPct: 0.05 }, LB)).toBeNull();
    expect(levelUpWeight('barbell', 100, { pct: 0.05, minAdd: 5, capPct: 0.1 }, { ...LB, base: null })).toBeNull();
    expect(levelUpWeight('bodyweight', 0, { pct: 0.05, minAdd: 5, capPct: 0.1 }, LB)).toBeNull();
  });
  it('every raise is loadable and at least the minimum, for every loadable bar weight up to 405 lb / 180 kg', () => {
    for (const [s, top, step] of [[LB, 405, 5], [KG, 180, 2.5]] as const) {
      for (let v = s.base!; v <= top; v += step) {
        const up = levelUpWeight('barbell', v, { pct: 0.05, minAdd: COACH_MIN_ADD.lower[s.unit], capPct: 0.1 }, s);
        expect(up, `${v} ${s.unit}`).not.toBeNull();
        expect(loadable('barbell', up!, s)).toBe(true);
        expect(up! - v).toBeGreaterThanOrEqual(COACH_MIN_ADD.lower[s.unit] - 1e-9);
        expect(up! - v).toBeLessThanOrEqual(Math.max(v * 0.1, COACH_MIN_ADD.lower[s.unit]) + 1e-9);
      }
    }
  });
});

describe('stepDown and scaledWeight (lighter weeks)', () => {
  it('one step down for each kind, null when nothing is lighter', () => {
    expect(stepDown('barbell', 185, LB)).toBe(180);
    expect(stepDown('barbell', 45, LB)).toBeNull();
    expect(stepDown('barbell', 185, { ...LB, base: null })).toBeNull();
    expect(stepDown('barbell', 185, { ...LB, plates: [] })).toBeNull();
    expect(stepDown('plate_machine', 90, { ...LB, base: 0 })).toBe(85);
    expect(stepDown('dumbbell_each', 25, LB)).toBe(20);
    expect(stepDown('dumbbell_each', 5, LB)).toBeNull();
    expect(stepDown('single', 30, KG)).toBe(28);
    expect(stepDown('stack', 50, LB)).toBe(45);
    expect(stepDown('stack', 5, LB)).toBeNull();
    expect(stepDown('bodyweight', 10, LB)).toBeNull();
    expect(stepDown('timed', 0, LB)).toBeNull();
  });
  it('about 90%, loadable; lighter is really lighter on coarse steps', () => {
    expect(scaledWeight('barbell', 200, 0.9, LB, true)).toBe(180);
    expect(scaledWeight('barbell', 102.5, 0.9, KG, true)).toBe(92.5);
    // 25 lb dumbbells: 22.5 rounds (ties lighter) to 20.
    expect(scaledWeight('dumbbell_each', 25, 0.9, LB, true)).toBe(20);
    // 10 lb dumbbells: 9 rounds back to 10, so one step down instead.
    expect(scaledWeight('dumbbell_each', 10, 0.9, LB, true)).toBe(5);
    expect(scaledWeight('dumbbell_each', 10, 0.9, LB, false)).toBe(10);
    expect(scaledWeight('dumbbell_each', 5, 0.9, LB, true)).toBeNull();
    expect(scaledWeight('barbell', 200, 0.9, { ...LB, base: null }, true)).toBeNull();
    expect(scaledWeight('stack', 100, 0.9, LB, true)).toBe(90);
  });
  it('weightChange is exact', () => {
    expect(weightChange(132.5, 137.5)).toBe(5);
    expect(weightChange(0.1, 0.3)).toBe(0.2);
  });
});

describe('warmUpLadder: empty bar × 10, about 50% × 5, about 75% × 3', () => {
  it('a 185 lb squat', () => {
    expect(warmUpLadder('barbell', 185, LB)).toEqual([
      { value: 45, reps: 10 },
      { value: 90, reps: 5 },
      { value: 140, reps: 3 },
    ]);
  });
  it('a 100 kg squat', () => {
    expect(warmUpLadder('barbell', 100, KG)).toEqual([
      { value: 20, reps: 10 },
      { value: 50, reps: 5 },
      { value: 75, reps: 3 },
    ]);
  });
  it('drops steps that are not lighter than the work, or not heavier than the step before', () => {
    // 65 lb: 50% rounds to the bar (already the first step), 75% is 50.
    expect(warmUpLadder('barbell', 65, LB)).toEqual([
      { value: 45, reps: 10 },
      { value: 50, reps: 3 },
    ]);
    expect(warmUpLadder('barbell', 45, LB)).toEqual([]);
  });
  it('dumbbells and stacks start light, about 30%', () => {
    expect(warmUpLadder('dumbbell_each', 60, LB)).toEqual([
      { value: 20, reps: 10 },
      { value: 30, reps: 5 },
      { value: 45, reps: 3 },
    ]);
    expect(warmUpLadder('stack', 100, LB)).toEqual([
      { value: 30, reps: 10 },
      { value: 50, reps: 5 },
      { value: 75, reps: 3 },
    ]);
  });
  it('nothing for bodyweight, holds, an unknown bar, a Smith counted as plates only, or no work weight', () => {
    expect(warmUpLadder('bodyweight', 20, LB)).toEqual([]);
    expect(warmUpLadder('timed', 0, LB)).toEqual([]);
    expect(warmUpLadder('barbell', 185, { ...LB, base: null })).toEqual([]);
    expect(warmUpLadder('plate_machine', 180, { ...LB, base: null })).toEqual([]);
    expect(warmUpLadder('barbell', 0, LB)).toEqual([]);
    // Plates only Smith (base 0): no "empty bar", only the percent steps.
    expect(warmUpLadder('barbell', 100, { ...LB, base: 0 })).toEqual([
      { value: 50, reps: 5 },
      { value: 75, reps: 3 },
    ]);
  });
  it('every warm up is loadable at the gym, for many work weights', () => {
    for (const s of [LB, KG]) {
      for (let w = 60; w <= 300; w += 5) {
        for (const step of warmUpLadder('barbell', w, s)) expect(loadable('barbell', step.value, s)).toBe(true);
      }
    }
  });
});

describe("testSetNumber: a first timer's number from the light test set", () => {
  it('10 easy reps at 95 lb, aiming at 8: 105 lb', () => {
    expect(testSetNumber('barbell', 95, 10, 8, LB)).toBe(105);
  });
  it('never lighter than the test, at most 20% heavier, loadable', () => {
    expect(testSetNumber('barbell', 95, 3, 12, LB)).toBe(95);
    const n = testSetNumber('dumbbell_each', 20, 15, 8, LB)!;
    expect(n).toBeGreaterThanOrEqual(20);
    expect(n).toBeLessThanOrEqual(24);
    expect(loadable('dumbbell_each', n, LB)).toBe(true);
    expect(testSetNumber('barbell', 40, 10, 8, KG)).toBe(45);
  });
  it('null when there is nothing to go on', () => {
    expect(testSetNumber('bodyweight', 10, 10, 8, LB)).toBeNull();
    expect(testSetNumber('timed', 0, 10, 8, LB)).toBeNull();
    expect(testSetNumber('barbell', 0, 10, 8, LB)).toBeNull();
    expect(testSetNumber('barbell', 95, 0, 8, LB)).toBeNull();
  });
  it('loadableUpTo walks real steps only', () => {
    expect(loadableUpTo('barbell', 95, 107, LB)).toBe(105);
    expect(loadableUpTo('barbell', 95, 96, LB)).toBe(95);
    expect(loadableUpTo('dumbbell_each', 100, 200, LB)).toBe(100);
  });
});

describe('load.ts stays fully covered (SPEC 5.4)', () => {
  it('formatBodyweight keeps one decimal', () => {
    expect(formatBodyweight(72.5)).toBe('72.5');
    expect(formatBodyweight(70)).toBe('70.0');
  });
});

// PLAN 3.8b: the empty bar warm up is the bar as this gym loads it, competition collars included.
describe('emptyBarWeight (PLAN 3.8b)', () => {
  const women: LoadSetup = { unit: 'kg', base: 15, plates: [25, 20, 15, 10, 5, 2.5, 1.25], collars: 'competition', sleeveLength: 320, dumbbellRange: null, stackStep: 2.5 };
  it('adds competition collars to the bar, none for spring clips, null for an unknown bar', () => {
    expect(emptyBarWeight(women)).toBe(20);
    expect(emptyBarWeight({ ...women, collars: 'none' })).toBe(15);
    expect(emptyBarWeight({ ...women, base: null })).toBeNull();
    expect(emptyBarWeight({ ...women, base: 20 })).toBe(25);
  });
  it('the ladder starts at that weight and every step can be loaded', () => {
    const ladder = warmUpLadder('barbell', 100, women);
    expect(ladder[0]).toEqual({ value: 20, reps: 10 });
    for (const step of ladder) expect(loadAt('barbell', step.value, women)).not.toBeNull();
  });
});
