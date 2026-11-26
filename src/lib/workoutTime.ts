// The one "Time" of a finished workout (3.6z A11, PLAN M18a): the finish screen and History. It is
// measured from the moment the workout started (Start, saved on the session) to the moment Finish
// saved it (endedAt), whatever happened in between: a reload, a resume, Finish then Undo then
// Finish again. A workout left open and finished hours later (start at 7 PM, Finish at 8 AM)
// never shows "780 min" as if it were trained: above LONG_WORKOUT_MIN it reads "Over 4 h", true
// and no made up number. A time the app cannot know (an imported workout has no start time, a
// clock that went backwards) is no time at all, never "<1 min".
import { isImportOrder } from './import/importOrder';

/** Four hours: no workout of the app's plans runs that long. */
export const LONG_WORKOUT_MIN = 240;

export type WorkoutTime = { minutes: number; words: string } | { minutes: null; words: string };

/**
 * The minutes from start to finish when believable, and their words: "<1 min", "45 min", "Over 4 h".
 * Null when the two times cannot be a real workout (missing, not a number, or the end before the start).
 */
export function workoutTime(startedAt: number, endedAt: number): WorkoutTime | null {
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return null;
  const minutes = Math.round((endedAt - startedAt) / 60000);
  if (minutes > LONG_WORKOUT_MIN) return { minutes: null, words: `Over ${LONG_WORKOUT_MIN / 60} h` };
  return { minutes, words: minutes < 1 ? '<1 min' : `${minutes} min` };
}

/** The saved times of a workout (db Session), only the fields this reads. */
export type TimedSession = { startedAt: number; endedAt?: number; imported: boolean };

/**
 * The Time of a saved workout, start to save, or null when the app does not know it: still going,
 * imported (its startedAt is a file order, SPEC 9.3), or times that cannot be real.
 */
export function sessionTime(s: TimedSession): WorkoutTime | null {
  if (s.endedAt === undefined || s.imported || isImportOrder(s.startedAt)) return null;
  return workoutTime(s.startedAt, s.endedAt);
}
