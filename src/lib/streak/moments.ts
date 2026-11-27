// When a workout happened, for the badges (PLAN M18a): the comeback after 14 days off, and early
// bird and night owl on the phone's own clock. Device time only: no location is read or stored.
import { daysBetween } from '../coach/time';
import { sessionTime } from '../workoutTime';
import { countsAsWorkout, type WorkoutFact } from './types';

/** Days with no workout before a comeback (docs/finish-celebration.md; SPEC 17 "2+ weeks off"). */
export const COMEBACK_DAYS_OFF = 14;

/**
 * Back after 14 or more whole calendar days without a workout: the last counted workout before
 * this one was started at least 15 local days earlier (day 0 trained, days 1 to 14 off). Needs an
 * earlier workout with a date: the first workout ever is not a comeback, and imported history
 * has no dates to measure.
 */
export function isComeback(workout: WorkoutFact, workouts: readonly WorkoutFact[]): boolean {
  const before = workouts.filter((w) => w.id !== workout.id && countsAsWorkout(w) && w.startedAt < workout.startedAt);
  if (!before.length) return false;
  const last = Math.max(...before.map((w) => w.startedAt));
  return daysBetween(last, workout.startedAt) - 1 >= COMEBACK_DAYS_OFF;
}

/** Early bird: started from 4:00 to 6:59 AM, phone time ("before 7 AM"). */
export const EARLY_FROM_HOUR = 4;
export const EARLY_BEFORE_HOUR = 7;
/** Night owl: started from 9:00 PM to 3:59 AM, phone time ("after 9 PM"; the small hours are night). */
export const NIGHT_FROM_HOUR = 21;

export type ClockBadge = 'early' | 'night' | null;

/**
 * Which time of day the workout's start was, by the phone's clock. Only a workout with a believable
 * time counts (lib/workoutTime.ts): one left open for hours was not trained at that hour for sure.
 */
export function clockOf(workout: WorkoutFact): ClockBadge {
  const time = sessionTime(workout);
  if (!time || time.minutes === null) return null;
  const h = new Date(workout.startedAt).getHours();
  if (h >= EARLY_FROM_HOUR && h < EARLY_BEFORE_HOUR) return 'early';
  if (h >= NIGHT_FROM_HOUR || h < EARLY_FROM_HOUR) return 'night';
  return null;
}
