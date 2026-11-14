import { useMemo } from 'react';
import { useLive } from './useLive';
import { getPlanState, placeFor } from '../db/planState';
import { comingOrder, hasProgress } from '../lib/plan/carry';
import type { Plan } from '../lib/plans';

export type PlanPlace = {
  /** Choosing the plan would start again from Day 1 while the plan in use has progress: the reveal says so first. */
  restarts: boolean;
  /** The place is kept and it is past the start: the number of the day that is next ("Day 2 is next"). Null otherwise. */
  keptNext: number | null;
  /** The plan's days in the order Today will follow them from that place (lib/plan/carry.ts comingOrder). */
  order: number[];
};

/**
 * Before "Use this plan" (PLAN 3.6f round 3 and the truth pass): where the person would be in
 * `plan` if they chose it now. The reveal's day list and its words are composed from this, so they
 * say what Today will then show.
 */
export function usePlanPlace(plan: Plan | undefined): PlanPlace {
  const state = useLive(async () => (await getPlanState()) ?? null, []).data;
  return useMemo(() => {
    const count = plan?.days.length ?? 0;
    if (!plan || !state) return { restarts: false, keptNext: null, order: comingOrder(undefined, count) };
    const place = placeFor(plan.id, state, 0, plan);
    const moved = place.kept && hasProgress(place.state);
    return { restarts: hasProgress(state) && !place.kept, keptNext: moved ? (plan.days[place.state.nextDayIndex]?.n ?? null) : null, order: comingOrder(place.kept ? place.state : undefined, count) };
  }, [plan, state]);
}
