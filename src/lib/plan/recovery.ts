// PLAN 3.6f: which workouts count for the 48 hour rule. The one place the threshold is written.
// A muscle is "trained" only by a real amount of hard work: at least RECOVERY_MIN_SETS working sets
// on it inside the last 48 hours. One warm up, one empty bar set or a two set taster never moves a
// day. A day finished at 60% or more always clears this on its main muscles. Pure.
import { TIRED_MS } from '../quickWhy';

/** The fewest hard sets on a muscle, inside 48 hours, that make it need rest. */
export const RECOVERY_MIN_SETS = 3;

/** One finished or running workout: when it started and its hard sets per muscle. */
export type TrainingEntry = {
  at: number;
  planId?: string;
  dayId?: string;
  /** Muscle → certain working sets that trained it (its exercise's targets only, PLAN H1; helpers never count). */
  sets: Readonly<Record<string, number>>;
};

/**
 * Muscle → when it was last trained, only for muscles with enough hard sets in the window.
 * Entries in the future, or 48 hours old or more, never count. `skip` leaves workouts out (a day
 * kept up next is never moved away by its own part done workout).
 */
export function countedTraining(entries: readonly TrainingEntry[], now: number, skip?: (e: TrainingEntry) => boolean): Record<string, number> {
  const total: Record<string, number> = {};
  const last: Record<string, number> = {};
  for (const e of entries) {
    if (e.at > now || now - e.at >= TIRED_MS || skip?.(e)) continue;
    for (const [m, n] of Object.entries(e.sets)) {
      total[m] = (total[m] ?? 0) + n;
      last[m] = Math.max(last[m] ?? 0, e.at);
    }
  }
  return Object.fromEntries(Object.entries(last).filter(([m]) => total[m]! >= RECOVERY_MIN_SETS));
}
