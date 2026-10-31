// Muscle map lookups (SPEC 4.5) over the committed catalog, plan map and overrides.
import catalog from '../../data/catalog.json';
import exerciseMap from '../../data/exercise-map.json';
import overrides from '../../data/muscle-overrides.json';
import type { MapEntry } from '../lib/catalog';
import { resolveMuscles, resolvePlanMuscles, type CatalogMuscles, type MuscleMapData, type MuscleOverrides } from '../lib/muscles';

export interface CatalogExercise extends CatalogMuscles {
  name: string;
}

export const CATALOG = (catalog as { exercises: CatalogExercise[] }).exercises;
export const EXERCISE_MAP = exerciseMap as MapEntry[];
const OVERRIDES = overrides as MuscleOverrides;
const BY_ID = new Map<string, CatalogMuscles>(CATALOG.map((e) => [e.id, e]));
const PLAN_BY_ID = new Map(EXERCISE_MAP.map((e) => [e.planId, e]));

/** Muscle map for a catalog exercise; null when not known for sure. */
export function musclesForCatalog(id: string): MuscleMapData | null {
  return resolveMuscles(BY_ID.get(id), OVERRIDES);
}

/** Muscle map for a plan exercise; null for match none (SPEC 4.3) or an unknown id. */
export function musclesForPlan(planId: string): MuscleMapData | null {
  return resolvePlanMuscles(PLAN_BY_ID.get(planId), BY_ID, OVERRIDES);
}
