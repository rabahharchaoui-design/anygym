// Plain words for History (SPEC 13.1). Names come from the plan or the exercise list; nothing is guessed.
import { planExercise } from '../../data/planExercises';
import { planById } from '../../data/plans';
import type { Session } from '../../db/types';
import { dayIndexOf } from '../../lib/plans';
import { dayWorkout } from '../../lib/planWorkout';
import { dayTitle } from '../plans/planWords';
import { IMPORTED_LABEL, isImportOrder } from '../../lib/import/importOrder';

/** "Day 3 · Back and biceps" for a plan day, the exercise for an imported one, else "Quick workout". */
export function workoutTitle(session: Session): string {
  if (session.imported) {
    const ids = session.exerciseIds ?? [];
    return ids.length === 1 ? (planExercise(ids[0]!)?.name ?? 'Imported workout') : 'Imported workout';
  }
  const plan = planById(session.planId);
  const i = plan ? dayIndexOf(plan, session.dayId) : -1;
  const day = plan && i >= 0 ? plan.days[i] : undefined;
  return day ? dayTitle(day.n, day.name) : 'Quick workout';
}

/** "Fri, Oct 24", with the year when it is not this year. "Imported" for imported workouts (no date, SPEC 9.3). */
export function workoutDate(ts: number, now = Date.now()): string {
  if (isImportOrder(ts)) return IMPORTED_LABEL;
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

/**
 * Imported workouts of the same exercise, numbered in file order ("Workout 1 of 2"), so rows with
 * the same name tell apart. Only groups of two or more get a number.
 */
export function importNumbers(sessions: readonly Session[]): Map<string, { n: number; of: number }> {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    if (!s.imported) continue;
    const key = workoutTitle(s);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const out = new Map<string, { n: number; of: number }>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const ordered = [...list].sort((a, b) => (a.importSeq ?? a.startedAt) - (b.importSeq ?? b.startedAt));
    ordered.forEach((s, i) => out.set(s.id, { n: i + 1, of: ordered.length }));
  }
  return out;
}
