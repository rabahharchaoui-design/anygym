// Dumbbell racks: ranges, nearest and next dumbbell, and the heaviest-dumbbell cap.
import type { DumbbellRange, Unit } from '../../db/types';
import { add, EPS, nearestCount, times, toInt } from './exact';
import { convertForGym } from './units';

/** Stored total for a dumbbell pair: 2 × each hand. */
export function dumbbellTotal(each: number): number {
  return times(each, 2);
}

/** The most dumbbells a range may list (a real rack has far fewer): bounds every generated list. */
export const MAX_DUMBBELLS = 400;

/** The smallest and largest dumbbell step a gym can have (PLAN 1.7k): finer steps are damage. */
export const MIN_DUMBBELL_STEP = 0.25;
export const MAX_DUMBBELL_STEP = 100;

/**
 * A range that makes sense (PLAN 1.7i, 1.7k): finite numbers, a step from 0.25 to 100, min ≥ 0,
 * max ≥ min and (max − min) / step at most MAX_DUMBBELLS. Anything else (step 0 or 1e-12 from a
 * damaged backup) lists nothing.
 */
export function validDumbbellRange(range: DumbbellRange): boolean {
  const { min, max, step } = range;
  if (![min, max, step].every(Number.isFinite) || step < MIN_DUMBBELL_STEP || step > MAX_DUMBBELL_STEP || min < 0 || max < min) return false;
  return add(max, -min) / step <= MAX_DUMBBELLS;
}

/** Every dumbbell in the range, lightest first; none for a range that is not valid (never loops). */
export function dumbbellsInRange(range: DumbbellRange): number[] {
  if (!validDumbbellRange(range)) return [];
  const out: number[] = [];
  // Bounded by construction: never more than MAX_DUMBBELLS + 1 weights, whatever the arithmetic.
  for (let n = 0; n <= MAX_DUMBBELLS; n++) {
    const w = add(range.min, times(range.step, n));
    if (w > range.max + EPS) break;
    out.push(w);
  }
  return out;
}

/** Nearest dumbbell (each hand) in the range; ties go lighter, clamped to the range. */
export function nearestDumbbell(target: number, range: DumbbellRange): number {
  const all = dumbbellsInRange(range);
  const n = Math.min(all.length - 1, Math.max(0, nearestCount(add(target, -range.min), range.step)));
  return all[n]!;
}

/** Next dumbbell up from `each`, or null at the top of the range. */
export function nextDumbbell(each: number, range: DumbbellRange): number | null {
  return dumbbellsInRange(range).find((w) => w > each + EPS) ?? null;
}

// PLAN 3.5j (G's hotel gym, "dumbbells up to 22 kg"): the range's max IS the gym's dumbbell cap. Every
// weight the app suggests or lists (the wheel, Next, the coach's raises, a reset) comes from
// dumbbellsInRange, so nothing heavier than `max` is ever offered. These helpers turn a heaviest
// dumbbell typed in either unit into that max, on the rack's own steps.

/** The heaviest dumbbell the rack has, or null for a range that is not valid. */
export function heaviestDumbbell(range: DumbbellRange | null | undefined): number | null {
  if (!range) return null;
  const all = dumbbellsInRange(range);
  return all.length ? all[all.length - 1]! : null;
}

/**
 * A heaviest dumbbell typed in `typedUnit`, as the rack's heaviest in the gym's unit: the heaviest
 * dumbbell on the rack (min + n × step) that is not heavier than what was typed, so a cap is never
 * rounded up (22 kg in a 5 lb step lb gym → 45 lb, never 50; 50 lb in a 2 kg step kg gym → 22 kg).
 * null when even the lightest is heavier, or the numbers are not a rack.
 */
export function dumbbellCapIn(value: number, typedUnit: Unit, gymUnit: Unit, min: number, step: number): number | null {
  if (![value, min, step].every(Number.isFinite) || step < MIN_DUMBBELL_STEP || step > MAX_DUMBBELL_STEP || min < 0) return null;
  const cap = convertForGym(value, typedUnit, gymUnit);
  // Converted values are not exact: anything within 1e-6 of a dumbbell counts as that dumbbell.
  const n = Math.floor((toInt(cap) - toInt(min)) / toInt(step) + 1e-6);
  if (n < 0) return null;
  return Math.min(add(min, times(step, n)), add(min, times(step, MAX_DUMBBELLS)));
}
