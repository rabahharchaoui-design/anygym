// The errors the workout writes throw (split from workouts.ts, PLAN 3.6x).
// Each one is thrown inside a transaction, so nothing is written when it is.

/** Undo after the workout was finished (or discarded): the set is not put back. */
export class WorkoutFinishedError extends Error {
  constructor() {
    super('That workout is already finished');
    this.name = 'WorkoutFinishedError';
  }
}

/** The write of this id committed before and its set was deleted since: it is never logged again. */
export class AlreadyLoggedError extends Error {
  constructor() {
    super('That set was already logged');
    this.name = 'AlreadyLoggedError';
  }
}

/**
 * PLAN 2.0l: a set was logged under this id with other values (another tab gave the same pending
 * row the same revision and logged its own input first). Nothing is written; the committed set stays
 * and the caller keeps its input as a new row, never clears it as if it had been saved.
 */
export class LogConflictError extends Error {
  constructor(readonly rev: number, readonly fp: string) {
    super('A set with other values was logged under this id');
    this.name = 'LogConflictError';
  }
}

/**
 * Delete refused (PLAN 2.0f): a change to this set (an edit or set type change) is journaled and
 * has not landed. Deleting would let Undo bring back the old values while the correction is lost.
 */
export class SetHasPendingChangesError extends Error {
  constructor() {
    super('A change to this set is not saved yet');
    this.name = 'SetHasPendingChangesError';
  }
}

/**
 * Finish refused inside its own transaction (PLAN 2.0e): a write of this workout is still pending
 * (an edit or set type change, or a Log set that did not commit), for example journaled by another
 * tab after this tab's checks. Nothing was changed; the screen asks Try again or Finish without it.
 */
export class UnresolvedDeletesError extends Error {
  constructor(public ids: string[]) {
    super('A deleted set is still waiting for Restore or Keep deleted');
    this.name = 'UnresolvedDeletesError';
  }
}

export class UnsavedWritesError extends Error {
  constructor() {
    super('A change of this workout is not saved yet');
    this.name = 'UnsavedWritesError';
  }
}
