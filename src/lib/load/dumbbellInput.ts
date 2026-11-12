// A dumbbell range typed by hand: what is wrong with it, and the range it makes.
import type { DumbbellRange, Unit } from '../../db/types';
import { dumbbellCapIn, MAX_DUMBBELL_STEP, MIN_DUMBBELL_STEP, validDumbbellRange } from './dumbbells';
import { add } from './exact';
import { MAX_EXACT_HELD } from './held';

export type DumbbellRangeProblems = {
  min?: 'number' | 'zero';
  max?: 'number' | 'under-min' | 'too-heavy';
  step?: 'number' | 'too-small' | 'misses-max';
};

const typedNumber = (t: string): number | null => {
  const v = t.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/**
 * What is wrong with a dumbbell range typed by hand (PLAN 3.3, SPEC 3), per field, so "abc" in one
 * never blames another. Empty fields are simply not filled in yet. A comma counts as a point. A
 * step that can never land on the heaviest is a problem: those dumbbells would not exist.
 * PLAN 3.5j: `maxUnit`, the unit the heaviest was typed in ("22 kg" at a lb gym). In the other unit
 * the heaviest is a cap, not a dumbbell: it becomes the rack's heaviest at or under it
 * (dumbbellCapIn), so it can never miss the steps; under the lightest is the only problem left.
 */
export function dumbbellRangeProblems(min: string, max: string, step: string, unit: Unit, maxUnit: Unit = unit): DumbbellRangeProblems {
  const lo = typedNumber(min);
  const hi = typedNumber(max);
  const by = typedNumber(step);
  const out: DumbbellRangeProblems = {};
  if (Number.isNaN(lo)) out.min = 'number';
  else if (lo !== null && lo <= 0) out.min = 'zero';
  if (Number.isNaN(by)) out.step = 'number';
  else if (by !== null && (by < MIN_DUMBBELL_STEP || by > MAX_DUMBBELL_STEP)) out.step = 'too-small';
  if (Number.isNaN(hi)) out.max = 'number';
  else if (hi !== null && hi > MAX_EXACT_HELD[maxUnit]) out.max = 'too-heavy';
  else if (maxUnit !== unit) {
    if (hi !== null && lo !== null && by !== null && !out.min && !out.step && dumbbellCapIn(hi, maxUnit, unit, lo, by) === null) out.max = 'under-min';
    return out;
  } else if (hi !== null && lo !== null && !Number.isNaN(lo) && !out.min && hi < lo) out.max = 'under-min';
  if (!out.step && by !== null && lo !== null && hi !== null && !out.min && !out.max) {
    const steps = add(hi, -lo) / by;
    if (Math.abs(steps - Math.round(steps)) > 1e-6) out.step = 'misses-max';
  }
  return out;
}

/** The range, once all three fields are filled in with no problem; else null. `maxUnit`: see dumbbellRangeProblems. */
export function parseDumbbellRange(min: string, max: string, step: string, unit: Unit, maxUnit: Unit = unit): DumbbellRange | null {
  const problems = dumbbellRangeProblems(min, max, step, unit, maxUnit);
  if (problems.min || problems.max || problems.step) return null;
  const lo = typedNumber(min);
  const hi = typedNumber(max);
  const by = typedNumber(step);
  if (lo === null || hi === null || by === null) return null;
  const top = maxUnit === unit ? hi : dumbbellCapIn(hi, maxUnit, unit, lo, by);
  if (top === null) return null;
  const typed: DumbbellRange = { min: lo, max: top, step: by };
  return validDumbbellRange(typed) ? typed : null;
}
