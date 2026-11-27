// The streak (PLAN M18a). SPEC 17 wins over docs/finish-celebration.md here: a streak is WEEKS in a
// row hitting the weekly goal, "never daily streaks that punish rest days". Rest days never break
// it; only a week that ended under its goal does. The week going on now counts once it reaches the
// goal, and while it has not yet, the streak is still alive (it ends with last week).
// Weeks are the phone's local weeks (week.ts), so midnight, daylight saving and a trip east or west
// move a workout only by the clock the phone shows now; no time zone is stored (none is known for
// older workouts).
import { weekStartFrom } from '../coach/time';
import type { WorkoutFact } from './types';
import { workoutsInWeek } from './week';

/** No streak is looked for further back than this (about 4 years). */
const MAX_WEEKS = 210;

/** Weeks in a row that reached `goal`, ending with the week of `now` when it has, else with the week before. */
export function weekStreak(workouts: readonly WorkoutFact[], now: number, goal: number): number {
  const hit = (n: number) => workoutsInWeek(workouts, weekStartFrom(now, -n)) >= goal;
  let n = 0;
  let back = hit(0) ? 0 : 1;
  for (; back < MAX_WEEKS && hit(back); back++) n++;
  return n;
}
