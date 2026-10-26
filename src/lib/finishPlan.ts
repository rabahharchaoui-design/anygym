// What a finished plan day does to the plan (PLAN 2.0a). Pure: no Dexie, no React.
// Smart auto, no question on the finish screen: at least 60% of the day's working sets (warm ups,
// stretches and the finisher left out, see isWorkingEntry) moves the plan to the next day;
// less keeps the same day up next. Only a fully done day earns the tick; 60 to 99% leaves a
// partial ring on the day it moved on from.
import { advancePlan, type Plan, type PlanPosition } from './plans';
import type { DayProgress } from './planWorkout';

/** Share of the day's working sets that moves the plan on. */
export const ADVANCE_SHARE = 0.6;

/** True when this much of the day moves the plan on (the unrounded share, never a shown percent). */
export const movesOn = (share: number): boolean => share >= ADVANCE_SHARE;

export type FinishPosition = PlanPosition & {
  /** Day index → share done, for the partial rings. Empty when the pass started over. */
  partial: Record<number, number>;
};

/**
 * The plan's position after finishing day `dayIndex` with `progress`:
 *   100%       → next day, the day gets its tick (and loses any partial ring).
 *   60 to 99%  → next day, the day keeps (or gets) a partial ring, never a tick it did not earn.
 *   below 60%  → the same day stays up next, with its partial ring.
 * The last day wraps to Day 1 and clears the pass (a weekly table moves one week on, never past
 * its last week: advancePlan). Partial marks of other days stay.
 */
export function finishPlanPosition(
  state: PlanPosition & { partial?: Record<number, number> },
  plan: Pick<Plan, 'days' | 'progressionMode' | 'weeks'>,
  dayIndex: number,
  progress: Pick<DayProgress, 'share' | 'complete'>,
): FinishPosition {
  const day = Math.max(0, Math.min(plan.days.length - 1, Math.floor(dayIndex)));
  const share = Math.min(1, Math.max(0, Number.isFinite(progress.share) ? progress.share : 0));
  const partial = { ...(state.partial ?? {}) };
  if (!progress.complete && !movesOn(share)) {
    partial[day] = Math.max(partial[day] ?? 0, share);
    return { nextDayIndex: day, weekIndex: state.weekIndex, doneDays: [...state.doneDays], partial };
  }
  const pos = advancePlan(state, day, plan);
  if (pos.doneDays.length === 0) return { ...pos, partial: {} };
  if (progress.complete) {
    delete partial[day];
    return { ...pos, partial };
  }
  // Moved on with sets left: no tick for this day (unless an earlier pass of it already had one).
  const doneDays = pos.doneDays.filter((d) => d !== day || state.doneDays.includes(day));
  partial[day] = Math.max(partial[day] ?? 0, share);
  return { ...pos, doneDays, partial };
}
