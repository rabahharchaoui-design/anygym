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
import { db as defaultDb, type AnyGymDB } from './schema';
import type { WorkoutSet } from './types';
import { WorkoutFinishedError, restoreSet } from './workouts';

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
  await restoreSet(t.set, db);
  return t.set;
}

/** The Undo window of `id` is over: its tombstone goes, unless an Undo was accepted meanwhile. */
export async function expireDelete(id: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.tombstones, async () => {
    const t = await db.tombstones.get(id);
    if (t && !t.undo && t.expiresAt <= now) await db.tombstones.delete(id);
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
      await db.tombstones.delete(t.id);
      out.expired.push(t.id);
    } else if (t.undo) {
      try {
        await restoreSet(t.set, db);
        out.restored.push(t.id);
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
 * its tombstone goes, accepted or not, so Finish does not put it back after all.
 */
export async function cancelUndo(id: string, db: AnyGymDB = defaultDb): Promise<void> {
  await db.tombstones.delete(id);
}
