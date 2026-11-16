// Pace (SPEC 12.2: current pace over a rolling 30 second window; average pace). Pure.
// Pace is seconds per meter inside; pacePerUnit turns it into seconds per mile or km.
// No number the app is not sure of: with too little movement the answer is null ("no pace yet").
import { AVG_PACE_MIN_M, PACE_MIN_M, PACE_MIN_SEC, PACE_WINDOW_SEC } from './types';

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
