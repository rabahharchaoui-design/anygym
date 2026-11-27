// The weekly count against the goal (PLAN M18a, SPEC 17 "3 of 4 workouts this week"). A week is the
// app's training week, Monday 00:00 to the next Monday 00:00 on the phone's own clock and time zone
// (lib/coach/time.ts), so a daylight saving change is still one week. A workout belongs to the day
// and week it was started in: one started Sunday 11:50 PM and saved after midnight is Sunday's.
import { weekStart, weekStartFrom } from '../coach/time';
import { countsAsWorkout, type WorkoutFact } from './types';

/** The goal when the plan sets none (docs/finish-celebration.md: "or 3 if none is set"). */
export const DEFAULT_WEEKLY_GOAL = 3;

/** Workouts a week the plan asks for (its daysPerWeek), or 3. Only a whole number from 1 to 7 is a goal. */
export function weeklyGoal(planDaysPerWeek: number | undefined): number {
  if (planDaysPerWeek === undefined || !Number.isInteger(planDaysPerWeek) || planDaysPerWeek < 1 || planDaysPerWeek > 7) return DEFAULT_WEEKLY_GOAL;
  return planDaysPerWeek;
}

/** [start, end) of the local week `t` falls in. */
export function weekOf(t: number): { start: number; end: number } {
  return { start: weekStart(t), end: weekStartFrom(t, 1) };
}

/** How many counted workouts were started in the local week of `t`. */
export function workoutsInWeek(workouts: readonly WorkoutFact[], t: number): number {
  const { start, end } = weekOf(t);
  return workouts.filter((w) => countsAsWorkout(w) && w.startedAt >= start && w.startedAt < end).length;
}

export type WeekCount = { count: number; goal: number; complete: boolean };

/** This week's count (the week of `t`) against the goal: "1 of 4 this week", complete at the goal. */
export function weekCount(workouts: readonly WorkoutFact[], t: number, goal: number): WeekCount {
  const count = workoutsInWeek(workouts, t);
  return { count, goal, complete: count >= goal };
}
