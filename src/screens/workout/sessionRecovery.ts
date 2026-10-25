// Delete and Undo owned by the workout, not by the mounted screen (PLAN 1.7j, SPEC 13.1, 13.3).
// Minimizing the workout unmounts WorkoutScreen; a queue made by the screen would be made again on
// resume and forget an Undo whose write failed, and Finish would then drop its tombstone and lose
// the set for good. One manager per workout lives for the app's lifetime instead: an unresolved
// Undo keeps Finish blocked across unmounts until it is put back or the user cancels it (a stored
// cancellation). Disposed only after the workout finished or was discarded.
// Across a restart (PLAN 1.7k): every Undo stores its intent durably before it is attempted
// (db/undoIntents.ts). Recovery reads those intents, retries them, never expires their tombstones,
// and hands what is still not back to the manager as unresolved, so Finish stays blocked and the
// Undo sheet can retry or cancel it. Recovery and Finish share one readiness promise per workout.
import { db as defaultDb, type AnyGymDB } from '../../db/schema';
import type { WorkoutSet } from '../../db/types';
import { WorkoutFinishedError, deleteSet } from '../../db/workouts';
import { acceptUndo, cancelUndo, expireDelete, recoverDeletes, undoDelete, type Recovery } from '../../db/tombstones';
import { dropUndoIntent, forgetUndoFallback, readUndoIntents, rememberUndo } from '../../db/undoIntents';
import { createDeleteUndo, type DeleteUndo } from '../../lib/deleteUndo';

const managers = new Map<string, DeleteUndo<WorkoutSet>>();
const recoveries = new Map<string, { run: Promise<Recovery>; failed: boolean }>();

/** The intent of an Undo that has nothing left to do (its window was over, or Finish came first). */
async function dropIntent(s: WorkoutSet, db: AnyGymDB): Promise<void> {
  await db.transaction('rw', db.kv, () => dropUndoIntent(s.sessionId, s.id, db)).catch(() => undefined);
  forgetUndoFallback(s.sessionId, s.id);
}

/** The workout's delete and Undo manager: the same one every time the screen mounts. */
export function deletesFor(sessionId: string, db: AnyGymDB = defaultDb): DeleteUndo<WorkoutSet> {
  let m = managers.get(sessionId);
  if (!m) {
    m = createDeleteUndo<WorkoutSet>({
      remove: (s) => deleteSet(s.id, db),
      // The intent is stored first (PLAN 1.7k), then the Undo is stored as accepted before the set
      // is written back (db/tombstones.ts): a failed acceptance still survives a restart.
      restore: async (s) => {
        const remembered = await rememberUndo(s.sessionId, s.id, db).then(
          () => true,
          () => false,
        );
        try {
          const back = await undoDelete(s.id, db);
          if (!back) await dropIntent(s, db);
          return back;
        } catch (err) {
          if (err instanceof WorkoutFinishedError) await dropIntent(s, db);
          else if (!remembered) await rememberUndo(s.sessionId, s.id, db).catch(() => undefined);
          throw err;
        }
      },
      expire: (s) => expireDelete(s.id, db),
      // A failed Undo the user gives up on: the set stays deleted (PLAN 1.7i), for sure (1.7k).
      cancel: (s) => cancelUndo(s.id, db, s.sessionId),
    });
    managers.set(sessionId, m);
  }
  return m;
}

async function recoverNow(sessionId: string, db: AnyGymDB, now: number): Promise<Recovery> {
  const m = deletesFor(sessionId, db);
  const intents = new Set(await readUndoIntents(sessionId, db));
  // An Undo the user asked for whose acceptance never reached the tombstone: accepted now, so the
  // restore below retries it. A failed acceptance is fine: its intent still holds the tombstone.
  for (const id of intents) await acceptUndo(id, db).catch(() => false);
  const held = new Set([...m.unresolved(), ...intents]);
  const out = await recoverDeletes(sessionId, db, now, (id) => held.has(id));
  // Put back by recovery: nothing is left to retry or to cancel ("Keep it deleted" never shows for it).
  for (const id of out.restored) m.resolve(id);
  const left = await db.tombstones.where('sessionId').equals(sessionId).toArray();
  const leftIds = new Set(left.map((t) => t.id));
  // Asked for and still not back: unresolved, so Finish waits and the Undo sheet offers a choice.
  for (const t of left) if (t.undo || intents.has(t.id)) m.hydrate(t.set);
  // An intent whose tombstone is gone (restored, cancelled or cleared): used up.
  for (const id of intents) if (!leftIds.has(id)) await dropIntent({ id, sessionId } as WorkoutSet, db);
  return out;
}

/**
 * Opening the workout (also after an app kill): accepted Undos and stored Undo intents are retried
 * and finished windows cleared, except for an Undo still unresolved (held by this app run or by its
 * stored intent): that record is never expired behind its back. Runs one at a time per workout.
 */
export function recoverSession(sessionId: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Recovery> {
  const prev = recoveries.get(sessionId)?.run ?? Promise.resolve();
  const entry = { run: prev.catch(() => undefined).then(() => recoverNow(sessionId, db, now)), failed: false };
  entry.run.catch(() => {
    entry.failed = true;
  });
  recoveries.set(sessionId, entry);
  return entry.run;
}

/**
 * Finish waits for this (PLAN 1.7k): the workout's recovery has run and its unresolved Undos are
 * in the manager. A recovery that failed runs again; rejects when it fails again (Finish refuses).
 */
export function recoveryReady(sessionId: string, db: AnyGymDB = defaultDb): Promise<Recovery> {
  const last = recoveries.get(sessionId);
  if (last && !last.failed) return last.run;
  return recoverSession(sessionId, db);
}

/** The workout finished or was discarded: its manager goes. */
export function disposeDeletes(sessionId: string): void {
  managers.delete(sessionId);
  recoveries.delete(sessionId);
}
