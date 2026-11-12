// Finishing a workout: save it, discard it if empty, move the plan on (split from workouts.ts, PLAN 3.6x).
import { planById } from '../data/plans';
import { dayIndexOf } from '../lib/plans';
import { adjustEntries, dayProgress, dayWorkout, doneCounts, type DayProgress } from '../lib/planWorkout';
import { rowAdjustments } from '../lib/extraSets';
import { slotProgress } from '../lib/swap';
import { trimmedPlan } from '../lib/timeBudget';
import { applyFinishProgress } from './planState';
import { db as defaultDb, type AnyGymDB } from './schema';
import { dropSessionIntents, hasUndoIntent } from './undoIntents';
import { phone, readFallback, type KV } from './mutationFallback';
import { withSessionLock } from './sessionLock';
import type { JournalEntry, Session } from './types';
import { seedCounter } from './workoutDelete';
import { UnresolvedDeletesError, UnsavedWritesError } from './workoutErrors';
import {
  FINISH_PENDING_PREFIX,
  FINISH_PLAN_PREFIX,
  LOG_CANCEL_PREFIX,
  MUTATION_DONE_PREFIX,
  MUTATION_HELD_PREFIX,
  MUTATION_REV_PREFIX,
  MUTATION_SUP_PREFIX,
  RESTORED_PREFIX,
  type FinishPending,
} from './workoutKeys';

/** How much of its plan day a session covered, or undefined for a quick workout or unknown day. */
async function planProgress(s: Session, db: AnyGymDB, adjust: Session['rowAdjust'] = s.rowAdjust): Promise<DayProgress | undefined> {
  const plan = planById(s.planId);
  const i = plan ? dayIndexOf(plan, s.dayId) : -1;
  if (!plan || i < 0) return undefined;
  // A changed workout counts one slot per plan exercise, whatever filled it (PLAN 3.4).
  // A time budget trim (PLAN 3.6) is the day this workout really had.
  const day = dayWorkout(trimmedPlan(plan, i, s.trim, s.weekIndex ?? 0), i, s.weekIndex ?? 0);
  if (s.swaps?.length) return slotProgress(day, s.swaps, adjust, await db.sets.where('sessionId').equals(s.id).toArray());
  // The rows the lifter really had (PLAN 2.2d round 2: + Add set and Remove set count).
  const entries = adjustEntries(day, adjust);
  const done = doneCounts(entries, await db.sets.where('sessionId').equals(s.id).toArray());
  return dayProgress(entries, (id) => done[id] ?? 0);
}

export type FinishResult = { saved: true; sets: number; progress?: DayProgress } | { saved: false };

/**
 * A change of this workout that is held outside the journal (the localStorage fallback another tab
 * may have just written, or a restored one stored durably) and is not superseded by a change that
 * landed (PLAN 2.0i). Read inside Finish's transaction, so it sees what the screen's checks missed.
 */
async function hasHeldChange(sessionId: string, db: AnyGymDB, ls: KV | null): Promise<boolean> {
  const held: JournalEntry[] = readFallback(ls).filter((e) => e.sessionId === sessionId);
  for (const row of await db.kv.where('key').startsWith(`${MUTATION_HELD_PREFIX}${sessionId}:`).toArray()) {
    try {
      held.push(JSON.parse(row.value ?? '') as JournalEntry);
    } catch {
      /* an unreadable row holds nothing */
    }
  }
  if (!held.length) return false;
  const sup = new Set((await db.kv.where('key').startsWith(`${MUTATION_SUP_PREFIX}${sessionId}:`).primaryKeys()).map((k) => String(k).slice(`${MUTATION_SUP_PREFIX}${sessionId}:`.length)));
  return held.some((e) => !!e.mutation && !sup.has(e.id));
}

/**
 * Ends the workout. With sets it is saved (endedAt); with none it is deleted, never kept as an
 * empty session. Finishing twice is safe. A saved plan day moves the plan on (applyFinishProgress).
 * `owned` (PLAN 2.0f): set id -> token of each deletion the caller knows and has resolved or holds.
 * Given, a stored tombstone it does not know (another tab's, whose Undo may have failed) is never
 * discarded: Finish throws UnresolvedDeletesError until Restore or Keep deleted resolves it.
 */
export async function finishWorkout(sessionId: string, db: AnyGymDB = defaultDb, now = Date.now(), pending?: FinishPending, owned?: ReadonlyMap<string, string>, ls: KV | null = phone()): Promise<FinishResult> {
  // Under the workout's lock (PLAN 2.0j): a correction another tab is registering is either seen by
  // the check below or rejected afterwards (it finds the workout ended), never accepted and lost.
  return withSessionLock(sessionId, () => finishLocked(sessionId, db, now, pending, owned, ls));
}

async function finishLocked(sessionId: string, db: AnyGymDB, now: number, pending: FinishPending | undefined, owned: ReadonlyMap<string, string> | undefined, ls: KV | null): Promise<FinishResult> {
  return db.transaction('rw', [db.sessions, db.sets, db.planState, db.orderCounters, db.tombstones, db.submissions, db.journal, db.kv], async () => {
    const s = await db.sessions.get(sessionId);
    if (s && s.endedAt === undefined) {
      // Read again here, never trusted from the screen's checks (PLAN 2.0e): a change or Log set
      // journaled since (another tab) that has not landed refuses Finish before anything changes.
      for (const j of await db.journal.where('sessionId').equals(sessionId).toArray()) {
        if (j.mutation || !((await db.sets.get(j.id)) || (await db.submissions.get(j.id)))) throw new UnsavedWritesError();
      }
      // A correction another tab could not journal waits in the shared fallback (PLAN 2.0i): finishing
      // now would end the workout under it and Try again would then discard it.
      if (await hasHeldChange(sessionId, db, ls)) throw new UnsavedWritesError();
      // An Undo that was accepted but never written back (PLAN 1.7h) lands now, and so does one
      // the user asked for whose acceptance only reached the durable intent (PLAN 1.7k); every
      // other deleted set stays deleted (no Undo after Finish).
      const tombs = await db.tombstones.where('sessionId').equals(sessionId).toArray();
      const members = [...(s.exerciseIds ?? [])];
      if (owned) {
        const unknown: string[] = [];
        for (const t of tombs) if (!t.undo && !(owned.has(t.id) && owned.get(t.id) === t.token) && !(await hasUndoIntent(sessionId, t.id, db, undefined, t.token))) unknown.push(t.id);
        if (unknown.length) throw new UnresolvedDeletesError(unknown);
      }
      for (const t of tombs) {
        const wanted = t.undo || (await hasUndoIntent(sessionId, t.id, db, undefined, t.token));
        if (wanted && !(await db.sets.get(t.id))) {
          await seedCounter(sessionId, db, t.set.order + 1);
          await db.sets.put({ ...t.set });
          if (!members.includes(t.set.exerciseId)) members.push(t.set.exerciseId);
        }
      }
      if (members.length !== (s.exerciseIds ?? []).length) {
        s.exerciseIds = members;
        await db.sessions.put({ ...s });
      }
      await db.tombstones.where('sessionId').equals(sessionId).delete();
      await dropSessionIntents(sessionId, db);
      await db.kv.where('key').startsWith(`${RESTORED_PREFIX}${sessionId}:`).delete();
      // Finish runs only once no failed row is left (rowLog.prepareFinish): the journal is done.
      await db.journal.where('sessionId').equals(sessionId).delete();
      // The change revision counters stay (PLAN 3.2b): Finish then Undo reopens the workout, and a
      // correction made then must never reuse an operation id a suspended tab still holds.
      await db.kv.where('key').startsWith(`${MUTATION_HELD_PREFIX}${sessionId}:`).delete();
      // The supersession markers stay (PLAN 2.0i): Finish then Undo reopens the workout, and a held copy
      // a later save superseded must stay superseded. They go with the workout (discarded below).
      // Submission receipts stay for the workout's lifetime (PLAN 1.7i): if Finish is undone and
      // stale drafts come back, they are reconciled against these and never logged a second time.
    }
    const count = await db.sets.where('sessionId').equals(sessionId).count();
    if (!s) return { saved: false };
    if (count === 0) {
      // Discarded: nothing can reopen it, so its receipts and pending journal go with it.
      await db.sessions.delete(sessionId);
      await db.orderCounters.delete(sessionId);
      await db.submissions.where('sessionId').equals(sessionId).delete();
      await db.kv.where('key').startsWith(`${MUTATION_DONE_PREFIX}${sessionId}:`).delete();
      await db.kv.where('key').startsWith(`${MUTATION_SUP_PREFIX}${sessionId}:`).delete();
      await db.kv.where('key').startsWith(`${MUTATION_REV_PREFIX}${sessionId}:`).delete();
      await db.kv.where('key').startsWith(`${LOG_CANCEL_PREFIX}${sessionId}:`).delete();
      return { saved: false };
    }
    // The rows added or removed by hand, as the workout ends (from the kept extra sets value and
    // the sets as saved here), stored on the session for the finish screen (PLAN 2.2d round 2).
    const adjust = s.endedAt === undefined && pending ? rowAdjustments(pending.extra, sessionId, new Set((await db.sets.where('sessionId').equals(sessionId).primaryKeys()) as string[])) : s.rowAdjust;
    const progress = await planProgress(s, db, adjust);
    if (s.endedAt === undefined) {
      // Where the plan stood just before this Finish, read and kept in the same transaction, so
      // "Workout saved · Undo" puts it back exactly, however the finish screen was reached (a
      // reload or a link loses the screen's own state). Only the latest Finish can be undone.
      await db.kv.where('key').startsWith(FINISH_PLAN_PREFIX).delete();
      await db.kv.where('key').startsWith(FINISH_PENDING_PREFIX).delete();
      const before = await db.planState.get('active');
      if (before) await db.kv.put({ key: FINISH_PLAN_PREFIX + sessionId, value: JSON.stringify(before), at: now });
      // The pending and added rows go with the plan state, so Undo restores the tables exactly (PLAN 2.0c).
      if (pending && (pending.drafts !== null || pending.extra !== null || (pending.rest ?? null) !== null)) await db.kv.put({ key: FINISH_PENDING_PREFIX + sessionId, value: JSON.stringify(pending), at: now });
      const ended: Session = { ...s, endedAt: now };
      if (adjust && Object.keys(adjust).length) ended.rowAdjust = { ...adjust };
      else delete ended.rowAdjust;
      await db.sessions.put(ended);
      // 60% or more of the day's working sets moves the plan on, less keeps the day (PLAN 2.0a).
      // Only here, as the workout ends: finishing again never moves it twice.
      await applyFinishProgress(s, progress, db);
    }
    return progress ? { saved: true, sets: count, progress } : { saved: true, sets: count };
  });
}
