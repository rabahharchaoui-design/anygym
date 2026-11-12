// What one exercise can load at this gym (LoadSetup) and the loadable sleeve of a bar.
import type { BarId, Collars, DumbbellRange, Unit } from '../../db/types';
import { barSpec } from '../plates';

// ---------------------------------------------------------------- progression targets (SPEC 6)
//
// The progression engine (progression.ts) decides WHICH rule applies; every weight it suggests is
// made here. It works on the "picked weight": the one number the user picks on the input.
//   barbell, plate machine: the total · dumbbells and one weight: one dumbbell · stack: the pin ·
//   bodyweight: the added weight (0 = just you) · timed: none.

/** The loadable sleeve of a bar in the unit's length unit (a plate machine horn is an Olympic sleeve). */
export function sleeveOf(barId: BarId | 'horn', unit: Unit): number {
  return barSpec(barId === 'horn' ? 'olympic' : barId, unit).sleeve;
}

/** What one exercise can load at this gym, already resolved for that exercise. */
export type LoadSetup = {
  unit: Unit;
  /** Bar (barbell, Smith) or starting weight (plate machine). null = not known yet. Ignored by other kinds. */
  base: number | null;
  /** Enabled plate sizes. */
  plates: readonly number[];
  /** Collars on barbells; machines use 'none'. */
  collars: Collars;
  dumbbellRange: DumbbellRange | null;
  /** This machine's stack step. */
  stackStep: number;
  /**
   * One weight that is a plate held in the hands (plate twists, plate raises, PLAN 1.7j): the
   * gym's enabled plate weights are the choices, never the dumbbell range.
   */
  heldPlates?: readonly number[];
  /**
   * One weight with no list of what this gym has (a kettlebell, or an implement the name does not
   * tell, PLAN 1.7k): the weight is typed exactly as it is on the implement, never picked from or
   * rounded to the dumbbell range. Nothing is suggested above or below it (no step is known).
   */
  heldExact?: boolean;
  /** Loadable sleeve of the selected bar (load.ts sleeveOf); every plate solve and load respects it (PLAN 2.0f). */
  sleeveLength?: number;
};
