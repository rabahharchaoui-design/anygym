// Delete + Undo that survives an app kill (PLAN 1.7h, SPEC 0, 13.1, 13.3).
//
// One tombstone per deleted set, in the `tombstones` table:
//
//   (no tombstone) --deleteSet--> DELETED { set, expiresAt }      one transaction with the delete
//   DELETED --Undo tapped--> UNDO ACCEPTED { undo: true }           its own transaction, committed
//                                                                   before the restore starts
//   UNDO ACCEPTED --restoreSet--> (no tombstone, set is back)       one transaction: put + delete
//   DELETED --window over (expireDelete / recoverDeletes)--> (no tombstone, set stays deleted)
//   any --finishWorkout--> (no tombstone): an accepted Undo is put back first, the rest stay deleted
//
// So the record is consumed only after a successful restore or once its window is over. On every
// start of an active workout (recoverDeletes) an accepted Undo is retried and expired ones are
// cleared; a delete still inside its window simply stays deleted (the toast is gone after a kill).
// An Undo whose acceptance write failed leaves a durable intent instead (db/undoIntents.ts, PLAN
// 1.7k): such a tombstone never expires, recovery retries it, and Finish puts it back.
import { db as defaultDb, type AnyGymDB } from './schema';
import type { WorkoutSet } from './types';
import { dropUndoIntent, forgetUndoFallback, hasUndoIntent } from './undoIntents';
import { WorkoutFinishedError, restoreSet, seedCounter } from './workouts';

/** Records that an Undo was accepted, before writing the set back. False when nothing is left to undo. */
export async function acceptUndo(id: string, db: AnyGymDB = defaultDb): Promise<boolean> {
  return db.transaction('rw', db.tombstones, async () => {
    const t = await db.tombstones.get(id);
    if (!t) return false;
    if (!t.undo) await db.tombstones.put({ ...t, undo: true });
    return true;
  });
}

/**
 * Undo of a delete: accepted first (so a kill or a failed write is retried on the next start),
 * then the stored record is written back. Resolves with the set put back, or undefined when there
 * was nothing to undo (the window is over). Rejects when the write failed (WorkoutFinishedError
 * after Finish); the accepted Undo stays stored for a retry.
 */
export async function undoDelete(id: string, db: AnyGymDB = defaultDb): Promise<WorkoutSet | undefined> {
  if (!(await acceptUndo(id, db))) {
    // Already back (an earlier attempt landed), or nothing to undo.
    return db.sets.get(id);
  }
  const t = await db.tombstones.get(id);
  if (!t) return db.sets.get(id);
  // Only while the tombstone is still there: a "Keep it deleted" that landed first wins.
  if (!(await restoreSet(t.set, db, { ifTombstone: true }))) return undefined;
  forgetUndoFallback(t.sessionId, id);
  return t.set;
}

/**
 * The Undo window of `id` is over: its tombstone goes, unless an Undo was accepted meanwhile or
 * the user asked for one whose acceptance only reached the durable intent (PLAN 1.7k), checked in
 * the same transaction: an unresolved Undo never expires, in this app run or the next.
 */
export async function expireDelete(id: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.tombstones, db.kv, async () => {
    const t = await db.tombstones.get(id);
    if (t && !t.undo && t.expiresAt <= now && !(await hasUndoIntent(t.sessionId, id, db))) await db.tombstones.delete(id);
  });
}

export type Recovery = { restored: string[]; expired: string[]; failed: string[] };

/**
 * App start with a workout in progress: retries every accepted Undo of that workout and clears
 * the tombstones whose window is over. A workout that is no longer active drops its tombstones.
 * Never rejects on a single failed restore: it stays stored and is retried next time. Ids `keep`
 * says yes to are left alone while their window is over (sessionRecovery.ts).
 */
export async function recoverDeletes(sessionId: string, db: AnyGymDB = defaultDb, now = Date.now(), keep: (id: string) => boolean = () => false): Promise<Recovery> {
  const out: Recovery = { restored: [], expired: [], failed: [] };
  const list = await db.tombstones.where('sessionId').equals(sessionId).toArray();
  if (!list.length) return out;
  const session = await db.sessions.get(sessionId);
  const active = !!session && session.endedAt === undefined;
  for (const t of list) {
    if (!active) {
      await db.transaction('rw', db.tombstones, db.kv, async () => {
        await db.tombstones.delete(t.id);
        await dropUndoIntent(sessionId, t.id, db);
      });
      forgetUndoFallback(sessionId, t.id);
      out.expired.push(t.id);
    } else if (t.undo) {
      try {
        if (await restoreSet(t.set, db, { ifTombstone: true })) out.restored.push(t.id);
        forgetUndoFallback(sessionId, t.id);
      } catch (err) {
        if (err instanceof WorkoutFinishedError) await db.tombstones.delete(t.id);
        out.failed.push(t.id);
      }
    } else if (t.expiresAt <= now && !keep(t.id)) {
      // `keep`: an Undo the running app holds as unresolved (PLAN 1.7j) is never expired here.
      await expireDelete(t.id, db, now);
      out.expired.push(t.id);
    }
  }
  return out;
}

/**
 * The user cancelled an Undo that could not be written back (PLAN 1.7i): the set stays deleted and
 * its tombstone goes, accepted or not, so Finish does not put it back after all. One transaction
 * with the Undo intent (PLAN 1.7k), and "Keep it deleted" means deleted: if an automatic recovery
 * already put the set back meanwhile, it is taken out again (the user's last word wins), so Finish
 * can never keep a set the user was told stays deleted.
 */
export async function cancelUndo(id: string, db: AnyGymDB = defaultDb, sessionId?: string): Promise<void> {
  let sid = sessionId;
  await db.transaction('rw', [db.tombstones, db.sets, db.sessions, db.orderCounters, db.kv], async () => {
    const t = await db.tombstones.get(id);
    const set = await db.sets.get(id);
    sid = sid ?? t?.sessionId ?? set?.sessionId;
    await db.tombstones.delete(id);
    if (sid) await dropUndoIntent(sid, id, db);
    if (set && (!sid || set.sessionId === sid)) {
      const session = await db.sessions.get(set.sessionId);
      if (session && session.endedAt === undefined) {
        await seedCounter(set.sessionId, db);
        await db.sets.delete(id);
      }
    }
  });
  if (sid) forgetUndoFallback(sid, id);
}
