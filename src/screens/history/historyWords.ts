// Plain words for History (SPEC 13.1). Names come from the plan or the exercise list; nothing is guessed.
import { planExercise } from '../../data/planExercises';
import { planById } from '../../data/plans';
import type { Session } from '../../db/types';
import { dayIndexOf } from '../../lib/plans';
import { dayWorkout } from '../../lib/planWorkout';
import { dayTitle } from '../plans/planWords';

/** "Day 3 · Back and biceps" for a plan day, else "Quick workout". */
export function workoutTitle(session: Session): string {
  const plan = planById(session.planId);
  const i = plan ? dayIndexOf(plan, session.dayId) : -1;
  const day = plan && i >= 0 ? plan.days[i] : undefined;
  return day ? dayTitle(day.n, day.name) : 'Quick workout';
}

/** "Fri, Oct 24", with the year when it is not this year. */
export function workoutDate(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export const setCount = (n: number): string => `${n} ${n === 1 ? 'set' : 'sets'}`;

/** Exercise names for a workout: the plan day's names first, then the exercise list, else the id. */
export function exerciseNamer(session: Session): (id: string) => string {
  const plan = planById(session.planId);
  const i = plan ? dayIndexOf(plan, session.dayId) : -1;
  const names = new Map(plan && i >= 0 ? dayWorkout(plan, i, session.weekIndex ?? 0).map((e) => [e.exerciseId, e.name]) : []);
  return (id) => names.get(id) ?? planExercise(id)?.name ?? id;
}
