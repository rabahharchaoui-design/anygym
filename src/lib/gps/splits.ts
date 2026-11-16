// Splits (SPEC 12.3: per mile or per km). Pure. Fed one step at a time, so the voice coach can
// speak at the moment a split completes; the finish screen reads the same state.
import { PACE_MIN_M } from './types';

/**
 * One split. `distanceM` is the split length for a full split and what was covered so far for the
 * last partial one. `sec` is moving time. `timedM` is the part of the distance that has time (all
 * of it unless a gap was bridged); `gap` says a GPS gap fell inside, so the split is not a fair
 * candidate for "best split".
 */
export type Split = { index: number; distanceM: number; sec: number; timedM: number; gap: boolean };

type Open = { distanceM: number; ms: number; timedM: number; gap: boolean };

export type SplitState = { unitM: number; full: readonly Split[]; open: Open };

/** One move forward: distance, the moving time it took, whether that time is real, whether it crossed a gap. */
export type SplitStep = { distanceM: number; ms: number; timed: boolean; gap: boolean };

/** Float sums of many steps may land a hair short of a boundary; this close counts as on it. */
const EPS_M = 1e-6;

const NOTHING: Open = { distanceM: 0, ms: 0, timedM: 0, gap: false };

export function startSplits(unitM: number): SplitState {
  if (!(unitM > 0)) throw new Error('split length must be positive');
  return { unitM, full: [], open: NOTHING };
}

/**
 * Add one step. A boundary crossed inside the step is interpolated: time is shared out in
 * proportion to distance, so a step that crosses a boundary 40% of the way gives 40% of its time to
 * the split that ends there. A long step may complete several splits. Returns the new state and
 * the splits this step completed.
 */
export function addSplitStep(state: SplitState, step: SplitStep): { state: SplitState; completed: Split[] } {
  const completed: Split[] = [];
  let open = state.open;
  let leftM = step.distanceM;
  let leftMs = step.ms;
  while (leftM >= state.unitM - open.distanceM - EPS_M) {
    const takeM = Math.min(leftM, state.unitM - open.distanceM);
    const takeMs = leftM > 0 ? leftMs * (takeM / leftM) : leftMs;
    completed.push({
      index: state.full.length + completed.length + 1,
      distanceM: state.unitM,
      sec: (open.ms + takeMs) / 1000,
      timedM: open.timedM + (step.timed ? takeM : 0),
      gap: open.gap || step.gap,
    });
    leftM -= takeM;
    leftMs -= takeMs;
    open = NOTHING;
  }
  open = { distanceM: open.distanceM + leftM, ms: open.ms + leftMs, timedM: open.timedM + (step.timed ? leftM : 0), gap: open.gap || (step.gap && leftM > 0) };
  return { state: { unitM: state.unitM, full: completed.length ? [...state.full, ...completed] : state.full, open }, completed };
}

/** The finished splits, and the last partial one kept separate (null when nothing is in it). */
export function readSplits(state: SplitState): { full: readonly Split[]; partial: Split | null } {
  const { open } = state;
  const empty = open.distanceM === 0 && open.ms === 0;
  return { full: state.full, partial: empty ? null : { index: state.full.length + 1, distanceM: open.distanceM, sec: open.ms / 1000, timedM: open.timedM, gap: open.gap } };
}

/** A split's pace in seconds per meter over its timed distance, or null when that is under PACE_MIN_M. */
export const splitPace = (s: Split): number | null => (s.timedM < PACE_MIN_M || s.sec <= 0 ? null : s.sec / s.timedM);
