// Rebuilding "Your plan" (a new schedule, new focus areas, a day or minutes added) keeps the
// person's place in it (PLAN 3.6f round 3). Pure: no Dexie, no React.
// Days carry over by position. A day that no longer exists drops its marks; a day that is new is
// never marked done. When nothing is left to do among the days that still exist, the place cannot
// be carried honestly and the rotation starts again from Day 1 (the reveal says so first).
import type { PlanState } from '../../db/profileTypes';
import { clampWeek, type Plan } from '../plans';

export type CarriedPlace = {
  state: PlanState;
  /** False: the new plan starts from Day 1 (nothing carried over). */
  kept: boolean;
};

type Shape = Pick<Plan, 'id' | 'days' | 'progressionMode' | 'weeks'>;

/** True when the pointer holds anything worth keeping (a done or part done day, a later day up next, a later week). */
export function hasProgress(prev: Pick<PlanState, 'doneDays' | 'partial' | 'nextDayIndex' | 'weekIndex'> | undefined): boolean {
  if (!prev) return false;
  return prev.doneDays.length > 0 || Object.keys(prev.partial ?? {}).length > 0 || prev.nextDayIndex > 0 || prev.weekIndex > 0;
}

const fresh = (planId: string, startedAt: number): PlanState => ({ id: 'active', planId, startedAt, weekIndex: 0, nextDayIndex: 0, doneDays: [] });

/**
 * The pointer for `plan`, rebuilt from the plan `prev` pointed at. `related` is false when the two
 * plans are not builds of the same thing (a curated plan and a generated one): then it starts over.
 */
export function carryPlace(prev: PlanState | undefined, plan: Shape, related: boolean, now: number): CarriedPlace {
  if (!prev || !related) return { state: fresh(plan.id, now), kept: false };
  const count = plan.days.length;
  const real = (d: unknown): d is number => Number.isInteger(d) && (d as number) >= 0 && (d as number) < count;
  const doneDays = [...new Set(prev.doneDays.filter(real))].sort((a, b) => a - b);
  const remaining = Array.from({ length: count }, (_, i) => i).filter((i) => !doneDays.includes(i));
  // Every day that still exists is done: the pass cannot be finished or continued honestly.
  if (!remaining.length) return { state: fresh(plan.id, prev.startedAt), kept: false };

  const weekIndex = plan.progressionMode === 'weekly_table' ? clampWeek(prev.weekIndex, plan.weeks ?? 1) : 0;
  let pending: number[] | undefined;
  if (prev.pendingDayIndices) {
    const old = prev.pendingDayIndices.filter((d, i, all) => real(d) && !doneDays.includes(d) && all.indexOf(d) === i);
    pending = [...old, ...remaining.filter((d) => !old.includes(d))];
  }
  const after = remaining.find((d) => d >= prev.nextDayIndex) ?? remaining[0]!;
  const nextDayIndex = pending ? pending[0]! : remaining.includes(prev.nextDayIndex) ? prev.nextDayIndex : after;
  const partial = Object.fromEntries(Object.entries(prev.partial ?? {}).filter(([d]) => real(Number(d))));

  const state: PlanState = { id: 'active', planId: plan.id, startedAt: prev.startedAt, weekIndex, nextDayIndex, doneDays };
  if (Object.keys(partial).length) state.partial = partial;
  if (pending) state.pendingDayIndices = pending;
  if (prev.chosenDayIndex !== undefined && remaining.includes(prev.chosenDayIndex)) state.chosenDayIndex = prev.chosenDayIndex;
  return { state, kept: true };
}
