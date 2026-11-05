// Routines by place over the shipped data (PLAN 3.1): every need comes from data/exercise-map.json,
// data/catalog.json and data/plan-exercises.json, so a tile is never a hand made claim.
import catalog from '../../data/catalog.json';
import type { Plan } from '../lib/plans';
import { exerciseNeed, placesFor, placeTiles, type Need, type PlaceId } from '../lib/places';
import { EXERCISE_MAP } from './muscles';
import { planExercise } from './planExercises';
import { PLANS } from './plans';
import { SWAP_DATA } from './patterns';
import { requiresOf, type Requires } from '../lib/swap';

const EQUIPMENT = new Map((catalog as { exercises: Array<{ id: string; equipment?: string | null }> }).exercises.map((e) => [e.id, e.equipment ?? null]));
const MAP = new Map(EXERCISE_MAP.map((e) => [e.planId, e]));

/** What a ladder requirement needs, as a place sees it; gear no place names for sure (a bar, a bench alone) is unknown. */
function requiresNeed(r: Requires): Need {
  const main = r.find((g) => !g.every((id) => id === 'flat_bench' || id === 'adjustable_bench'));
  if (!main) return r.length ? 'unknown' : 'bodyweight';
  const id = main[0];
  if (id === 'dumbbells') return 'dumbbell';
  if (id === 'cable_station') return 'cable';
  if (id === 'resistance_bands') return 'bands';
  if (id === 'kettlebells') return 'kettlebell';
  if (id === 'barbell_rack' || id === 'ez_curl_bar') return 'barbell';
  if (id === 'pull_up_bar' || id === 'dip_station' || id === 'hyperextension_bench') return 'unknown';
  return 'machine';
}

/** The need of one plan exercise (by its plan id, or a ladder candidate's catalog id in a generated plan). */
export function needOf(exerciseId: string): Need {
  // The ladders' gear when it is known for sure (null: not known): a hold or a crunch needs nothing.
  const fromLadder = (): Need => {
    const r = requiresOf(SWAP_DATA, exerciseId);
    return r ? requiresNeed(r) : 'unknown';
  };
  if (!planExercise(exerciseId)) return fromLadder();
  const entry = MAP.get(exerciseId);
  const need = exerciseNeed({
    match: entry?.match,
    catalogEquipment: entry?.catalogId ? EQUIPMENT.get(entry.catalogId) : undefined,
    loadType: planExercise(exerciseId)?.loadType,
  });
  return need === 'unknown' ? fromLadder() : need;
}

/** One need per exercise of every day; a finisher names no machine for sure, so it is unknown. */
export function planNeeds(plan: Plan): Need[] {
  const needs: Need[] = [];
  for (const d of plan.days) {
    for (const b of d.blocks) for (const it of b.items) needs.push(needOf(it.exerciseId));
    // A generated finisher says its gear (PLAN 3.5): cardio gear, or none at all.
    if (d.finisher) needs.push(d.finisher.requires ? (d.finisher.requires.length ? 'cardio' : 'bodyweight') : 'unknown');
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
