// Routines by place over the shipped data (PLAN 3.1): every need comes from data/exercise-map.json,
// data/catalog.json and data/plan-exercises.json, so a tile is never a hand made claim.
import catalog from '../../data/catalog.json';
import type { Plan } from '../lib/plans';
import { exerciseNeed, placesFor, placeTiles, type Need, type PlaceId } from '../lib/places';
import { EXERCISE_MAP } from './muscles';
import { planExercise } from './planExercises';
import { PLANS } from './plans';

const EQUIPMENT = new Map((catalog as { exercises: Array<{ id: string; equipment?: string | null }> }).exercises.map((e) => [e.id, e.equipment ?? null]));
const MAP = new Map(EXERCISE_MAP.map((e) => [e.planId, e]));

/** The need of one plan exercise (by its plan id). */
export function needOf(exerciseId: string): Need {
  const entry = MAP.get(exerciseId);
  return exerciseNeed({
    match: entry?.match,
    catalogEquipment: entry?.catalogId ? EQUIPMENT.get(entry.catalogId) : undefined,
    loadType: planExercise(exerciseId)?.loadType,
  });
}

/** One need per exercise of every day; a finisher names no machine for sure, so it is unknown. */
export function planNeeds(plan: Plan): Need[] {
  const needs: Need[] = [];
  for (const d of plan.days) {
    for (const b of d.blocks) for (const it of b.items) needs.push(needOf(it.exerciseId));
    if (d.finisher) needs.push('unknown');
  }
  return needs;
}

const PLACES_OF = new Map(PLANS.map((p) => [p.id, placesFor(planNeeds(p))]));

export const placesOfPlan = (plan: Pick<Plan, 'id'>): readonly PlaceId[] => PLACES_OF.get(plan.id) ?? [];

/** The tiles for the plan picker: only places with a real plan behind them. */
export const PLACE_TILES = placeTiles(PLANS, placesOfPlan);

/** The plans for one place, in picker order (empty for an unknown or empty place). */
export function plansForPlace(placeId: string | undefined): Plan[] {
  return PLANS.filter((p) => placeId !== undefined && placesOfPlan(p).includes(placeId as PlaceId));
}
