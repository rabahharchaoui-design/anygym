// Smallest load step and rounding to a weight the gym can load (SPEC 6).
import { stackStepFor } from '../../db/gyms';
import type { DumbbellRange, Gym, Load, Unit } from '../../db/types';
import { nearestDumbbell } from './dumbbells';
import { times } from './exact';
import { nearestLoading, type SolveOptions } from './solver';
import { nearestStack } from './stack';
import { enabledPlates } from './sum';

type GymLike = Pick<Gym, 'unit' | 'plateInventory' | 'dumbbellRange' | 'stackStep' | 'equipmentWeights'>;

/**
 * Smallest load step for SPEC 6 rule 2, in the gym unit.
 * Barbell and plate machines: 5 lb / 2.5 kg total, or one pair of the smallest enabled plate if
 * that is bigger (a step the gym cannot load is a lie). Dumbbells: the range step (next dumbbell
 * up). Stack: that machine's step. Bodyweight and timed: no load step (null). Null also when the
 * gym cannot make any step (no plates, no dumbbells).
 */
export function smallestIncrement(kind: Load['kind'], gym: GymLike, machineId?: string): number | null {
  switch (kind) {
    case 'barbell':
    case 'plate_machine':
      return plateIncrement(enabledPlates(gym.plateInventory), gym.unit);
    case 'dumbbell_each':
    case 'single':
      return gym.dumbbellRange ? gym.dumbbellRange.step : null;
    case 'stack':
      return machineId ? stackStepFor(gym, machineId) : gym.stackStep;
    case 'bodyweight':
    case 'timed':
      return null;
  }
}

/** 5 lb / 2.5 kg total, or one pair of the smallest plate if that is bigger. null with no plates. */
export function plateIncrement(plates: readonly number[], unit: Unit): number | null {
  if (!plates.length) return null;
  return Math.max(unit === 'lb' ? 5 : 2.5, times(Math.min(...plates), 2));
}

export type LoadableOptions =
  | ({ kind: 'plates' } & SolveOptions)
  | { kind: 'dumbbell'; range: DumbbellRange }
  | { kind: 'stack'; step: number; max?: number };

/**
 * Nearest weight the gym can actually load (ties go lighter). Used after convertForGym and for
 * the "−10%, rounded to a loadable weight" reset. Dumbbells are each hand.
 */
export function roundToLoadable(value: number, opts: LoadableOptions): number {
  switch (opts.kind) {
    case 'plates':
      return nearestLoading(value, opts).total;
    case 'dumbbell':
      return nearestDumbbell(value, opts.range);
    case 'stack':
      return nearestStack(value, opts.step, opts.max);
  }
}
