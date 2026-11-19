// Standing, moving and settling rules of the tracker that read the phone's own speed or the first
// fixes of a run (PLAN 4.4d). Pure; split from tracker.ts, which uses them.
import { haversineM } from './geo';
import { isStill, type Recent } from './stillness';
import { SPEED_MEMORY_SEC, SPEED_MOVING_MPS, STILL_BY_SPEED_SEC, STILL_SPEED_MPS, STILL_TRUST_M, type GpsPoint } from './types';
import type { TrackerState } from './tracker';

/**
 * Standing by the window's rule, unless the phone's own speed says the runner is moving, or the
 * estimate is too unsure for its positions to tell a walk from standing (STILL_TRUST_M, PLAN 4.4d).
 */
export const standsAt = (recent: Recent, p: GpsPoint, rule: (r: Recent) => boolean = isStill): boolean =>
  rule(recent) && p.accuracy <= STILL_TRUST_M && !(p.speed !== undefined && p.speed >= SPEED_MOVING_MPS);

/**
 * Standing for the distance by the phone's own speed (PLAN 4.4d): the last speeds, over at least
 * STILL_BY_SPEED_SEC, all under the standing speed. Sooner than the 8 s window, so a stop at a light
 * adds no meters of the estimate running on. The clock keeps its own rule (SPEC 12.3, 8 s).
 */
export function stillBySpeed(state: TrackerState, p: GpsPoint): boolean {
  if (p.speed !== undefined && p.speed >= STILL_SPEED_MPS) return false;
  const c = state.calm;
  return !!c && p.t - c.since >= STILL_BY_SPEED_SEC * 1000 && calmNow(state, p);
}

/** The phone's speed said standing on its last reading, recently enough to still hold (SPEED_MEMORY_SEC). */
export const calmNow = (state: TrackerState, p: GpsPoint): boolean =>
  p.speed !== undefined ? p.speed < STILL_SPEED_MPS : !!state.calm && p.t - state.calm.last <= SPEED_MEMORY_SEC * 1000;

/** The phone's speed is known now (this fix, or a recent reading): positions do not decide. */
export const speedKnown = (state: TrackerState, p: GpsPoint): boolean => p.speed !== undefined || calmNow(state, p);

/** The settling fixes with the newest: kept while each agrees with the one before within both accuracies, else it starts again. */
export function settleWith(chain: readonly GpsPoint[], q: GpsPoint): GpsPoint[] {
  const last = chain[chain.length - 1];
  return last && haversineM(last, q) <= last.accuracy + q.accuracy ? [...chain, q] : [q];
}

