// Adding, removing and ordering the exercises of a workout in progress (split from workouts.ts, PLAN 3.6x).
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Session } from './types';
import { WorkoutFinishedError } from './workoutErrors';

/** Adds an exercise to the workout once; adding it again is a no op. */
export async function addExercise(sessionId: string, exerciseId: string, db: AnyGymDB = defaultDb): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) throw new Error('Workout not found');
    // A picker left open while another tab finished the workout never changes it (PLAN 2.0e).
    if (s.endedAt !== undefined) throw new WorkoutFinishedError();
    const ids = s.exerciseIds ?? [];
    if (ids.includes(exerciseId)) return s;
    const next = { ...s, exerciseIds: [...ids, exerciseId] };
    await db.sessions.put(next);
    return next;
  });
}

/**
 * PLAN 3.4a: Up next adds an exercise with its suggested rest (SPEC 22 rule 6), kept on the session
 * so a reload shows the same rest. Already in the workout: nothing changes.
 */
export async function addSuggested(sessionId: string, exerciseId: string, restSec: number, db: AnyGymDB = defaultDb): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s) throw new Error('Workout not found');
    if (s.endedAt !== undefined) throw new WorkoutFinishedError();
    const ids = s.exerciseIds ?? [];
    if (ids.includes(exerciseId)) return s;
    const next = { ...s, exerciseIds: [...ids, exerciseId], suggestedRest: { ...s.suggestedRest, [exerciseId]: restSec } };
    await db.sessions.put(next);
    return next;
  });
}

/** Writes the workout's exercise order (Reorder in the exercise menu). Must be the same exercises. */
export async function setExerciseOrder(sessionId: string, exerciseIds: string[], db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.endedAt !== undefined) throw new Error('Workout not active');
    const now = s.exerciseIds ?? [];
    if (now.length !== exerciseIds.length || !now.every((id) => exerciseIds.includes(id))) throw new Error('Not the same exercises');
    await db.sessions.put({ ...s, exerciseIds: [...exerciseIds] });
  });
}

/**
 * Takes an exercise with no logged sets out of the workout (Remove in the exercise menu).
 * Returns its position for Undo. An exercise with sets is never removed (its sets would go too).
 */
export async function removeExercise(sessionId: string, exerciseId: string, db: AnyGymDB = defaultDb): Promise<number> {
  return db.transaction('rw', db.sessions, db.sets, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.endedAt !== undefined) throw new Error('Workout not active');
    const has = await db.sets.where('[sessionId+order]').between([sessionId, -Infinity], [sessionId, Infinity]).filter((x) => x.exerciseId === exerciseId).count();
    if (has > 0) throw new Error('Exercise has sets');
    const ids = s.exerciseIds ?? [];
    const at = ids.indexOf(exerciseId);
    if (at === -1) return -1;
    await db.sessions.put({ ...s, exerciseIds: ids.filter((id) => id !== exerciseId) });
    return at;
  });
}

/** Undo of removeExercise: puts it back at its position. Throws WorkoutFinishedError after Finish. */
export async function restoreExercise(sessionId: string, exerciseId: string, at: number, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.endedAt != null) throw new WorkoutFinishedError();
    const ids = (s.exerciseIds ?? []).filter((id) => id !== exerciseId);
    ids.splice(Math.max(0, Math.min(at, ids.length)), 0, exerciseId);
    await db.sessions.put({ ...s, exerciseIds: ids });
  });
}
