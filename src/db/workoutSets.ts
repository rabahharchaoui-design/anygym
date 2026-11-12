// Logging, editing and reading the sets of a workout (split from workouts.ts, PLAN 3.6x).
import { payloadFp, UNKNOWN_FP } from '../lib/submission';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Load, SetKind, WorkoutSet } from './types';
import { AlreadyLoggedError, LogConflictError, WorkoutFinishedError } from './workoutErrors';

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
  /**
   * PLAN 3.8b (bughunt 1108-0142 #7): the gym the lifter was at when Log was tapped. A set written
   * after a gym switch keeps it (stamped on the set), so the switch cannot re-home it.
   */
  gymId?: string;
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

/**
 * Logs a work set at the end of the workout. Idempotent: if a set with this id exists it is
 * returned unchanged; if it was logged and deleted since, AlreadyLoggedError (never a second
 * copy). Its submission ({ id, rev }) commits in the same transaction (PLAN 1.7h). Order comes from the workout's counter: one past the highest order ever
 * used, deleted sets included, so a set put back by Undo never shares its order with a newer one.
 * Workouts from before the counter (schema v4) start from their highest saved order.
 */
export async function logSet(input: NewSet, db: AnyGymDB = defaultDb): Promise<WorkoutSet> {
  if (!validSet(input)) throw new Error('Invalid set');
  const fp = payloadFp(input);
  return db.transaction('rw', [db.sessions, db.sets, db.orderCounters, db.submissions, db.journal, db.tombstones], async () => {
    const existing = await db.sets.get(input.id);
    const receipt = await db.submissions.get(input.id);
    // Already logged under this id with other values (PLAN 2.0l): never acknowledged as this input.
    // The journal entry stays until the caller's input is kept as a row of its own.
    if (receipt?.fp !== undefined && receipt.fp !== fp) throw new LogConflictError(receipt.rev, receipt.fp);
    // A receipt from before 2.0l has no fingerprint (PLAN 3.2b): a matching revision is not evidence
    // that this input was saved. What the set holds now is compared; other values are a conflict
    // (the input is kept as the next row), never acknowledged.
    if (existing && receipt && receipt.fp === undefined) {
      const saved = payloadFp({ ...(existing.reps !== undefined ? { reps: existing.reps } : {}), ...(existing.seconds !== undefined ? { seconds: existing.seconds } : {}), load: existing.load!, kind: existing.kind, failure: !!existing.failure });
      if (saved !== fp) throw new LogConflictError(receipt.rev, saved);
    }
    if (existing) {
      await db.journal.delete(input.id);
      return existing;
    }
    if (receipt) {
      // Logged before and deleted since. A legacy receipt (no fingerprint) says nothing about the
      // values (PLAN 3.2c): the deleted set's tombstone does when it is still stored; without it the
      // input is never taken as saved (a revision match is not evidence), it is kept as the next row.
      if (receipt.fp === undefined) {
        const gone = (await db.tombstones.get(input.id))?.set;
        const saved = gone?.load ? payloadFp({ ...(gone.reps !== undefined ? { reps: gone.reps } : {}), ...(gone.seconds !== undefined ? { seconds: gone.seconds } : {}), load: gone.load, kind: gone.kind, failure: !!gone.failure }) : UNKNOWN_FP;
        if (saved !== fp) throw new LogConflictError(receipt.rev, saved);
      }
      throw new AlreadyLoggedError();
    }
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
    // Tapped at one gym, written after the workout moved to another: the set stays at the gym it was lifted at.
    if (input.gymId !== undefined && input.gymId !== session.gymId) set.gymId = input.gymId;
    await db.sets.add(set);
    await db.submissions.put({ id: input.id, sessionId: input.sessionId, exerciseId: input.exerciseId, rev: input.rev ?? 0, fp });
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

/** Sets of a workout in logged order. */
export async function setsOf(sessionId: string, db: AnyGymDB = defaultDb): Promise<WorkoutSet[]> {
  return db.sets.where('[sessionId+order]').between([sessionId, -Infinity], [sessionId, Infinity]).toArray();
}
