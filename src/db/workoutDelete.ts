// Deleting a set and putting it back (Undo), with the order counter they share (split from workouts.ts, PLAN 3.6x).
import { UNDO_MS } from '../lib/undoQueue';
import { newId } from './ids';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { WorkoutSet } from './types';
import { dropUndoIntent } from './undoIntents';
import { SetHasPendingChangesError, WorkoutFinishedError } from './workoutErrors';
import { restoredKey } from './workoutKeys';

/**
 * Deletes a set for good. Returns the deleted record (for undo) or undefined if it was gone. In
 * the same transaction its tombstone keeps the record until the Undo window ends (PLAN 1.7h), so
 * an Undo survives an app kill (db/tombstones.ts). A finished (or missing) workout is never
 * changed (PLAN 2.0e): WorkoutFinishedError, with no counter or tombstone written.
 */
export async function deleteSet(id: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<WorkoutSet | undefined> {
  return (await deleteSetToken(id, db, now))?.set;
}

/**
 * deleteSet, also handing back the deletion's own token (PLAN 2.0e): every deletion of a set gets a
 * new one, so an Undo or a recovery that read an older tombstone can never restore it over a newer
 * deletion of the same set (db/tombstones.ts).
 */
export async function deleteSetToken(id: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<{ set: WorkoutSet; token: string } | undefined> {
  return db.transaction('rw', [db.sessions, db.sets, db.orderCounters, db.tombstones, db.journal], async () => {
    const set = await db.sets.get(id);
    if (!set) return undefined;
    const session = await db.sessions.get(set.sessionId);
    if (!session || session.endedAt !== undefined) throw new WorkoutFinishedError();
    if ((await db.journal.where('sessionId').equals(set.sessionId).toArray()).some((j) => j.mutation?.setId === id)) throw new SetHasPendingChangesError();
    await seedCounter(set.sessionId, db);
    await db.sets.delete(id);
    const token = newId();
    await db.tombstones.put({ id, sessionId: set.sessionId, set, expiresAt: now + UNDO_MS, token });
    return { set, token };
  });
}

/**
 * A workout logged before the counter (schema v4) gets one now, from its highest saved order, in
 * the caller's transaction and before anything is deleted: so deleting its newest set, logging
 * another and Undo can never share an order.
 */
export async function seedCounter(sessionId: string, db: AnyGymDB, atLeast = 0): Promise<void> {
  const counter = await db.orderCounters.get(sessionId);
  const last = await db.sets.where('[sessionId+order]').between([sessionId, -Infinity], [sessionId, Infinity]).last();
  const next = Math.max(counter?.next ?? 0, last ? last.order + 1 : 0, atLeast);
  if (next !== counter?.next) await db.orderCounters.put({ sessionId, next });
}

/**
 * Puts a deleted set back exactly as it was: same id, same order. In the same transaction it
 * checks that its workout still exists and is in progress; otherwise nothing is written and it
 * throws WorkoutFinishedError, so a set can never land in a finished or deleted workout.
 * `ifTombstone` (Undo and recovery, PLAN 1.7k): only while its tombstone is still stored, checked in
 * the same transaction, so a "Keep it deleted" that committed first is never undone by a stale
 * restore. With `token` (PLAN 2.0e) only while that very deletion is stored: a set put back, edited
 * and deleted again since has a new token, and the older restore changes nothing (the newer
 * deletion and its Undo intent stay). The tombstone's own record is what is written back.
 * Resolves true when the set is back (or already was), false when nothing was restored.
 * The stored Undo intent (db/undoIntents.ts) is used up in the same transaction.
 */
export async function restoreSet(set: WorkoutSet, db: AnyGymDB = defaultDb, opts: { ifTombstone?: boolean; token?: string } = {}): Promise<boolean> {
  return db.transaction('rw', [db.sessions, db.sets, db.orderCounters, db.tombstones, db.kv], async () => {
    const session = await db.sessions.get(set.sessionId);
    if (!session || session.endedAt != null) throw new WorkoutFinishedError();
    let record = set;
    if (opts.ifTombstone) {
      const t = await db.tombstones.get(set.id);
      if (!t) {
        await dropUndoIntent(set.sessionId, set.id, db, opts.token);
        return !!(await db.sets.get(set.id));
      }
      if ('token' in opts && t.token !== opts.token) return false;
      record = t.set;
    }
    await seedCounter(record.sessionId, db, record.order + 1);
    await db.sets.put({ ...record });
    // The exercise is a member of the workout again if it was removed while this Undo was waiting (PLAN 2.0j).
    if (!(session.exerciseIds ?? []).includes(record.exerciseId)) await db.sessions.put({ ...session, exerciseIds: [...(session.exerciseIds ?? []), record.exerciseId] });
    // Restored: its tombstone and Undo intent are used up in the same transaction.
    const deletion = opts.ifTombstone ? (await db.tombstones.get(record.id))?.token : undefined;
    await db.tombstones.delete(record.id);
    await dropUndoIntent(record.sessionId, record.id, db, deletion);
    // Which deletion this copy came back from (PLAN 2.0f): a late "Keep it deleted" for that very
    // deletion may take the copy out again, one for any other never does.
    if (deletion !== undefined) await db.kv.put({ key: restoredKey(record.sessionId, record.id), value: deletion, at: Date.now() });
    return true;
  });
}
