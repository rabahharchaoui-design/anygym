// The personal strength estimate (SPEC 15). INTERNAL ONLY: SPEC 6 says no estimated 1 rep max is
// ever shown. It compares a lift with itself over time; the words the user sees are weights and reps.
import type { Unit } from '../../db/types';
import { comparableWeight, estimatedMax } from '../load';
import { DAY_MS } from './time';
import type { LiftSession } from './types';

/**
 * A workout's best estimate for one lift, in `unit`: the best working set (warm ups and drops are
 * never in LiftSession.sets; a set with no rep, a failed attempt, counts for nothing). null when no
 * set says anything (bodyweight with nothing added, holds).
 */
export function sessionEstimate(s: Pick<LiftSession, 'sets'>, unit: Unit): number | null {
  let best: number | null = null;
  for (const set of s.sets) {
    if (set.load.kind === 'timed' || set.load.kind === 'bodyweight') continue;
    const e = estimatedMax(comparableWeight(set.load, unit), set.reps);
    if (e !== null && (best === null || e > best)) best = e;
  }
  return best;
}

/** How much of the new value an exponential moving average keeps (SPEC 15: smoothed per lift). */
export const SMOOTHING = 0.5;

/** The smoothed estimate after each workout, oldest first (exponential moving average). */
export function smoothed(values: readonly number[], alpha = SMOOTHING): number[] {
  const out: number[] = [];
  for (const v of values) out.push(out.length ? alpha * v + (1 - alpha) * out[out.length - 1]! : v);
  return out;
}

/** The lift's current smoothed estimate, or null with nothing to go on. */
export function currentEstimate(sessions: readonly LiftSession[], unit: Unit): number | null {
  const values = [...sessions].reverse().map((s) => sessionEstimate(s, unit)).filter((v): v is number => v !== null);
  const sm = smoothed(values);
  return sm.length ? sm[sm.length - 1]! : null;
}

/** The window the personal rate is learned from (SPEC 15: the last 4 to 8 weeks). */
export const RATE_WINDOW_WEEKS = 8;
export const RATE_MIN_SPAN_WEEKS = 3;
export const RATE_MIN_SESSIONS = 3;

/**
 * The lift's own weekly gain as a share (0.02 = about 2% a week), from the smoothed estimates of
 * the last 8 weeks: a least squares slope over the mean. null with under 3 workouts or under 3
 * weeks between the first and the last (too little to learn from; the fixed defaults apply).
 */
export function weeklyRate(sessions: readonly LiftSession[], unit: Unit, now: number): number | null {
  const from = now - RATE_WINDOW_WEEKS * 7 * DAY_MS;
  const points = [...sessions]
    .filter((s) => s.date >= from && s.date <= now)
    .reverse()
    .map((s) => ({ t: s.date, v: sessionEstimate(s, unit) }))
    .filter((p): p is { t: number; v: number } => p.v !== null);
  if (points.length < RATE_MIN_SESSIONS) return null;
  const span = (points[points.length - 1]!.t - points[0]!.t) / (7 * DAY_MS);
  if (span < RATE_MIN_SPAN_WEEKS) return null;
  const sm = smoothed(points.map((p) => p.v));
  const xs = points.map((p) => (p.t - points[0]!.t) / (7 * DAY_MS));
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = sm.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (sm[i]! - my);
    den += (xs[i]! - mx) ** 2;
  }
  if (den === 0 || my <= 0) return null;
  return num / den / my;
}

/** Share between the biggest and smallest of these estimates (0.008 = 0.8%). */
export function spread(values: readonly number[]): number {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo > 0 ? (hi - lo) / lo : 0;
}
