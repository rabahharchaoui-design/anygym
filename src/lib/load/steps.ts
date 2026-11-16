// Stepping a picked weight: nearest loadable, one step up, one step down, and a reset.
import type { Load } from '../../db/types';
import { add, EPS, fromInt, toInt } from './exact';
import { heldChoices } from './held';
import { minPlateStep, roundToLoadable } from './increments';
import { plateOpts } from './loadAt';
import type { LoadSetup } from './setup';
import { lighterLoading, solvePlates } from './solver';
import { validDumbbellRange } from './dumbbells';

/** Nearest of a list (ties lighter), or null for an empty list. */
export function nearestOf(value: number, list: readonly number[]): number | null {
  let best: number | null = null;
  for (const w of list) if (best === null || Math.abs(toInt(w) - toInt(value)) < Math.abs(toInt(best) - toInt(value))) best = w;
  return best;
}

/**
 * Nearest picked weight this gym can load (ties lighter), e.g. after a unit conversion. null
 * when nothing can be loaded or the weight is not ours to round (added bodyweight, timed).
 */
export function nearestLoadable(kind: Load['kind'], value: number, s: LoadSetup): number | null {
  switch (kind) {
    case 'barbell':
    case 'plate_machine':
      return s.base === null ? null : roundToLoadable(value, { kind: 'plates', ...plateOpts(kind, s, s.base) });
    case 'single':
      if (s.heldPlates) return nearestOf(value, heldChoices(kind, s)!);
      // Typed exactly: no list to round to, so a converted or reset weight is never made up.
      if (s.heldExact) return null;
      return s.dumbbellRange && validDumbbellRange(s.dumbbellRange) ? roundToLoadable(value, { kind: 'dumbbell', range: s.dumbbellRange }) : null;
    case 'dumbbell_each':
      return s.dumbbellRange && validDumbbellRange(s.dumbbellRange) ? roundToLoadable(value, { kind: 'dumbbell', range: s.dumbbellRange }) : null;
    case 'stack':
      return roundToLoadable(value, { kind: 'stack', step: s.stackStep });
    case 'bodyweight':
      return toInt(value) === 0 ? 0 : null;
    case 'timed':
      return null;
  }
}

/**
 * One step up from a loadable picked weight (SPEC 6 rule 2): barbell and plate machines +5 lb /
 * +2.5 kg total, or the nearest loadable total above that when the plates cannot make it (PLAN
 * 3.6e: with 45s and 25s only, 135 goes to 145, never over it to 185), the next dumbbell up, the
 * next pin. null when there is no step up here (top of the rack, full sleeve, bodyweight, timed).
 */
export function stepUp(kind: Load['kind'], value: number, s: LoadSetup): number | null {
  switch (kind) {
    case 'barbell':
    case 'plate_machine': {
      if (s.base === null || !s.plates.length) return null;
      const target = add(value, minPlateStep(s.unit));
      const r = solvePlates(target, plateOpts(kind, s, s.base));
      return r.exact ? target : (r.above?.total ?? null);
    }
    case 'dumbbell_each':
    case 'single':
      // The next dumbbell up, or the next enabled plate up for a held plate. Typed exactly: none known.
      return heldChoices(kind, s)?.find((w) => w > value + EPS) ?? null;
    case 'stack':
      // The real stack size is not known: the next pin up (the user picks "More" if needed).
      return add(value, s.stackStep);
    case 'bodyweight':
    case 'timed':
      return null;
  }
}

/**
 * After a unit change, a rounding of up to this share is still the same weight (a 20 kg dumbbell and
 * a 45 lb one, 60 lb and 27.5 kg); more than that above is already a step up (13 kg and 30 lb).
 */
export const SAME_AFTER_CONVERTING = 0.025;

/**
 * One step up from what was really lifted, when this gym may not be able to make that weight
 * (another rack, another unit; PLAN 3.6e): the weight is never rounded up and then stepped again.
 * The nearest loadable weight, when it is already heavier (by more than `sameWithin`, a share), is
 * the step; else one stepUp from it. null when there is no step up here.
 */
export function stepUpFrom(kind: Load['kind'], value: number, s: LoadSetup, sameWithin = 0): number | null {
  const near = nearestLoadable(kind, value, s);
  if (near === null) return null;
  return toInt(near) > Math.round(toInt(value) * (1 + sameWithin)) ? near : stepUp(kind, near, s);
}

/**
 * The heaviest weight this gym can load that is not above `value` (PLAN 3.6e: "same load" on a rack
 * without that weight is never a heavier one). Nothing lighter here: the lightest there is. null
 * when nothing can be loaded or the weight is not ours to round.
 */
export function loadableAtMost(kind: Load['kind'], value: number, s: LoadSetup): number | null {
  const near = nearestLoadable(kind, value, s);
  if (near === null || toInt(near) <= toInt(value)) return near;
  return stepDown(kind, near, s) ?? near;
}

/**
 * About 10% lighter, rounded to a weight this gym can load (SPEC 6 rule 3). A stack with `added`
 * weight on the pin (PLAN 1.7i): 10% off the TOTAL resistance, the added weight kept, and the pin
 * that is left rounded to a loadable pin (100 pin + 100 added → 180 total → an 80 pin).
 */
export function resetWeight(kind: Load['kind'], value: number, s: LoadSetup, added = 0): number | null {
  if (kind === 'stack' && added > 0) {
    const total = fromInt(Math.round(toInt(add(value, added)) * 0.9));
    return nearestLoadable(kind, add(total, -added), s);
  }
  return nearestLoadable(kind, fromInt(Math.round(toInt(value) * 0.9)), s);
}

/**
 * One step down from a loadable picked weight: the mirror of stepUp (5 lb / 2.5 kg less on plates,
 * the next dumbbell down, the next pin down). null when nothing lighter can be loaded here.
 */
export function stepDown(kind: Load['kind'], value: number, s: LoadSetup): number | null {
  switch (kind) {
    case 'barbell':
    case 'plate_machine': {
      if (s.base === null || !s.plates.length) return null;
      // The nearest loadable total to one step down that is really lighter (PLAN 3.6w): across a
      // gap in the plates (a short sleeve, sparse plates) that is the heaviest lighter loading.
      return lighterLoading(value, minPlateStep(s.unit), plateOpts(kind, s, s.base))?.total ?? null;
    }
    case 'dumbbell_each':
    case 'single':
      return [...(heldChoices(kind, s) ?? [])].reverse().find((w) => w < value - EPS) ?? null;
    case 'stack': {
      const down = add(value, -s.stackStep);
      return down > EPS ? down : null;
    }
    case 'bodyweight':
    case 'timed':
      return null;
  }
}
