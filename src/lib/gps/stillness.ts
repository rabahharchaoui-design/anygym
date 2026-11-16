// Standing still (SPEC 12.3 auto pause: under 0.5 m/s for 8 seconds). Pure.
// Speed between two fixes is useless here: GPS wanders a little even when the phone lies on a
// table. So "standing" is judged on the last 8 seconds as a whole, and "moving again" on leaving the
// spot by more than the GPS's own stated uncertainty.
import { haversineM } from './geo';
import { AUTO_PAUSE_SEC, STILL_RADIUS_M, type GpsPoint } from './types';

/** The recorded points of the last AUTO_PAUSE_SEC seconds of one continuous stretch, oldest first. */
export type Recent = readonly GpsPoint[];

/** Add the newest point and forget what is older than needed: one point at least 8 s old is kept. */
export function pushRecent(recent: Recent, p: GpsPoint): GpsPoint[] {
  const all = [...recent, p];
  let from = 0;
  while (from + 1 < all.length && p.t - all[from + 1]!.t >= AUTO_PAUSE_SEC * 1000) from++;
  return all.slice(from);
}

/**
 * Standing: the window spans at least 8 seconds and every point in it lies within STILL_RADIUS_M
 * (4 m: the most anyone covers in 8 s under 0.5 m/s) of the newest one.
 */
export function isStill(recent: Recent): boolean {
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.t - first.t < AUTO_PAUSE_SEC * 1000) return false;
  return recent.every((p) => haversineM(p, last) < STILL_RADIUS_M);
}

/**
 * How far from the standing spot counts as moving again: outside the standing circle, and farther
 * than the two fixes could be apart by their own stated accuracy (both radii added), so GPS wander
 * on the spot does not resume the run. With a typical accuracy of 5 m that is 10 m: about three
 * seconds of running. Nothing is lost by waiting: the leg from the spot counts once it is sure.
 */
export const resumeRadiusM = (anchor: GpsPoint, p: GpsPoint): number => Math.max(STILL_RADIUS_M, anchor.accuracy + p.accuracy);

/** Moving again: the point left the standing spot (`anchor`) by more than resumeRadiusM. */
export const leftStill = (anchor: GpsPoint, p: GpsPoint): boolean => haversineM(anchor, p) > resumeRadiusM(anchor, p);
