// Pace (SPEC 12.2: current pace over a rolling 30 second window; average pace). Pure.
// Pace is seconds per meter inside; pacePerUnit turns it into seconds per mile or km.
// No number the app is not sure of: with too little movement the answer is null ("no pace yet").
import { AVG_PACE_MIN_M, PACE_MIN_M, PACE_MIN_SEC, PACE_WINDOW_SEC, SPEED_PACE_SEC, STILL_SPEED_MPS, type GpsPoint } from './types';

/** Running totals at one recorded point: moving time, and the distance covered while time counted. */
export type PaceSample = { movingMs: number; timedM: number };

/** Add the newest totals; keeps one sample at least PACE_WINDOW_SEC of moving time old. */
export function pushPace(window: readonly PaceSample[], s: PaceSample): PaceSample[] {
  const all = [...window, s];
  let from = 0;
  while (from + 1 < all.length && s.movingMs - all[from + 1]!.movingMs >= PACE_WINDOW_SEC * 1000) from++;
  return all.slice(from);
}

/**
 * Current pace in seconds per meter over the window, or null when the window holds less than
 * PACE_MIN_SEC of moving time or less than PACE_MIN_M of distance.
 */
export function currentPace(window: readonly PaceSample[]): number | null {
  const first = window[0];
  const last = window[window.length - 1];
  if (!first || !last) return null;
  const sec = (last.movingMs - first.movingMs) / 1000;
  const m = last.timedM - first.timedM;
  return sec < PACE_MIN_SEC || m < PACE_MIN_M ? null : sec / m;
}

/**
 * Average pace in seconds per meter: moving time over the distance covered while time counted
 * (distance bridged across a gap has no time, so it is left out). Null under AVG_PACE_MIN_M.
 */
export function averagePace(movingSec: number, timedM: number): number | null {
  return timedM < AVG_PACE_MIN_M || movingSec <= 0 ? null : movingSec / timedM;
}

/** Seconds per unit (unitM meters: a mile or a km) from seconds per meter. Null stays null. */
export const pacePerUnit = (secPerM: number | null, unitM: number): number | null => (secPerM === null ? null : secPerM * unitM);

/**
 * The phone's own speeds (PLAN 4.4d), newest last: the last SPEED_PACE_SEC of them, and at least
 * the last two. `fresh`: a new stretch starts (after a pause or a gap): the old ones go.
 */
export function pushSpeed(speeds: ReadonlyArray<readonly [number, number]>, p: GpsPoint, fresh = false): Array<readonly [number, number]> {
  const all = [...(fresh ? [] : speeds), [p.t, p.speed!] as const];
  let from = 0;
  while (all.length - from > 2 && p.t - all[from]![0] > SPEED_PACE_SEC * 1000) from++;
  return all.slice(from);
}

/**
 * Current pace from the phone's own speeds (seconds per meter): their mean over the last
 * SPEED_PACE_SEC, when the newest is the last good point's and there are at least two (one
 * reading alone is no pace yet). Null otherwise, or under the standing speed: the window over the
 * distance (currentPace) answers then. A measured speed, never a guess; it follows a change of
 * effort within a few seconds, where the distance window needs most of its length.
 */
export function speedPace(speeds: ReadonlyArray<readonly [number, number]>, last: GpsPoint | null): number | null {
  const newest = speeds[speeds.length - 1];
  if (!last || !newest || newest[0] !== last.t || speeds.length < 2) return null;
  const mean = speeds.reduce((sum, s) => sum + s[1], 0) / speeds.length;
  return mean < STILL_SPEED_MPS ? null : 1 / mean;
}
