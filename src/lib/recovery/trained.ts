// PLAN Q1 (SPEC 20.3): when each group was last trained, from the log alone. A group is trained by a
// workout only with at least TRAINED_MIN_SETS logged working sets that have it as a PRIMARY muscle.
// Warmups, drop sets, unsure sets and secondary muscles never count. Pure: the caller reads the log.
import type { SetKind } from '../../db/types';
import type { Muscle } from '../order';
import { type RecoveryGroup, groupOf } from './groups';

/** The fewest working sets in one workout, with the group as a primary muscle, that train it. */
export const TRAINED_MIN_SETS = 3;

/** One logged set, as recovery needs it: its kind and its exercise's muscles. */
export type LoggedSet = {
  kind: SetKind;
  primary: readonly Muscle[];
  /** Listed so the caller can pass the whole exercise; never counted. */
  secondary?: readonly Muscle[];
  /** An unsure set (SPEC 4.3) is never a fact. */
  uncertain?: boolean;
};

/** One workout from the log: when it started (ms) and its logged sets. */
export type LoggedWorkout = { at: number; sets: readonly LoggedSet[] };

/** Group → when it was last trained (the workout's start). A group missing here has no sure date. */
export type GroupTraining = Partial<Record<RecoveryGroup, number>>;

const counts = (s: LoggedSet): boolean => s.kind === 'work' && !s.uncertain;

/** The groups one workout trained. */
export function groupsTrained(w: LoggedWorkout): RecoveryGroup[] {
  const sets = new Map<RecoveryGroup, number>();
  for (const s of w.sets) {
    if (!counts(s)) continue;
    for (const g of new Set(s.primary.map(groupOf))) sets.set(g, (sets.get(g) ?? 0) + 1);
  }
  return [...sets].filter(([, n]) => n >= TRAINED_MIN_SETS).map(([g]) => g);
}

/** PLAN H2: the primary muscles of one workout's counted sets whose group it trained (helpers never). */
export function musclesTrained(w: LoggedWorkout): Muscle[] {
  const groups = new Set(groupsTrained(w));
  return primaryMuscles(w).filter((m) => groups.has(groupOf(m)));
}

/**
 * PLAN H2: the primary muscles one workout worked without training them (under TRAINED_MIN_SETS
 * sets for their group). Never a trained fact, and no "rested" claim may be made past them.
 */
export function musclesWorkedOnly(w: LoggedWorkout): Muscle[] {
  const groups = new Set(groupsTrained(w));
  return primaryMuscles(w).filter((m) => !groups.has(groupOf(m)));
}

const primaryMuscles = (w: LoggedWorkout): Muscle[] => [...new Set(w.sets.filter(counts).flatMap((s) => s.primary))];

/** When each group was last trained. Workouts dated after `now` are not facts yet and never count. */
export function lastTrainedGroups(log: readonly LoggedWorkout[], now: number): GroupTraining {
  const out: GroupTraining = {};
  for (const w of log) {
    if (!Number.isFinite(w.at) || w.at > now) continue;
    for (const g of groupsTrained(w)) out[g] = Math.max(out[g] ?? -Infinity, w.at);
  }
  return out;
}
