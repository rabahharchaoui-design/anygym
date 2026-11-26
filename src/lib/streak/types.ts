// What the finish logic knows about one saved workout (PLAN M18a). Built from the database by
// db/finishEarned.ts; everything in src/lib/streak and src/lib/badges reads only this.

export type WorkoutFact = {
  id: string;
  /** Date.now() when Start was tapped (an import order for imported workouts, never a date). */
  startedAt: number;
  /** Date.now() when Finish saved it. Missing: still going (or imported). */
  endedAt?: number;
  /** Imported from another app (SPEC 9.3): no date, never counted by date. */
  imported: boolean;
  /** Working sets (warm ups never count, lib/workSets.ts). */
  workSets: number;
  /** Total lifted of its working sets in lb (lib/load totalLifted), 0 when none is known. */
  liftedLb: number;
  /** The town of the gym it was at (Gym.city, typed by the user), trimmed. Missing: none given. */
  city?: string;
};

/**
 * A workout that counts for weeks, streaks, the comeback and the badges: finished in this app (so
 * its start is a real date) with at least one working set. Warm ups alone are not a workout, and an
 * imported one has no date to count.
 */
export const countsAsWorkout = (w: WorkoutFact): boolean => !w.imported && w.endedAt !== undefined && w.workSets > 0;
