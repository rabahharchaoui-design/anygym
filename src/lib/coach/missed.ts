// Ask before changing the plan (competitor gap 3, SPEC 15): after missed workouts the plan never
// changes on its own; one card asks "Pick up where you left off, or rebuild the week?".
import { daysBetween, startOfDay, weekdayOf } from './time';

/** Missed workouts before the card asks. */
export const MISSED_AT = 2;

export type MissedInput = {
  /** When the last workout was. */
  last: number;
  now: number;
  /** The intake's training days ('mon' …), when the user gave them. */
  weekdays?: readonly string[];
  /** The plan's days per week (used when no training days were given). */
  daysPerWeek: number;
};

/**
 * Planned workouts that did not happen between the last workout and today (both left out: today
 * can still happen). With training days: exactly those weekdays. Without: the plan's days per
 * week over the days in between, rounded down (never more than really fit).
 */
export function missedWorkouts({ last, now, weekdays, daysPerWeek }: MissedInput): number {
  const gap = daysBetween(last, now);
  if (gap < 2) return 0;
  if (weekdays?.length) {
    let n = 0;
    const d = new Date(startOfDay(last));
    for (let i = 1; i < gap; i++) {
      d.setDate(d.getDate() + 1);
      if (weekdays.includes(weekdayOf(d.getTime()))) n++;
    }
    return n;
  }
  return Math.floor(((gap - 1) * Math.max(0, Math.min(7, daysPerWeek))) / 7);
}

export const missedCardId = (last: number): string => `missed:${last}`;

/** "Missed 2 workouts. Pick up where you left off, or rebuild the week?" */
export const missedTitle = (n: number): string => `Missed ${n} workouts. Pick up where you left off, or rebuild the week?`;
