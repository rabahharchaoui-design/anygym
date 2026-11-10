// PLAN 3.5g (SPEC 13.5): on a short phone the finished warm ups make room for the working sets. Once
// every warm up row is logged, the warm ups at the top fold into one quiet "3 warm ups done" row (a
// tap shows them again). Pure: which logged rows fold, and the double tap guard for a moving table.
import type { SetType } from './setTable';

/** Fewer than this many done warm ups stay as they are (folding one row saves nothing). */
export const FOLD_MIN = 2;

/**
 * How many logged rows, from the top, fold into the one row: the leading run of logged warm ups,
 * only when no warm up row is still to do (and at least FOLD_MIN of them). 0: nothing folds.
 */
export function doneWarmUps(logged: readonly SetType[], pending: readonly SetType[]): number {
  if (pending.includes('warmup')) return 0;
  let n = 0;
  while (n < logged.length && logged[n] === 'warmup') n++;
  return n >= FOLD_MIN ? n : 0;
}

/**
 * PLAN 3.5g: after a check the table may move (the hero shrinks, warm ups fold, the current row scrolls
 * above the rest bar), so the second tap of a double tap can land on another row that moved under the
 * same spot. A ✓ tap within SAME_SPOT_MS of the last one, within SAME_SPOT_PX of the same point, is that
 * second tap and logs nothing (a ✓ elsewhere, the next row, still logs at once: SPEC 13.3).
 */
export const SAME_SPOT_MS = 350;
export const SAME_SPOT_PX = 24;
export type Tap = { x: number; y: number; t: number };
export const sameSpot = (a: Tap | null, b: Tap): boolean => !!a && b.t - a.t >= 0 && b.t - a.t < SAME_SPOT_MS && Math.hypot(b.x - a.x, b.y - a.y) <= SAME_SPOT_PX;

/**
 * A layout change after a check (the hero shrinking, warm ups folding) waits this long, past a quick
 * next tap on the row below (which is then still where it was); a second tap that meets the move
 * anyway is the same spot guard's.
 */
export const SETTLE_MS = 450;

/** "3 warm ups done" */
export const foldWords = (n: number): string => `${n} warm up${n === 1 ? '' : 's'} done`;
