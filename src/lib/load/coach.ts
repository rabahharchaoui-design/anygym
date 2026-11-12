// The coach's weights (SPEC 15, PLAN 3.8): strength estimate, deload, level up, warm up, test set.
import type { Load, Unit } from '../../db/types';
import { add, EPS, fromInt, scale, toInt } from './exact';
import { loadAt } from './loadAt';
import type { LoadSetup } from './setup';
import { stackTotal, validStackStep } from './stack';
import { nearestLoadable, stepDown, stepUp } from './steps';
import { collarsWeight } from './sum';

// ---------------------------------------------------------------- the coach (SPEC 15, PLAN 3.8)
//
// Every weight the coach suggests is made here, like progression's. The strength estimate below is
// INTERNAL ONLY: SPEC 6 says no estimated 1 rep max is ever shown; the coach compares lifts with it.

/** Most reps a set may count for in a strength estimate (SPEC 15). */
export const MAX_ESTIMATE_REPS = 15;

/**
 * Estimated one rep max of one set (SPEC 15), internal only: Epley for 2 to 10 reps, Brzycki above
 * 10, reps capped at 15; one rep is the weight itself. null without a weight or a rep.
 */
export function estimatedMax(weight: number, reps: number): number | null {
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps < 1) return null;
  const r = Math.min(Math.floor(reps), MAX_ESTIMATE_REPS);
  if (r === 1) return weight;
  return r <= 10 ? weight * (1 + r / 30) : (weight * 36) / (37 - r);
}

/** The weight a strength estimate says can be done for `reps` (the inverse of estimatedMax). */
export function weightForReps(max: number, reps: number): number {
  const r = Math.min(Math.max(1, Math.floor(reps)), MAX_ESTIMATE_REPS);
  if (r === 1) return max;
  return r <= 10 ? max / (1 + r / 30) : (max * (37 - r)) / 36;
}

/** The smallest coach raise for a compound lift (SPEC 15): lower body +10 lb / +5 kg, upper +5 lb / +2.5 kg. */
export const COACH_MIN_ADD: Record<'lower' | 'upper', Record<Unit, number>> = { lower: { lb: 10, kg: 5 }, upper: { lb: 5, kg: 2.5 } };

/**
 * About `factor` of a weight, rounded to the nearest weight this gym can load (deload, welcome
 * back: 0.9). When `lighter` and the rounding lands on the weight itself (coarse dumbbell steps),
 * one step down instead, so a lighter week is really lighter. null when nothing fits.
 */
export function scaledWeight(kind: Load['kind'], value: number, factor: number, s: LoadSetup, lighter = false, added = 0): number | null {
  // A stack pin with weight added on top: the factor applies to the whole resistance (pin + added),
  // like levelUpWeight. The result is a pin only (the added weight is not carried into the target).
  const whole = kind === 'stack' && added > 0 ? stackTotal(value, added) : value;
  const near = nearestLoadable(kind, scale(whole, factor), s);
  if (near === null) return null;
  if (lighter && factor < 1 && near >= whole - EPS) return stepDown(kind, whole, s);
  return near;
}

export type LevelUpRule = {
  /** Share to add, 0.05 = about 5%. */
  pct: number;
  /** At least this much more (COACH_MIN_ADD, or 0). */
  minAdd: number;
  /**
   * Never more than this share above (or `minAdd`, when that is more: SPEC 15's minimum wins on a
   * light weight), unless the very next loadable weight already is (the smallest step there is).
   */
  capPct: number;
};

/**
 * The coach's raise for one lift (SPEC 15 Level up): about `pct` heavier and at least `minAdd`
 * more, walked up in real loadable steps (load.ts stepUp), so it is always a weight this gym can
 * load. The first step up is always allowed (the smallest jump there is); later steps only while
 * they stay within `capPct`. null when there is no step up here (top of the rack, a full sleeve).
 */
export function levelUpWeight(kind: Load['kind'], value: number, rule: LevelUpRule, s: LoadSetup, added = 0): number | null {
  // A stack pin with weight added on top: the raise is worked out from the whole resistance (pin +
  // added), so the percentage and the minimum are never understated, and the pin it lands on is
  // always heavier than what was lifted (the target is a pin only). The walk starts at the highest
  // pin at or under that total; the first step up is above it.
  let start = value;
  let base = value;
  if (kind === 'stack' && added > 0) {
    const step = s.stackStep;
    base = stackTotal(value, added);
    if (validStackStep(step)) start = fromInt(Math.floor(toInt(base) / toInt(step) + EPS) * toInt(step));
  }
  const want = add(base, Math.max(scale(base, rule.pct), rule.minAdd));
  const cap = add(base, Math.max(scale(base, rule.capPct), rule.minAdd));
  let best: number | null = null;
  let at = start;
  for (let i = 0; i < 400; i++) {
    const up = stepUp(kind, at, s);
    if (up === null || up <= at + EPS) break;
    if (best !== null && up > cap + EPS) break;
    best = up;
    at = up;
    if (up >= want - EPS) break;
  }
  return best;
}

/**
 * What the empty bar weighs at this gym, as the lifter loads it: the bar plus any competition collars
 * (PLAN 3.8b: a women's 15 kg bar with 5 kg collars is a 20 kg warm up, never 15). null when the bar
 * is not known or this gym cannot load that weight exactly.
 */
export function emptyBarWeight(s: LoadSetup): number | null {
  if (s.base === null || !(s.base > 0)) return null;
  const total = add(s.base, collarsWeight(s.collars, s.unit));
  return loadAt('barbell', total, s)?.total ?? null;
}

/** One warm up set (SPEC 15): a picked weight and its reps. */
export type WarmUp = { value: number; reps: number };

/**
 * The warm up ladder before the first heavy lift of the day (SPEC 15): the empty bar (or about 30%
 * on anything else) × 10, about 50% × 5, about 75% × 3, each rounded to what this gym can load.
 * Only steps lighter than the working weight and heavier than the step before are kept; nothing
 * for bodyweight, holds or a bar whose weight is not known.
 */
export function warmUpLadder(kind: Load['kind'], work: number, s: LoadSetup): WarmUp[] {
  if (kind === 'bodyweight' || kind === 'timed' || !(work > 0)) return [];
  if ((kind === 'barbell' || kind === 'plate_machine') && s.base === null) return [];
  const first: number | null = kind === 'barbell' ? emptyBarWeight(s) : nearestLoadable(kind, scale(work, 0.3), s);
  const steps: Array<[number | null, number]> = [
    [first, 10],
    [nearestLoadable(kind, scale(work, 0.5), s), 5],
    [nearestLoadable(kind, scale(work, 0.75), s), 3],
  ];
  const out: WarmUp[] = [];
  for (const [value, reps] of steps) {
    if (value === null || value <= EPS || value >= work - EPS) continue;
    if (out.length && value <= out[out.length - 1]!.value + EPS) continue;
    out.push({ value, reps });
  }
  return out;
}

/**
 * The highest weight this gym can load from `value` up to `limit`, walking real steps (stepUp):
 * `value` itself when no step fits.
 */
export function loadableUpTo(kind: Load['kind'], value: number, limit: number, s: LoadSetup): number {
  let at = value;
  for (let i = 0; i < 400; i++) {
    const up = stepUp(kind, at, s);
    if (up === null || up <= at + EPS || up > limit + EPS) break;
    at = up;
  }
  return at;
}

/** A first timer's test set gives the working number (SPEC 15) at most this much heavier. */
export const TEST_SET_CAP = 0.2;

/**
 * A first timer's number from their light test set (SPEC 15 "Start light: 10 easy reps, then
 * we'll set your number"): 10 or more reps count as easy (about 3 left, SPEC 15 Easy), fewer as
 * about 1 left. The number is what that strength does for `targetReps` with 2 reps to spare (SPEC 6
 * first time rule), never lighter than the test weight, at most 20% heavier, loadable here.
 */
export function testSetNumber(kind: Load['kind'], value: number, reps: number, targetReps: number, s: LoadSetup): number | null {
  if (kind === 'bodyweight' || kind === 'timed' || !(value > 0) || reps < 1) return null;
  const left = reps >= 10 ? 3 : 1;
  const max = estimatedMax(value, reps + left);
  if (max === null) return null;
  const want = weightForReps(max, targetReps + 2);
  return loadableUpTo(kind, value, Math.min(want, add(value, scale(value, TEST_SET_CAP))), s);
}
