// Total lifted, and what makes a record (PLAN 2.2e): heavier, more volume, bigger gain.
import type { Load, Unit } from '../../db/types';
import { add, times } from './exact';
import { formatTotal } from './format';
import { comparableWeight, sameResistance, SAME_RESISTANCE_TOLERANCE } from './compare';
import { convertForGym } from './units';

// ---------------------------------------------------------------- totals (PLAN 1.7c, SPEC 21.1)

/**
 * Weight moved by one set: reps × the set's total, in the set's own unit (dumbbell pairs count
 * both dumbbells; bodyweight counts only the added weight, the body is not known). 0 for holds.
 */
export function setLifted(set: { reps?: number; seconds?: number; load?: Load }): number {
  if (!set.load || set.reps === undefined || set.load.kind === 'timed') return 0;
  return times(set.load.total, set.reps);
}

/** "Total lifted" over logged sets, in `unit`. A set in the other unit is converted for display only. */
export function totalLifted(sets: ReadonlyArray<{ reps?: number; seconds?: number; load?: Load }>, unit: Unit): number {
  return add(...sets.map((s) => (s.load ? convertForGym(setLifted(s), s.load.unit, unit) : 0)));
}

// ---------------------------------------------------------------- records (PLAN 2.2e)

/**
 * Best set volume of one set (SPEC 21.1): its compared weight (comparableWeight, in `unit`) ×
 * reps. 0 for holds, sets without reps and bodyweight with nothing added (no weight is known).
 */
export function setScore(set: { reps?: number; load: Load }, unit: Unit): number {
  if (set.load.kind === 'timed' || !set.reps || set.reps <= 0) return 0;
  return times(comparableWeight(set.load, unit), set.reps);
}

/** `a` is strictly heavier than `b` (compared in `unit`), never only by unit conversion noise. */
export function heavierThan(a: Load, b: Load, unit: Unit): boolean {
  return !sameResistance(a, b) && comparableWeight(a, unit) > comparableWeight(b, unit);
}

/**
 * Set `a` beats set `b` on best set volume: at the same resistance (any unit) only more reps do;
 * otherwise a bigger weight × reps by more than the conversion tolerance per rep.
 */
export function beatsVolume(a: { reps?: number; load: Load }, b: { reps?: number; load: Load }, unit: Unit): boolean {
  const ra = a.reps ?? 0;
  if (ra <= 0 || a.load.kind === 'timed') return false;
  if (sameResistance(a.load, b.load)) return ra > (b.reps ?? 0);
  return setScore(a, unit) - setScore(b, unit) > SAME_RESISTANCE_TOLERANCE * ra;
}

/**
 * How much heavier `now` is than `before`, in words for a record (PLAN 3.6b): "+10 lb",
 * "+5 lb each" (one dumbbell), "+2.5 kg", in the unit of `now`. null when it is not heavier
 * (heavierThan: never unit conversion noise) or the two are not the same kind of load.
 */
export function heavierBy(now: Load, before: Load): string | null {
  if (now.kind !== before.kind || !heavierThan(now, before, now.unit)) return null;
  // Thousands separated like every other total on screen ("+1,000 lb").
  const more = formatTotal(weightChange(comparableWeight(before, now.unit), comparableWeight(now, now.unit)), now.unit);
  return now.kind === 'dumbbell_each' ? `+${more} each` : `+${more}`;
}

/** How much bigger `now` is than `before` as a ratio (1.05 is 5% more); Infinity over a zero baseline. */
export function gainRatio(now: number, before: number): number {
  if (before <= 0) return now > 0 ? Number.POSITIVE_INFINITY : 1;
  return now / before;
}

/** Gain `a` is bigger than gain `b`, past floating noise (equal ratios stay a tie). */
export function biggerGain(a: number, b: number): boolean {
  return a === Number.POSITIVE_INFINITY ? b !== a : a - b > 1e-9;
}

/** How much a weight changed (to − from), exact. */
export function weightChange(from: number, to: number): number {
  return add(to, -from);
}
