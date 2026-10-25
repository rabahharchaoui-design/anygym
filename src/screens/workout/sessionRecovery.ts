// Delete and Undo owned by the workout, not by the mounted screen (PLAN 1.7j, SPEC 13.1, 13.3).
// Minimizing the workout unmounts WorkoutScreen; a queue made by the screen would be made again on
// resume and forget an Undo whose write failed, and Finish would then drop its tombstone and lose
// the set for good. One manager per workout lives for the app's lifetime instead: an unresolved
// Undo keeps Finish blocked across unmounts until it is put back or the user cancels it (a stored
// cancellation). Disposed only after the workout finished or was discarded.
import { db as defaultDb, type AnyGymDB } from '../../db/schema';
import type { WorkoutSet } from '../../db/types';
import { deleteSet } from '../../db/workouts';
import { cancelUndo, expireDelete, recoverDeletes, undoDelete, type Recovery } from '../../db/tombstones';
import { createDeleteUndo, type DeleteUndo } from '../../lib/deleteUndo';

const managers = new Map<string, DeleteUndo<WorkoutSet>>();

/** The workout's delete and Undo manager: the same one every time the screen mounts. */
export function deletesFor(sessionId: string, db: AnyGymDB = defaultDb): DeleteUndo<WorkoutSet> {
  let m = managers.get(sessionId);
  if (!m) {
    m = createDeleteUndo<WorkoutSet>({
      remove: (s) => deleteSet(s.id, db),
      // The Undo is stored as accepted before the set is written back (db/tombstones.ts).
      restore: (s) => undoDelete(s.id, db),
      expire: (s) => expireDelete(s.id, db),
      // A failed Undo the user gives up on: the set stays deleted (PLAN 1.7i).
      cancel: (s) => cancelUndo(s.id, db),
    });
    managers.set(sessionId, m);
  }
  return m;
}

/**
 * Opening the workout (also after an app kill): accepted Undos are retried and finished windows
 * cleared, except for an Undo this app run still holds as unresolved (its acceptance failed to
 * save, so the tombstone does not say so): that record is never expired behind its back.
 */
export function recoverSession(sessionId: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Recovery> {
  const held = new Set(managers.get(sessionId)?.unresolved() ?? []);
  return recoverDeletes(sessionId, db, now, (id) => held.has(id));
}

/** The workout finished or was discarded: its manager goes. */
export function disposeDeletes(sessionId: string): void {
  managers.delete(sessionId);
}
