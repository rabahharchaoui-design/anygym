// The curated plans (SPEC 7.5, PLAN 1.10): static JSON bundled at build time, never copied into
// Dexie (SPEC 2: not user editable). Every exercise resolves to data/plan-exercises.json, or for the
// generated plans (PLAN 3.5) to a ladder candidate of data/patterns.json by its own id.
// PLAN 3.4a: a coach tuned copy (SPEC 22) is a curated plan plus the tips applied to it, all in its
// id ("five-day-split~coach-rest.pair"), so it is rebuilt the same everywhere and never stored.
// PLAN 3.5: a plan generated from someone's answers is saved on the phone (db/savedPlans.ts) and
// registered here when the app starts, so every screen finds it the same way as a curated plan.
import split5 from '../../data/plans/five-day-split.json';
import sixWeek from '../../data/plans/six-week-volume.json';
import hotel3 from '../../data/plans/hotel-gym-3-day.json';
import noEquipment3 from '../../data/plans/no-equipment-3-day.json';
import beginner3 from '../../data/plans/beginner-full-body-3-day.json';
import { slugify } from '../lib/loadTypeRule';
import { normalizePlan, type Plan } from '../lib/plans';
import { parseTunedId, tunedPlan } from '../lib/coachTips';
import { workoutIdOf } from '../lib/swap';
import { planExercise } from './planExercises';
import { profileFor } from './order';
import { SWAP_DATA } from './patterns';
import { CATALOG_NAMES } from './importMatch';
import { approvedCandidate } from './candidateGate';

const CATALOG_NAME = new Map(CATALOG_NAMES.map((c) => [c.id, c.name]));
/** Ids a generated plan may hold: every ladder candidate's (its plan id, else its catalog id). */
const LADDER_IDS = new Set(Object.values(SWAP_DATA.patterns).flatMap((l) => l.candidates.map(workoutIdOf)));

/** Name → plan exercise, by the same slug the generator uses; with an id (generated plans), that id. */
export const resolvePlanExercise = (name: string, id?: string) => {
  if (id === undefined) return planExercise(slugify(name));
  const known = planExercise(id);
  if (known) return known;
  const catalogName = LADDER_IDS.has(id) ? CATALOG_NAME.get(id) : undefined;
  if (catalogName) return { id, name: catalogName };
  // PLAN 3.5j: a move G approved on this phone (a cardio warm up, a ladder candidate) runs as itself.
  const approved = approvedCandidate(id);
  return approved ? { id, name: approved.name } : undefined;
};

/** The shipped plans, in picker order. */
export const PLANS: Plan[] = [split5, sixWeek, hotel3, noEquipment3, beginner3].map((raw) => normalizePlan(raw, resolvePlanExercise));

const BY_ID = new Map(PLANS.map((p) => [p.id, p]));

/** Generated plans saved on this phone (PLAN 3.5), by id. */
const SAVED = new Map<string, Plan>();

/** Ids of plans generated from someone's answers. */
export const GENERATED_PREFIX = 'mine-';
export const isGeneratedId = (id: string | undefined): boolean => !!id && id.startsWith(GENERATED_PREFIX);

/**
 * A generated plan definition (the shipped JSON shape) as a Plan, or undefined when it is not one
 * this app can run: a wrong id, an exercise it does not know, a day with nothing in it.
 */
export function definitionPlan(raw: unknown): Plan | undefined {
  try {
    const plan = normalizePlan(raw, resolvePlanExercise);
    if (!isGeneratedId(plan.id) || !plan.days.length || plan.days.some((d) => !d.blocks.length)) return undefined;
    return plan;
  } catch {
    return undefined;
  }
}

/** Makes a saved generated plan known to every screen. Returns it, or undefined when it cannot run. */
export function registerSavedPlan(raw: unknown): Plan | undefined {
  const plan = definitionPlan(raw);
  if (!plan) return undefined;
  if (!BY_ID.has(plan.id) || SAVED.has(plan.id)) {
    SAVED.set(plan.id, plan);
    BY_ID.set(plan.id, plan);
  }
  return BY_ID.get(plan.id);
}

/** The saved generated plans known now. */
export const savedPlans = (): Plan[] => [...SAVED.values()];

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
