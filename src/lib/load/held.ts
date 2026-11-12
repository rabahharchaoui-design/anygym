// Dumbbells and one held weight: the choices a gym has, and exactly typed weights.
import type { Load, Unit } from '../../db/types';
import { dumbbellsInRange } from './dumbbells';
import { fromInt, toInt } from './exact';
import { singleLoad } from './loads';
import type { LoadSetup } from './setup';

/**
 * The weights a dumbbell pair or one held weight can be at this gym, lightest first: the enabled
 * plates for a held plate (LoadSetup.heldPlates), else the dumbbell range. null for other kinds,
 * and for one weight typed exactly (LoadSetup.heldExact: there is no list).
 */
export function heldChoices(kind: Load['kind'], s: Pick<LoadSetup, 'dumbbellRange' | 'heldPlates' | 'heldExact'>): number[] | null {
  if (kind === 'single' && s.heldPlates) return [...new Set(s.heldPlates.filter((w) => Number.isFinite(w) && w > 0))].sort((a, b) => a - b);
  if (kind === 'single' && s.heldExact) return null;
  if (kind !== 'single' && kind !== 'dumbbell_each') return null;
  return s.dumbbellRange ? dumbbellsInRange(s.dumbbellRange) : [];
}

/** The most one typed weight can be (PLAN 1.7k): a guard against a slipped key, far above any real implement. */
export const MAX_EXACT_HELD: Record<Unit, number> = { lb: 500, kg: 250 };

/** The heaviest dumbbell or held weight this setup can give (the top of its list), or null with no list. */
export function heaviestHeld(kind: Load['kind'], s: Pick<LoadSetup, 'dumbbellRange' | 'heldPlates' | 'heldExact'>): number | null {
  const all = heldChoices(kind, s);
  return all && all.length ? all[all.length - 1]! : null;
}

/**
 * Why a typed exact weight cannot be used (PLAN 2.0d follow up): nothing typed ('empty'), past
 * MAX_EXACT_HELD ('over'), or not a weight above 0 ('zero'); null when exactHeldLoad accepts it.
 */
export function exactHeldProblem(value: number | null, unit: Unit): 'empty' | 'over' | 'zero' | null {
  if (value === null) return 'empty';
  if (value > MAX_EXACT_HELD[unit]) return 'over';
  return exactHeldLoad(value, unit) ? null : 'zero';
}

/**
 * A dumbbell or one held weight this gym can be at: one of its choices (heldChoices), or for a
 * weight typed exactly any real weight above 0 up to MAX_EXACT_HELD, to the 1e-9.
 */
export function heldAvailable(kind: Load['kind'], value: number, s: Pick<LoadSetup, 'unit' | 'dumbbellRange' | 'heldPlates' | 'heldExact'>): boolean {
  if (!Number.isFinite(value)) return false;
  if (kind === 'single' && s.heldExact && !s.heldPlates) return value > 0 && value <= MAX_EXACT_HELD[s.unit] && fromInt(toInt(value)) === value;
  return (heldChoices(kind, s) ?? []).some((w) => toInt(w) === toInt(value));
}

/** One held weight typed exactly (PLAN 1.7k), or null when it is not a weight (0, negative, too heavy). */
export function exactHeldLoad(value: number, unit: Unit): Load | null {
  return heldAvailable('single', value, { unit, dumbbellRange: null, heldExact: true }) ? singleLoad(value, unit) : null;
}
