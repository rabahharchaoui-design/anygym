import { useLive } from './useLive';
import { getPlanState, placeFor } from '../db/planState';
import { hasProgress } from '../lib/plan/carry';
import type { Plan } from '../lib/plans';

/**
 * Before "Use this plan" (PLAN 3.6f round 3): true when choosing `plan` would start again from Day 1
 * while the plan in use has progress (a done day, a later day up next). The reveal says so first.
 */
export function useRestartsFromDayOne(plan: Plan | undefined): boolean {
  const state = useLive(async () => (await getPlanState()) ?? null, []).data;
  if (!plan || !state || !hasProgress(state)) return false;
  return !placeFor(plan.id, state, 0, plan).kept;
}
