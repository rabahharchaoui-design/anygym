import { useMemo } from 'react';
import { getPlanState } from '../db/planState';
import { EXERCISE_MAP } from '../data/muscles';
import { planById } from '../data/plans';
import { planCatalogIds } from '../lib/muscleExercises';
import { useLive } from './useLive';

/** Catalog ids in the user's current plan (PLAN 2.2c sort). Empty while loading or with no plan. */
export function usePlanCatalogIds(): Set<string> {
  const state = useLive(() => getPlanState(), []);
  const planId = state.data?.planId;
  return useMemo(() => planCatalogIds(planById(planId), EXERCISE_MAP), [planId]);
}
