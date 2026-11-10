// Muscle map lookups (SPEC 4.5) over the committed catalog, plan map and overrides.
import catalog from '../../data/catalog.json';
import exerciseMap from '../../data/exercise-map.json';
import overrides from '../../data/muscle-overrides.json';
import type { MapEntry } from '../lib/catalog';
import { resolveMuscles, resolvePlanMuscles, type CatalogMuscles, type MuscleMapData, type MuscleOverrides } from '../lib/muscles';
import { candidateMuscles } from '../lib/candidates/view';
import { approvedCandidate } from './candidateGate';

export interface CatalogExercise extends CatalogMuscles {
  name: string;
}

export const CATALOG = (catalog as { exercises: CatalogExercise[] }).exercises;
export const EXERCISE_MAP = exerciseMap as MapEntry[];
const OVERRIDES = overrides as MuscleOverrides;
const BY_ID = new Map<string, CatalogMuscles>(CATALOG.map((e) => [e.id, e]));
const PLAN_BY_ID = new Map(EXERCISE_MAP.map((e) => [e.planId, e]));

/** Muscle map for a catalog exercise (or a candidate G approved, PLAN 3.5e); null when not known for sure. */
export function musclesForCatalog(id: string): MuscleMapData | null {
  const own = BY_ID.get(id);
  if (own) return resolveMuscles(own, OVERRIDES);
  const c = approvedCandidate(id);
  return c ? candidateMuscles(c) : null;
}

/** Muscle map for a plan exercise; null for match none (SPEC 4.3) or an unknown id. */
export function musclesForPlan(planId: string): MuscleMapData | null {
  return resolvePlanMuscles(PLAN_BY_ID.get(planId), BY_ID, OVERRIDES);
}
