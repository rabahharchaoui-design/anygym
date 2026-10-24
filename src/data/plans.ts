// The curated plans (SPEC 7.5, PLAN 1.10): static JSON bundled at build time, never copied into
// Dexie (SPEC 2: not user editable). Every exercise resolves to data/plan-exercises.json.
import ohrabah from '../../data/plans/ohrabah-split.json';
import sixWeek from '../../data/plans/six-week-volume.json';
import { slugify } from '../lib/loadTypeRule';
import { normalizePlan, type Plan } from '../lib/plans';
import { planExercise } from './planExercises';

/** Name → plan exercise, by the same slug the generator uses. */
export const resolvePlanExercise = (name: string) => planExercise(slugify(name));

export const PLANS: Plan[] = [ohrabah, sixWeek].map((raw) => normalizePlan(raw, resolvePlanExercise));

const BY_ID = new Map(PLANS.map((p) => [p.id, p]));

export function planById(id: string | undefined): Plan | undefined {
  return id === undefined ? undefined : BY_ID.get(id);
}
