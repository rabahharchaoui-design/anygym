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
// PLAN 2.0e: a tombstone this app run does not hold (left by an earlier run, whose Undo may have been
// tapped with every store failing) is never expired by time: it comes back as unresolved too, so
// Finish refuses until the user picks Restore or Keep deleted. Each deletion's token is kept, so a
// delayed Undo or expiry never touches a newer deletion of the same set.
import { db as defaultDb, type AnyGymDB } from '../../db/schema';
import type { WorkoutSet } from '../../db/types';
import { pendingMutations } from '../../db/mutations';
import { SetHasPendingChangesError, WorkoutFinishedError, deleteSetToken } from '../../db/workouts';
import { acceptUndo, cancelUndo, expireDelete, recoverDeletes, undoDelete, type Recovery } from '../../db/tombstones';
import { dropUndoIntent, forgetUndoFallback, readUndoIntentList, rememberUndo } from '../../db/undoIntents';
import { createDeleteUndo, type DeleteUndo } from '../../lib/deleteUndo';

const managers = new Map<string, DeleteUndo<WorkoutSet>>();
const recoveries = new Map<string, { run: Promise<Recovery>; failed: boolean }>();
/** Per workout: the token of each set's latest deletion in this app run (PLAN 2.0e). */
const tokens = new Map<string, Map<string, string>>();
/** Per workout: deleted sets left by an earlier app run with no Undo asked for (only the wording differs). */
const leftOver = new Map<string, Set<string>>();

const tokensOf = (sessionId: string) => {
  let t = tokens.get(sessionId);
  if (!t) tokens.set(sessionId, (t = new Map()));
  return t;
};

/** True when this deleted set came back from an earlier app run without an Undo asked for (PLAN 2.0e). */
export function isLeftOver(sessionId: string, setId: string): boolean {
  return leftOver.get(sessionId)?.has(setId) ?? false;
}

/** The intent of an Undo that has nothing left to do (its window was over, or Finish came first). */
async function dropIntent(s: WorkoutSet, db: AnyGymDB, token?: string): Promise<void> {
  await db.transaction('rw', db.kv, () => dropUndoIntent(s.sessionId, s.id, db, token)).catch(() => undefined);
  forgetUndoFallback(s.sessionId, s.id, undefined, token);
}

/** The deletions of this workout the running app holds (set id -> token), for Finish (PLAN 2.0f). */
export function ownedDeletes(sessionId: string): ReadonlyMap<string, string> {
  return tokensOf(sessionId);
}

/** The workout's delete and Undo manager: the same one every time the screen mounts. */
export function deletesFor(sessionId: string, db: AnyGymDB = defaultDb): DeleteUndo<WorkoutSet> {
  let m = managers.get(sessionId);
  if (!m) {
    const own = tokensOf(sessionId);
    m = createDeleteUndo<WorkoutSet>({
      remove: async (s) => {
        // A change to this set that is held in memory or the fallback (its journal write failed) also
        // blocks the delete (PLAN 2.0f); journaled ones are checked in the delete's own transaction.
        if ((await pendingMutations(s.sessionId, db)).some((j) => j.mutation?.setId === s.id)) throw new SetHasPendingChangesError();
        const gone = await deleteSetToken(s.id, db);
        if (gone) own.set(s.id, gone.token);
        return gone?.set;
      },
      // The intent is stored first (PLAN 1.7k), then the Undo is stored as accepted before the set
      // is written back (db/tombstones.ts): a failed acceptance still survives a restart.
      restore: async (s) => {
        const remembered = await rememberUndo(s.sessionId, s.id, db, undefined, own.get(s.id)).then(
          () => true,
          () => false,
        );
        try {
          const back = await undoDelete(s.id, db, own.get(s.id));
          if (!back) await dropIntent(s, db, own.get(s.id));
          return back;
        } catch (err) {
          if (err instanceof WorkoutFinishedError) await dropIntent(s, db, own.get(s.id));
          else if (!remembered) await rememberUndo(s.sessionId, s.id, db, undefined, own.get(s.id)).catch(() => undefined);
          throw err;
        }
      },
      expire: (s) => expireDelete(s.id, db, Date.now(), own.get(s.id)),
      // A failed Undo the user gives up on: the set stays deleted (PLAN 1.7i), for sure (1.7k).
      cancel: async (s) => {
        await cancelUndo(s.id, db, s.sessionId, own.get(s.id));
        leftOver.get(sessionId)?.delete(s.id);
      },
    });
    managers.set(sessionId, m);
  }
  return m;
}

async function recoverNow(sessionId: string, db: AnyGymDB, now: number): Promise<Recovery> {
  const m = deletesFor(sessionId, db);
  const intentList = await readUndoIntentList(sessionId, db);
  const intents = new Set(intentList.map((x) => x.setId));
  // An Undo the user asked for whose acceptance never reached the tombstone: accepted now, so the
  // restore below retries it. A failed acceptance is fine: its intent still holds the tombstone.
  // Only for the deletion the intent was made for (PLAN 2.0f).
  for (const x of intentList) await acceptUndo(x.setId, db, x.token).catch(() => false);
  const out = await recoverDeletes(sessionId, db, now);
  // Put back by recovery: nothing is left to retry or to cancel ("Keep it deleted" never shows for it).
  for (const id of out.restored) {
    m.resolve(id);
    leftOver.get(sessionId)?.delete(id);
  }
  const left = await db.tombstones.where('sessionId').equals(sessionId).toArray();
  const own = tokensOf(sessionId);
  for (const t of left) {
    // Every held record keeps its deletion's token (PLAN 2.0f), so Restore and Keep deleted from it
    // can never reach a newer deletion.
    if (t.token !== undefined && (t.undo || intents.has(t.id) || !m.canUndo(t.id))) own.set(t.id, t.token);
    // Asked for and still not back: unresolved, so Finish waits and the Undo sheet offers a choice.
    const asked = t.undo || intentList.some((x) => x.setId === t.id && (x.token === undefined || t.token === undefined || x.token === t.token));
    if (asked) m.hydrate(t.set);
    else if (!m.canUndo(t.id)) {
      // Not held by this app run (PLAN 2.0e): an earlier run deleted it and may have been asked to
      // undo it with every store failing. Never dropped by time: Restore or Keep deleted decides.
      m.hydrate(t.set);
      const set = leftOver.get(sessionId) ?? new Set<string>();
      set.add(t.id);
      leftOver.set(sessionId, set);
    }
  }
  // An intent whose tombstone is gone (restored, cancelled or cleared): used up.
  for (const x of intentList) {
    const t = left.find((y) => y.id === x.setId);
    if (!t) await dropIntent({ id: x.setId, sessionId } as WorkoutSet, db, x.token);
    else if (x.token !== undefined && t.token !== undefined && x.token !== t.token) await dropIntent(t.set, db, x.token);
  }
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
  tokens.delete(sessionId);
  leftOver.delete(sessionId);
}
