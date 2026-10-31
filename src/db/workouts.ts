// Quick workout sessions and their sets (PLAN 1.7, SPEC 2, 5.1). Every write is transactional.
import { planById } from '../data/plans';
import { dayIdOf, dayIndexOf } from '../lib/plans';
import { dayProgress, dayWorkout, doneCounts, type DayProgress } from '../lib/planWorkout';
import { UNDO_MS } from '../lib/undoQueue';
import { newId } from './ids';
import { applyFinishProgress, weekFor } from './planState';
import { db as defaultDb, type AnyGymDB } from './schema';
import { durableRow } from '../lib/durable';

// The localStorage keys of the live tables (lib/drafts.ts, lib/extraSets.ts), mirrored in db.kv.
const DRAFTS_KEY = 'anygym-drafts';
const EXTRA_SETS_KEY = 'anygym-extra-sets';
const REST_KEY = 'anygym-rest';
import { dropSessionIntents, dropUndoIntent, hasUndoIntent } from './undoIntents';
import type { Load, PlanState, Session, SetKind, WorkoutSet } from './types';

/** kv row Finish writes (one at a time): the plan state just before that Finish, for its Undo. */
export const FINISH_PLAN_PREFIX = 'anygym-finish-plan:';
/** PLAN 2.0c: the pending rows (drafts) and added rows a Finish cleared, kept for its Undo. */
export const FINISH_PENDING_PREFIX = 'anygym-finish-pending:';

/**
 * What was still on the workout's tables when it was finished (PLAN 2.0c): the anygym-drafts and
 * anygym-extra-sets values of that workout (null: none). Undo on Today puts them back exactly.
 */
export type FinishPending = { drafts: string | null; extra: string | null; rest?: string | null };

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
    // A picker left open while another tab finished the workout never changes it (PLAN 2.0e).
    if (s.endedAt !== undefined) throw new WorkoutFinishedError();
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
  /** Set type F (PLAN 1.7c): a work set taken to failure. */
  failure?: boolean;
  /** The pending row's draft version this write submits (PLAN 1.7h), kept in its submission. */
  rev?: number;
};

/**
 * Counts and load agree (PLAN 1.7h): a hold (timed load) is seconds and never reps, every other
 * load is reps and never seconds. So an edit can never store "1 second" on a rep based load.
 */
export function validSet(input: Pick<NewSet, 'reps' | 'seconds' | 'load'>): boolean {
  const okReps = input.reps === undefined || (Number.isInteger(input.reps) && input.reps > 0);
  const okSecs = input.seconds === undefined || (Number.isInteger(input.seconds) && input.seconds > 0);
  const timed = input.load.kind === 'timed';
  const okCount = timed ? input.seconds !== undefined && input.reps === undefined : input.reps !== undefined && input.seconds === undefined;
  return okReps && okSecs && okCount && Number.isFinite(input.load.total) && input.load.total >= 0;
}

/** The write of this id committed before and its set was deleted since: it is never logged again. */
export class AlreadyLoggedError extends Error {
  constructor() {
    super('That set was already logged');
    this.name = 'AlreadyLoggedError';
  }
}

/**
 * Logs a work set at the end of the workout. Idempotent: if a set with this id exists it is
 * returned unchanged; if it was logged and deleted since, AlreadyLoggedError (never a second
 * copy). Its submission ({ id, rev }) commits in the same transaction (PLAN 1.7h). Order comes from the workout's counter: one past the highest order ever
 * used, deleted sets included, so a set put back by Undo never shares its order with a newer one.
 * Workouts from before the counter (schema v4) start from their highest saved order.
 */
export async function logSet(input: NewSet, db: AnyGymDB = defaultDb): Promise<WorkoutSet> {
  if (!validSet(input)) throw new Error('Invalid set');
  return db.transaction('rw', [db.sessions, db.sets, db.orderCounters, db.submissions, db.journal], async () => {
    const existing = await db.sets.get(input.id);
    if (existing) {
      await db.journal.delete(input.id);
      return existing;
    }
    if (await db.submissions.get(input.id)) throw new AlreadyLoggedError();
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
    if (input.failure && set.kind === 'work') set.failure = true;
    await db.sets.add(set);
    await db.submissions.put({ id: input.id, sessionId: input.sessionId, exerciseId: input.exerciseId, rev: input.rev ?? 0 });
    // Its pending write journal entry (PLAN 1.7i) is used up in the same transaction.
    await db.journal.delete(input.id);
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
  return db.transaction('rw', db.sessions, db.sets, async () => {
    const set = await db.sets.get(id);
    if (!set) throw new Error('Set not found');
    // A workout that has ended is never changed afterwards (PLAN 1.7k), like updateSetType.
    const session = await db.sessions.get(set.sessionId);
    if (!session || session.endedAt !== undefined) throw new WorkoutFinishedError();
    const next: WorkoutSet = { ...set, load: { ...change.load } };
    // A bar picked for it explicitly resolves an unresolved legacy bar (PLAN 2.0c); otherwise the mark stays.
    if (next.load!.barId !== undefined) delete next.load!.legacyBarUnresolved;
    delete next.reps;
    delete next.seconds;
    if (change.reps !== undefined) next.reps = change.reps;
    if (change.seconds !== undefined) next.seconds = change.seconds;
    await db.sets.put(next);
    return next;
  });
}

/**
 * Changes a logged set's type (PLAN 1.7c): warm up, work, drop, or work to failure. In one
 * transaction with its workout (PLAN 1.7j): a workout that has ended is never changed afterwards
 * (WorkoutFinishedError), so Finish's count and the plan it moved on always match the saved sets.
 */
export async function updateSetType(id: string, kind: SetKind, failure = false, db: AnyGymDB = defaultDb): Promise<WorkoutSet> {
  return db.transaction('rw', db.sessions, db.sets, async () => {
    const set = await db.sets.get(id);
    if (!set) throw new Error('Set not found');
    const session = await db.sessions.get(set.sessionId);
    if (!session || session.endedAt !== undefined) throw new WorkoutFinishedError();
    const next: WorkoutSet = { ...set, kind };
    delete next.failure;
    if (failure && kind === 'work') next.failure = true;
    await db.sets.put(next);
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
  return db.transaction('rw', [db.sessions, db.sets, db.orderCounters, db.tombstones], async () => {
    const set = await db.sets.get(id);
    if (!set) return undefined;
    const session = await db.sessions.get(set.sessionId);
    if (!session || session.endedAt !== undefined) throw new WorkoutFinishedError();
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

/** Undo after the workout was finished (or discarded): the set is not put back. */
export class WorkoutFinishedError extends Error {
  constructor() {
    super('That workout is already finished');
    this.name = 'WorkoutFinishedError';
  }
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
        await dropUndoIntent(set.sessionId, set.id, db);
        return !!(await db.sets.get(set.id));
      }
      if ('token' in opts && t.token !== opts.token) return false;
      record = t.set;
    }
    await seedCounter(record.sessionId, db, record.order + 1);
    await db.sets.put({ ...record });
    // Restored: its tombstone and Undo intent are used up in the same transaction.
    await db.tombstones.delete(record.id);
    await dropUndoIntent(record.sessionId, record.id, db);
    return true;
  });
}

/** Sets of a workout in logged order. */
export async function setsOf(sessionId: string, db: AnyGymDB = defaultDb): Promise<WorkoutSet[]> {
  return db.sets.where('[sessionId+order]').between([sessionId, -Infinity], [sessionId, Infinity]).toArray();
}

/** How much of its plan day a session covered, or undefined for a quick workout or unknown day. */
async function planProgress(s: Session, db: AnyGymDB): Promise<DayProgress | undefined> {
  const plan = planById(s.planId);
  const i = plan ? dayIndexOf(plan, s.dayId) : -1;
  if (!plan || i < 0) return undefined;
  const entries = dayWorkout(plan, i, s.weekIndex ?? 0);
  const done = doneCounts(entries, await db.sets.where('sessionId').equals(s.id).toArray());
  return dayProgress(entries, (id) => done[id] ?? 0);
}

export type FinishResult = { saved: true; sets: number; progress?: DayProgress } | { saved: false };

/** kv rows of the change revision counters (db/mutations.ts), one per workout, set and kind. */
export const MUTATION_REV_PREFIX = 'anygym-mutrev:';

/**
 * Finish refused inside its own transaction (PLAN 2.0e): a write of this workout is still pending
 * (an edit or set type change, or a Log set that did not commit), for example journaled by another
 * tab after this tab's checks. Nothing was changed; the screen asks Try again or Finish without it.
 */
export class UnsavedWritesError extends Error {
  constructor() {
    super('A change of this workout is not saved yet');
    this.name = 'UnsavedWritesError';
  }
}

/**
 * Ends the workout. With sets it is saved (endedAt); with none it is deleted, never kept as an
 * empty session. Finishing twice is safe. A saved plan day moves the plan on (applyFinishProgress).
 */
export async function finishWorkout(sessionId: string, db: AnyGymDB = defaultDb, now = Date.now(), pending?: FinishPending): Promise<FinishResult> {
  return db.transaction('rw', [db.sessions, db.sets, db.planState, db.orderCounters, db.tombstones, db.submissions, db.journal, db.kv], async () => {
    const s = await db.sessions.get(sessionId);
    if (s && s.endedAt === undefined) {
      // Read again here, never trusted from the screen's checks (PLAN 2.0e): a change or Log set
      // journaled since (another tab) that has not landed refuses Finish before anything changes.
      for (const j of await db.journal.where('sessionId').equals(sessionId).toArray()) {
        if (j.mutation || !((await db.sets.get(j.id)) || (await db.submissions.get(j.id)))) throw new UnsavedWritesError();
      }
      // An Undo that was accepted but never written back (PLAN 1.7h) lands now, and so does one
      // the user asked for whose acceptance only reached the durable intent (PLAN 1.7k); every
      // other deleted set stays deleted (no Undo after Finish).
      for (const t of await db.tombstones.where('sessionId').equals(sessionId).toArray()) {
        const wanted = t.undo || (await hasUndoIntent(sessionId, t.id, db));
        if (wanted && !(await db.sets.get(t.id))) {
          await seedCounter(sessionId, db, t.set.order + 1);
          await db.sets.put({ ...t.set });
        }
      }
      await db.tombstones.where('sessionId').equals(sessionId).delete();
      await dropSessionIntents(sessionId, db);
      // Finish runs only once no failed row is left (rowLog.prepareFinish): the journal is done.
      await db.journal.where('sessionId').equals(sessionId).delete();
      await db.kv.where('key').startsWith(`${MUTATION_REV_PREFIX}${sessionId}:`).delete();
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
      return { saved: false };
    }
    const progress = await planProgress(s, db);
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
      await db.sessions.put({ ...s, endedAt: now });
      // 60% or more of the day's working sets moves the plan on, less keeps the day (PLAN 2.0a).
      // Only here, as the workout ends: finishing again never moves it twice.
      await applyFinishProgress(s, progress, db);
    }
    return progress ? { saved: true, sets: count, progress } : { saved: true, sets: count };
  });
}

/**
 * Undo for "Workout saved" (SPEC 13.1: undo, never a confirm): the finished workout is active
 * again, and the plan pointer goes back exactly to `planBefore` (day position, done days, week),
 * taken just before Finish. Refused (false) when the workout is gone, still active, or another
 * workout has started since; the plan is only restored when it is still the same plan.
 */
export async function reopenWorkout(sessionId: string, given?: PlanState, db: AnyGymDB = defaultDb): Promise<boolean> {
  return (await reopenWorkoutWithPending(sessionId, given, db)).ok;
}

/**
 * reopenWorkout, also handing back the pending and added rows Finish kept (PLAN 2.0c), taken out
 * in the same transaction. Their durable copies (db.kv anygym-drafts, anygym-extra-sets) are
 * written there too, so they survive a kill right after Undo even when localStorage refuses them;
 * the caller puts them into the runtime stores (lib/finishPending.ts restorePending).
 */
export async function reopenWorkoutWithPending(sessionId: string, given?: PlanState, db: AnyGymDB = defaultDb): Promise<{ ok: boolean; pending: FinishPending | null }> {
  return db.transaction('rw', db.sessions, db.planState, db.kv, async () => {
    const s = await db.sessions.get(sessionId);
    if (!s || s.endedAt === undefined || s.imported) return { ok: false, pending: null };
    if (await getActiveSession(db)) return { ok: false, pending: null };
    const { endedAt: _ended, ...open } = s;
    await db.sessions.put(open);
    // The copy Finish kept in its own transaction wins; `given` only for a Finish from before it existed.
    const kept = await db.kv.get(FINISH_PLAN_PREFIX + sessionId);
    await db.kv.delete(FINISH_PLAN_PREFIX + sessionId);
    const planBefore = kept?.value ? (JSON.parse(kept.value) as PlanState) : given;
    const now = await db.planState.get('active');
    if (planBefore && now && now.planId === planBefore.planId && s.planId === planBefore.planId) await db.planState.put(planBefore);
    const row = await db.kv.get(FINISH_PENDING_PREFIX + sessionId);
    await db.kv.delete(FINISH_PENDING_PREFIX + sessionId);
    const pending = parsePending(row?.value ?? null);
    if (pending) {
      if (pending.drafts !== null) await db.kv.put(durableRow(DRAFTS_KEY, pending.drafts));
      if (pending.extra !== null) await db.kv.put(durableRow(EXTRA_SETS_KEY, pending.extra));
      // The running rest with its original deadline (PLAN 2.0c), never a fresh countdown.
      if (pending.rest) await db.kv.put(durableRow(REST_KEY, pending.rest));
    }
    return { ok: true, pending };
  });
}

function parsePending(value: string | null): FinishPending | null {
  if (!value) return null;
  try {
    const v = JSON.parse(value) as Partial<FinishPending>;
    const str = (x: unknown) => (typeof x === 'string' ? x : null);
    const p = { drafts: str(v.drafts), extra: str(v.extra), rest: str(v.rest) };
    return p.drafts === null && p.extra === null && p.rest === null ? null : p;
  } catch {
    return null;
  }
}
