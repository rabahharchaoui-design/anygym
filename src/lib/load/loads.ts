// Building and reading Load records (SPEC 5.5).
import type { BarId, Collars, Load, Unit } from '../../db/types';
import { fitsSleeve } from '../plates';
import { dumbbellTotal } from './dumbbells';
import { add, fromInt, times, toInt } from './exact';
import { stackTotal } from './stack';
import { collarsWeight, sumLoad } from './sum';

// ---------------------------------------------------------------- Load records (SPEC 5.5)

/** Barbell: bar + 2 × perSide + collars. null while the bar weight is unknown (never a guess). */
export function barbellLoad(bar: number | null, perSide: readonly number[], collars: Collars, unit: Unit, barId?: BarId, sleeveLength?: number): Load | null {
  const { total, collarsTotal } = sumLoad({ bar, perSide, collars, unit });
  if (bar === null || total === null) return null;
  // Plates that do not fit this bar's sleeve are not a loading (PLAN 2.0f, SPEC 5.3).
  if (sleeveLength !== undefined && !fitsSleeve(perSide, unit, sleeveLength)) return null;
  const load: Load = { kind: 'barbell', unit, total, barWeight: bar, perSide: [...perSide], collars: collarsTotal };
  if (barId) load.barId = barId;
  return load;
}

/** Dumbbell pair, each hand: total = 2 × each. */
export function dumbbellLoad(each: number, unit: Unit): Load {
  return { kind: 'dumbbell_each', unit, total: dumbbellTotal(each) };
}

/** One weight held (goblet, kettlebell): total = the weight. */
export function singleLoad(weight: number, unit: Unit): Load {
  return { kind: 'single', unit, total: weight };
}

/** The dumbbell or held weight a dumbbell_each / single load was made from; null for any other load. */
export function heldWeightOf(load: Load | null | undefined): number | null {
  if (load?.kind === 'dumbbell_each') return fromInt(toInt(load.total) / 2);
  if (load?.kind === 'single') return load.total;
  return null;
}

/** Stack: the pin value plus optional added weight (plates on the pin). */
export function stackLoad(stackValue: number, unit: Unit, added = 0): Load {
  const load: Load = { kind: 'stack', unit, total: stackTotal(stackValue, added), stackValue };
  if (added > 0) load.added = added;
  return load;
}

/** Plate loaded machine: start + 2 × sum(perSide). null while the starting resistance is unknown (never a guess). */
export function plateMachineLoad(start: number | null, perSide: readonly number[], unit: Unit, sleeveLength?: number): Load | null {
  if (start === null) return null;
  if (sleeveLength !== undefined && !fitsSleeve(perSide, unit, sleeveLength)) return null;
  const total = sumLoad({ bar: start, perSide, unit }).total!;
  return { kind: 'plate_machine', unit, total, barWeight: start, perSide: [...perSide], collars: 0 };
}

/**
 * The collar weight a bar or plate machine load was lifted with (PLAN 1.7f), in the load's unit.
 * New loads store it. Older loads recover it as total − barWeight − 2 × sum(perSide) when that is
 * a real collar value (none, or the competition pair); anything else counts as 0. 0 for other kinds.
 */
export function collarsOf(load: Load): number {
  if (load.collars !== undefined) return load.collars;
  if (load.barWeight === undefined || !load.perSide) return 0;
  const rest = add(load.total, -load.barWeight, -times(add(...load.perSide), 2));
  const pair = collarsWeight('competition', load.unit);
  return Math.abs(rest - pair) < 1e-6 ? pair : 0;
}

/**
 * What a stored bar or plate machine total holds beyond bar, plates and collars (PLAN 1.7f): 0 for
 * every load this app builds; an older or imported record can carry a gap (stored 63 on 20 bar +
 * 2 × 20). Editing shows it as "3 other" so the stored total is never changed by just opening it.
 */
export function otherOf(load: Load): number {
  if (load.barWeight === undefined || !load.perSide) return 0;
  return add(load.total, -load.barWeight, -times(add(...load.perSide), 2), -collarsOf(load));
}

/** The collar setting a load was lifted with: editing a set uses this, never today's gym setting. */
export function collarsSettingOf(load: Load): Collars {
  return collarsOf(load) > 0 ? 'competition' : 'none';
}

/** Bodyweight: the body is not counted (it is not known); total is the added weight only, 0 with none. */
export function bodyweightLoad(unit: Unit, added = 0): Load {
  return added > 0 ? { kind: 'bodyweight', unit, total: added, added } : { kind: 'bodyweight', unit, total: 0 };
}

/** Timed hold: no load; the seconds live on the set. */
export function timedLoad(unit: Unit): Load {
  return { kind: 'timed', unit, total: 0 };
}
