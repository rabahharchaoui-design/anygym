// Delete + Undo that survives an app kill (PLAN 1.7h, SPEC 0, 13.1, 13.3).
//
// One tombstone per deleted set, in the `tombstones` table:
//
//   (no tombstone) --deleteSet--> DELETED { set, expiresAt }      one transaction with the delete
//   DELETED --Undo tapped--> UNDO ACCEPTED { undo: true }           its own transaction, committed
//                                                                   before the restore starts
//   UNDO ACCEPTED --restoreSet--> (no tombstone, set is back)       one transaction: put + delete
//   DELETED --window over in the running app (expireDelete)--> (no tombstone, set stays deleted)
//   any --finishWorkout--> (no tombstone): an accepted Undo is put back first, the rest stay deleted
//
// So the record is consumed only after a successful restore, once the running app saw its window
// end without an Undo, or by the user's "Keep it deleted". On every start of an active workout
// (recoverDeletes) an accepted Undo is retried. Elapsed time alone never drops a tombstone after a
// restart (PLAN 2.0e): the app cannot know whether an Undo was tapped whose every store failed, so
// a tombstone the running app does not hold waits for Restore or Keep deleted (sessionRecovery.ts),
// and Finish refuses meanwhile. An Undo whose acceptance write failed leaves a durable intent
// instead when it can (db/undoIntents.ts, PLAN 1.7k).
// Every deletion has its own token (PLAN 2.0e): accepting, restoring and expiring check it in their
// transaction, so a delayed operation that read an older deletion never touches a newer one.
import { db as defaultDb, type AnyGymDB } from './schema';
import type { WorkoutSet } from './types';
import { dropUndoIntent, forgetUndoFallback, hasUndoIntent } from './undoIntents';
import { WorkoutFinishedError, restoreSet, seedCounter } from './workouts';

/** Records that an Undo was accepted, before writing the set back. False when nothing is left to undo. */
export async function acceptUndo(id: string, db: AnyGymDB = defaultDb, token?: string): Promise<boolean> {
  return (await acceptToken(id, db, token)) !== false;
}

/**
 * acceptUndo, handing back the accepted deletion's token (undefined for a tombstone from before
 * 2.0e). With `token`, only that deletion is accepted (false for a newer one of the same set).
 */
async function acceptToken(id: string, db: AnyGymDB, token?: string): Promise<{ token: string | undefined; set: WorkoutSet } | false> {
  return db.transaction('rw', db.tombstones, async () => {
    const t = await db.tombstones.get(id);
    if (!t || (token !== undefined && t.token !== token)) return false;
    if (!t.undo) await db.tombstones.put({ ...t, undo: true });
    return { token: t.token, set: t.set };
  });
}

/**
 * Undo of a delete: accepted first (so a kill or a failed write is retried on the next start),
 * then the stored record is written back. Resolves with the set put back, or undefined when there
 * was nothing to undo (the window is over). Rejects when the write failed (WorkoutFinishedError
 * after Finish); the accepted Undo stays stored for a retry. `token`: only that deletion (PLAN 2.0e).
 */
export async function undoDelete(id: string, db: AnyGymDB = defaultDb, token?: string): Promise<WorkoutSet | undefined> {
  const accepted = await acceptToken(id, db, token);
  // Already back (an earlier attempt landed), nothing to undo, or a newer deletion of the set.
  if (!accepted) return (await db.tombstones.get(id)) ? undefined : db.sets.get(id);
  // Only while this very deletion is still stored: a "Keep it deleted" that landed first, or a
  // newer deletion of the same set (PLAN 2.0e), wins.
  if (!(await restoreSet(accepted.set, db, { ifTombstone: true, token: accepted.token }))) return undefined;
  forgetUndoFallback(accepted.set.sessionId, id);
  return accepted.set;
}

/**
 * The Undo window of `id` is over in the running app: its tombstone goes, unless an Undo was
 * accepted meanwhile or the user asked for one whose acceptance only reached the durable intent
 * (PLAN 1.7k), checked in the same transaction: an unresolved Undo never expires, in this app run
 * or the next. With `token` (PLAN 2.0e) only that deletion, never a newer one of the same set.
 */
export async function expireDelete(id: string, db: AnyGymDB = defaultDb, now = Date.now(), token?: string): Promise<void> {
  await db.transaction('rw', db.tombstones, db.kv, async () => {
    const t = await db.tombstones.get(id);
    if (!t || (token !== undefined && t.token !== token)) return;
    if (!t.undo && t.expiresAt <= now && !(await hasUndoIntent(t.sessionId, id, db))) await db.tombstones.delete(id);
  });
}

export type Recovery = { restored: string[]; expired: string[]; failed: string[] };

/**
 * App start with a workout in progress: retries every accepted Undo of that workout (only while
 * that very deletion is stored, PLAN 2.0e). A workout that is no longer active drops its
 * tombstones. Never rejects on a single failed restore: it stays stored and is retried next time.
 * A tombstone with no accepted Undo is left as it is, however old (PLAN 2.0e): only the user's
 * Restore or Keep deleted, or Finish, ends it. `_now` and `_keep` are unused (kept for callers).
 */
export async function recoverDeletes(sessionId: string, db: AnyGymDB = defaultDb, _now = Date.now(), _keep: (id: string) => boolean = () => false): Promise<Recovery> {
  const out: Recovery = { restored: [], expired: [], failed: [] };
  const list = await db.tombstones.where('sessionId').equals(sessionId).toArray();
  if (!list.length) return out;
  const session = await db.sessions.get(sessionId);
  const active = !!session && session.endedAt === undefined;
  for (const t of list) {
    if (!active) {
      await db.transaction('rw', db.tombstones, db.kv, async () => {
        const now = await db.tombstones.get(t.id);
        if (now && now.token !== t.token) return;
        await db.tombstones.delete(t.id);
        await dropUndoIntent(sessionId, t.id, db);
      });
      forgetUndoFallback(sessionId, t.id);
      out.expired.push(t.id);
    } else if (t.undo) {
      try {
        if (await restoreSet(t.set, db, { ifTombstone: true, token: t.token })) {
          out.restored.push(t.id);
          forgetUndoFallback(sessionId, t.id);
        }
      } catch (err) {
        if (err instanceof WorkoutFinishedError) await db.tombstones.delete(t.id);
        out.failed.push(t.id);
      }
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
