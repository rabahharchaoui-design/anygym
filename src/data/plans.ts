// The curated plans (SPEC 7.5, PLAN 1.10): static JSON bundled at build time, never copied into
// Dexie (SPEC 2: not user editable). Every exercise resolves to data/plan-exercises.json.
// PLAN 3.4a: a coach tuned copy (SPEC 22) is a curated plan plus the tips applied to it, all in its
// id ("five-day-split~coach-rest.pair"), so it is rebuilt the same everywhere and never stored.
import split5 from '../../data/plans/five-day-split.json';
import sixWeek from '../../data/plans/six-week-volume.json';
import { slugify } from '../lib/loadTypeRule';
import { normalizePlan, type Plan } from '../lib/plans';
import { parseTunedId, tunedPlan } from '../lib/coachTips';
import { planExercise } from './planExercises';
import { profileFor } from './order';

/** Name → plan exercise, by the same slug the generator uses. */
export const resolvePlanExercise = (name: string) => planExercise(slugify(name));

export const PLANS: Plan[] = [split5, sixWeek].map((raw) => normalizePlan(raw, resolvePlanExercise));

const BY_ID = new Map(PLANS.map((p) => [p.id, p]));

export function planById(id: string | undefined): Plan | undefined {
  if (id === undefined) return undefined;
  const plain = BY_ID.get(id);
  if (plain) return plain;
  const { baseId, tips } = parseTunedId(id);
  const base = BY_ID.get(baseId);
  if (!base || !tips.length) return undefined;
  const tuned = tunedPlan(base, tips, (x) => profileFor(x));
  // Only the canonical id of a copy that really differs (a stale or reordered id finds nothing).
  if (!tuned || tuned.id !== id) return undefined;
  BY_ID.set(id, tuned);
  return tuned;
}

/** The curated plan a plan (or its coach tuned copy) comes from. */
export function basePlanOf(id: string | undefined): Plan | undefined {
  return id === undefined ? undefined : BY_ID.get(parseTunedId(id).baseId);
}
