// Standing still (SPEC 12.3 auto pause: under 0.5 m/s for 8 seconds). Pure.
// Speed between two fixes is useless here: GPS wanders a little even when the phone lies on a
// table. So "standing" is judged on the last 8 seconds as a whole, and "moving again" on leaving the
// spot by more than the GPS's own stated uncertainty.
import { haversineM } from './geo';
import { AUTO_PAUSE_SEC, RESUME_RADIUS_CAP_M, STILL_ACCURACY_SHARE, STILL_RADIUS_CAP_M, STILL_RADIUS_M, type GpsPoint } from './types';

/** The recorded points of the last AUTO_PAUSE_SEC seconds of one continuous stretch, oldest first. */
export type Recent = readonly GpsPoint[];

/** Add the newest point and forget what is older than needed: one point at least 8 s old is kept. */
export function pushRecent(recent: Recent, p: GpsPoint): GpsPoint[] {
  const all = [...recent, p];
  let from = 0;
  while (from + 1 < all.length && p.t - all[from + 1]!.t >= AUTO_PAUSE_SEC * 1000) from++;
  return all.slice(from);
}

/** The window spans at least 8 seconds and every point lies within `radius` of the newest one. */
function within(recent: Recent, radius: (p: GpsPoint, newest: GpsPoint) => number): boolean {
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (!first || !last || last.t - first.t < AUTO_PAUSE_SEC * 1000) return false;
  return recent.every((p) => haversineM(p, last) < radius(p, last));
}

/**
 * Standing, for the distance: every point of the last 8 seconds lies within the standing circle of
 * the newest one: STILL_RADIUS_M (4 m, the most anyone covers in 8 s under 0.5 m/s), wider when the
 * fixes say they are less sure (stillRadiusM). Inside it a step is indistinguishable from GPS
 * wander, so it adds no distance. It does not stop the clock: see clockStill.
 */
export const isStill = (recent: Recent): boolean => within(recent, stillRadiusM);

/**
 * Standing, for the moving clock (SPEC 12.3 auto pause, PLAN 4.6a 3): the 4 m rule at any
 * accuracy. A walk at 20 m accuracy covers 8 m in 8 s, inside the wide circle: with the wide circle
 * for the clock too it was mostly counted as standing, so its distance came without its time.
 */
export const clockStill = (recent: Recent): boolean => within(recent, () => STILL_RADIUS_M);

/**
 * The standing circle around the newest fix (PLAN 4.4b 13), for the distance only (PLAN 4.6a 3):
 * it grows with the fixes' stated accuracy (the better of the two), never below STILL_RADIUS_M. A phone lying still at 20 m
 * accuracy wanders well past 4 m in 8 s; with a fixed 4 m circle that wander was never standing and
 * was counted as distance. Half the accuracy: inside 8 s a still phone wanders a fraction of its
 * stated radius, while a full radius would take a 2.5 m/s jog at 20 m for standing (seeded tests).
 */
export const stillRadiusM = (p: GpsPoint, newest: GpsPoint): number => Math.max(STILL_RADIUS_M, Math.min(STILL_RADIUS_CAP_M, Math.min(p.accuracy, newest.accuracy) * STILL_ACCURACY_SHARE));

/**
 * How far from the standing spot counts as moving again: outside the standing circle, and farther
 * than the two fixes could be apart by their own stated accuracy (both radii added), so GPS wander
 * on the spot does not resume the run. With a typical accuracy of 5 m that is 10 m: about three
 * seconds of running. The leg from the spot counts once it is sure, or, when the run stops on the
 * spot first (a pause, the end, a GPS gap) while the 4 m rule said moving, right then (tracker.ts
 * flushStill, PLAN 4.6b). A phone the 4 m rule calls standing never gets it: that is wander.
 */
export const resumeRadiusM = (anchor: GpsPoint, p: GpsPoint): number => Math.max(STILL_RADIUS_M, Math.min(RESUME_RADIUS_CAP_M, anchor.accuracy + p.accuracy));

/** Moving again: the point left the standing spot (`anchor`) by more than resumeRadiusM. */
export const leftStill = (anchor: GpsPoint, p: GpsPoint): boolean => haversineM(anchor, p) > resumeRadiusM(anchor, p);
