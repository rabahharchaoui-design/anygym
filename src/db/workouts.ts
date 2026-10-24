// Quick workout sessions and their sets (PLAN 1.7, SPEC 2, 5.1). Every write is transactional.
import { planById } from '../data/plans';
import { dayIdOf } from '../lib/plans';
import { dayWorkout } from '../lib/planWorkout';
import { newId } from './ids';
import { advanceAfter, weekFor } from './planState';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Load, Session, SetKind, WorkoutSet } from './types';

/** The workout in progress: started, not ended, not imported. Newest first if somehow several. */
export async function getActiveSession(db: AnyGymDB = defaultDb): Promise<Session | undefined> {
  return db.sessions
    .orderBy('startedAt')
    .reverse()
    .filter((s) => s.endedAt === undefined && !s.imported)
    .first();
}

/** Starts an empty workout at the gym, or returns the one already in progress (a double tap starts one). */
export async function startWorkout(gymId: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const active = await getActiveSession(db);
    if (active) return active;
    const session: Session = { id: newId(), gymId, startedAt: now, imported: false, exerciseIds: [] };
    await db.sessions.add(session);
    return session;
  });
}

/**
 * Starts a plan day (PLAN 1.10): the session carries planId, dayId and the week, and lists the
 * day's exercises in order. If a workout is already in progress it is returned instead.
 */
export async function startPlanDay(gymId: string, planId: string, dayIndex: number, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Session> {
  const plan = planById(planId);
  const day = plan?.days[dayIndex];
  if (!plan || !day) throw new Error('Plan day not found');
  return db.transaction('rw', db.sessions, db.planState, async () => {
    const active = await getActiveSession(db);
    if (active) return active;
    const weekIndex = weekFor(await db.planState.get('active'), planId);
    const exerciseIds = [...new Set(dayWorkout(plan, dayIndex, weekIndex).map((e) => e.exerciseId))];
    const session: Session = { id: newId(), gymId, planId, dayId: dayIdOf(day), weekIndex, startedAt: now, imported: false, exerciseIds };
    await db.sessions.add(session);
    return session;
  });
}

/** Adds an exercise to the workout once; adding it again is a no op. */
export async function addExercise(sessionId: string, exerciseId: string, db: AnyGymDB = defaultDb): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) throw new Error('Workout not found');
    const ids = s.exerciseIds ?? [];
    if (ids.includes(exerciseId)) return s;
    const next = { ...s, exerciseIds: [...ids, exerciseId] };
    await db.sessions.put(next);
    return next;
  });
}

export type NewSet = {
  /** Made by the caller before the tap; the same id twice writes one set (double tap safe). */
  id: string;
  sessionId: string;
  exerciseId: string;
  reps?: number;
  seconds?: number;
  load: Load;
  /** 'warmup' for sets of a plan warm up block (SPEC 6 rule 1 ignores them); default 'work'. */
  kind?: SetKind;
};

function validSet(input: Pick<NewSet, 'reps' | 'seconds' | 'load'>): boolean {
  const okReps = input.reps === undefined || (Number.isInteger(input.reps) && input.reps > 0);
  const okSecs = input.seconds === undefined || (Number.isInteger(input.seconds) && input.seconds > 0);
  const hasCount = input.reps !== undefined || input.seconds !== undefined;
  return okReps && okSecs && hasCount && Number.isFinite(input.load.total) && input.load.total >= 0;
}

/**
 * Logs a work set at the end of the workout. Idempotent: if a set with this id exists it is
 * returned unchanged. Order comes from the workout's counter: one past the highest order ever
 * used, deleted sets included, so a set put back by Undo never shares its order with a newer one.
 * Workouts from before the counter (schema v4) start from their highest saved order.
 */
export async function logSet(input: NewSet, db: AnyGymDB = defaultDb): Promise<WorkoutSet> {
  if (!validSet(input)) throw new Error('Invalid set');
  return db.transaction('rw', db.sessions, db.sets, db.orderCounters, async () => {
    const existing = await db.sets.get(input.id);
    if (existing) return existing;
    const session = await db.sessions.get(input.sessionId);
    if (!session || session.endedAt !== undefined) throw new Error('Workout not active');
    const last = await db.sets.where('[sessionId+order]').between([input.sessionId, -Infinity], [input.sessionId, Infinity]).last();
    const counter = await db.orderCounters.get(input.sessionId);
    const order = Math.max(counter?.next ?? 0, last ? last.order + 1 : 0);
    await db.orderCounters.put({ sessionId: input.sessionId, next: order + 1 });
    const set: WorkoutSet = {
      id: input.id,
      sessionId: input.sessionId,
      exerciseId: input.exerciseId,
      order,
      kind: input.kind ?? 'work',
      load: { ...input.load },
      uncertain: false,
    };
    if (input.reps !== undefined) set.reps = input.reps;
    if (input.seconds !== undefined) set.seconds = input.seconds;
    await db.sets.add(set);
    if (!(session.exerciseIds ?? []).includes(input.exerciseId)) {
      await db.sessions.put({ ...session, exerciseIds: [...(session.exerciseIds ?? []), input.exerciseId] });
    }
    return set;
  });
}

/** Changes reps, seconds or load of a logged set. Id, order and exercise stay. */
export async function updateSet(
  id: string,
  change: Pick<NewSet, 'reps' | 'seconds' | 'load'>,
  db: AnyGymDB = defaultDb,
): Promise<WorkoutSet> {
  if (!validSet(change)) throw new Error('Invalid set');
  return db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(id);
    if (!set) throw new Error('Set not found');
    const next: WorkoutSet = { ...set, load: { ...change.load } };
    delete next.reps;
    delete next.seconds;
    if (change.reps !== undefined) next.reps = change.reps;
    if (change.seconds !== undefined) next.seconds = change.seconds;
    await db.sets.put(next);
    return next;
  });
}

/** Deletes a set for good. Returns the deleted record (for undo) or undefined if it was gone. */
export async function deleteSet(id: string, db: AnyGymDB = defaultDb): Promise<WorkoutSet | undefined> {
  return db.transaction('rw', db.sets, async () => {
    const set = await db.sets.get(id);
    if (set) await db.sets.delete(id);
    return set;
  });
}

/** Puts a deleted set back exactly as it was: same id, same order. */
export async function restoreSet(set: WorkoutSet, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    await db.sets.put({ ...set });
  });
}

/** Sets of a workout in logged order. */
export async function setsOf(sessionId: string, db: AnyGymDB = defaultDb): Promise<WorkoutSet[]> {
  return db.sets.where('[sessionId+order]').between([sessionId, -Infinity], [sessionId, Infinity]).toArray();
}

export type FinishResult = { saved: true; sets: number } | { saved: false };

/**
 * Ends the workout. With sets it is saved (endedAt); with none it is deleted, never kept as an
 * empty session. Finishing twice is safe. A saved plan day moves the plan to the next day.
 */
export async function finishWorkout(sessionId: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<FinishResult> {
  return db.transaction('rw', db.sessions, db.sets, db.planState, db.orderCounters, async () => {
    const s = await db.sessions.get(sessionId);
    const count = await db.sets.where('sessionId').equals(sessionId).count();
    if (!s) return { saved: false };
    if (count === 0) {
      await db.sessions.delete(sessionId);
      await db.orderCounters.delete(sessionId);
      return { saved: false };
    }
    if (s.endedAt === undefined) {
      await db.sessions.put({ ...s, endedAt: now });
      await advanceAfter(s, db);
    }
    return { saved: true, sets: count };
  });
}
