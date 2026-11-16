// The one "Time" of a finished workout (3.6z A11): the finish screen and History. A workout left
// open and finished hours later (start at 7 PM, Finish at 8 AM) never shows "780 min" as if it
// were trained: above LONG_WORKOUT_MIN it reads "Over 4 h", true and no made up number.

/** Four hours: no workout of the app's plans runs that long. */
export const LONG_WORKOUT_MIN = 240;

export type WorkoutTime = { minutes: number; words: string } | { minutes: null; words: string };

/** The minutes from start to finish when believable, and their words: "<1 min", "45 min", "Over 4 h". */
export function workoutTime(startedAt: number, endedAt: number): WorkoutTime {
  const minutes = Math.max(0, Math.round((endedAt - startedAt) / 60000));
  if (minutes > LONG_WORKOUT_MIN) return { minutes: null, words: `Over ${LONG_WORKOUT_MIN / 60} h` };
  return { minutes, words: minutes < 1 ? '<1 min' : `${minutes} min` };
}
