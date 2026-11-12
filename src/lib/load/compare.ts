// Comparing loads: the picked and compared weight, same resistance, table cells.
import type { Load, Unit } from '../../db/types';
import { toInt } from './exact';
import { heldWeightOf } from './loads';
import { sumLoad } from './sum';
import { convertForGym } from './units';

/** The picked weight of a stored load (see above), or null for a timed hold. */
export function pickedWeight(load: Load): number | null {
  switch (load.kind) {
    case 'dumbbell_each':
    case 'single':
      return heldWeightOf(load);
    case 'stack':
      return load.stackValue ?? load.total;
    case 'bodyweight':
      return load.added ?? 0;
    case 'timed':
      return null;
    default:
      return load.total;
  }
}

/** Same kind, unit and weight (to the 1e-9). */
export function sameLoad(a: Load, b: Load): boolean {
  return a.kind === b.kind && a.unit === b.unit && toInt(a.total) === toInt(b.total) && toInt(a.added ?? 0) === toInt(b.added ?? 0);
}

/** How close two loads in different units must be to count as the same resistance (in the first load's unit). */
export const SAME_RESISTANCE_TOLERANCE = 0.01;

/**
 * The same resistance, in any unit (PLAN 1.7i, records; progression eligibility PLAN 1.7k): same
 * load kind and the same compared weight (comparableWeight), exactly in one unit, else after
 * converting the second into the first one's unit, within SAME_RESISTANCE_TOLERANCE. Bodyweight with nothing added is the same in lb and kg.
 */
export function sameResistance(a: Load, b: Load): boolean {
  if (a.kind !== b.kind) return false;
  // Same unit: the complete resistance, exactly. A stack's pin and add-on split is not resistance
  // (100 pin + 25 added is the same 125 as a 125 pin, PLAN 1.7k).
  if (a.unit === b.unit) return toInt(comparableWeight(a, a.unit)) === toInt(comparableWeight(b, a.unit));
  if (a.kind === 'bodyweight' && !(a.added ?? 0) && !(b.added ?? 0)) return true;
  return Math.abs(comparableWeight(a, a.unit) - comparableWeight(b, a.unit)) <= SAME_RESISTANCE_TOLERANCE;
}

/** The weight a set table cell shows, number only (SPEC 21.1): the dumbbell (not the pair), the added weight on bodyweight, else the total. null for holds. */
export function cellWeight(load: Load): number | null {
  switch (load.kind) {
    case 'dumbbell_each':
      return heldWeightOf(load);
    case 'bodyweight':
      return load.added ?? 0;
    case 'timed':
      return null;
    default:
      return load.total;
  }
}

/**
 * The weight a record compares, in `unit` (PLAN 1.7c): the total for bars, machines and stacks,
 * one dumbbell for pairs, the added weight on bodyweight; converted when logged in the other unit.
 * Comparison only, never stored or shown.
 */
export function comparableWeight(load: Load, unit: Unit): number {
  const own = load.kind === 'stack' ? load.total : (pickedWeight(load) ?? 0);
  return convertForGym(own, load.unit, unit);
}

/** Plates on a bar or horn while its base weight is unknown: the "40 + bar" cell. */
export function platesOnly(perSide: readonly number[], unit: Unit): number {
  return sumLoad({ bar: 0, perSide, unit }).platesTotal;
}
