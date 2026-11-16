// What a change on one row of the set table carries to (SPEC 20.2, gate 3; 3.6z A17). One rule for
// the weight and the reps: a working row's change goes to it and the working rows below it, never
// into a warm up; a warm up's, or a first timer's light test set's (PLAN 3.8), stays on that row.
// Pure: rows in, rows out.

type Row = { index: number; type: string; reps?: number };

/** The rows a change on `from` lands on: `from`, then the working rows below it unless it is a warm up or the test set. */
export function carryRows<R extends Row>(rows: readonly R[], from: R, testSet: boolean): R[] {
  if (from.type === 'warmup' || testSet) return [from];
  return rows.filter((r) => r.index >= from.index && r.type !== 'warmup');
}

/**
 * The rows below `from` that a reps change carries to: the same rows as a weight change, but only
 * those still holding the old number and never one whose reps the person set by hand (`own`).
 */
export function repsCarryRows<R extends Row>(rows: readonly R[], from: R, testSet: boolean, oldReps: number | undefined, own: (r: R) => boolean): R[] {
  if (oldReps === undefined) return [];
  return carryRows(rows, from, testSet).filter((r) => r.index > from.index && r.reps === oldReps && !own(r));
}
