// Best efforts on a stored run (PLAN 4.6, SPEC 12.9). Pure. A time counts only along a continuous
// stretch: a GPS gap breaks it (that distance has no honest time), and a step faster than the
// tracker's own speed limit is not a human effort. Nothing here is guessed past the points.
import type { RunPoint } from '../../db/types';
import { fromRunPoint, haversineM, MAX_SPEED_MPS, type GpsPoint } from '../gps';

/** One sample of a continuous stretch: meters and seconds from the stretch's own start. */
export type TimedSample = { m: number; sec: number };

/** Float noise only. A meter short of the distance is not the distance. */
const EPS_M = 1e-3;

const ordered = (points: readonly RunPoint[]): GpsPoint[] =>
  points
    .map(fromRunPoint)
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);

const gapAt = (gaps: ReadonlyArray<readonly [number, number]>): Map<number, number> => new Map(gaps.map(([from, to]) => [from, to]));

/** A step the clock can stand behind, or null when a gap, a clock error or an impossible speed breaks the stretch. */
function stepOf(a: GpsPoint, b: GpsPoint, gaps: Map<number, number>): { dist: number; sec: number } | null {
  if (gaps.get(a.t) === b.t) return null;
  const sec = (b.t - a.t) / 1000;
  const dist = haversineM(a, b);
  if (!(sec > 0) || !Number.isFinite(dist) || dist / sec > MAX_SPEED_MPS + 1e-6) return null;
  return { dist, sec };
}

function push(seg: TimedSample[], step: { dist: number; sec: number }): TimedSample[] {
  const last = seg[seg.length - 1] ?? { m: 0, sec: 0 };
  return [...seg, { m: last.m + step.dist, sec: last.sec + step.sec }];
}

/** Every continuous stretch, in order. A break starts a new one; a stretch of one sample is not returned. */
export function timedSegments(points: readonly RunPoint[], gaps: ReadonlyArray<readonly [number, number]>): TimedSample[][] {
  const pts = ordered(points);
  const gapsAt = gapAt(gaps);
  const out: TimedSample[][] = [];
  let cur: TimedSample[] = pts.length ? [{ m: 0, sec: 0 }] : [];
  for (let i = 1; i < pts.length; i++) {
    const step = stepOf(pts[i - 1]!, pts[i]!, gapsAt);
    if (!step) {
      if (cur.length > 1) out.push(cur);
      cur = [{ m: 0, sec: 0 }];
    } else cur = push(cur, step);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** The stretch from the first point until the first break. Empty when the run has no point. */
export function stretchFromStart(points: readonly RunPoint[], gaps: ReadonlyArray<readonly [number, number]>): TimedSample[] {
  const pts = ordered(points);
  if (!pts.length) return [];
  const gapsAt = gapAt(gaps);
  let cur: TimedSample[] = [{ m: 0, sec: 0 }];
  for (let i = 1; i < pts.length; i++) {
    const step = stepOf(pts[i - 1]!, pts[i]!, gapsAt);
    if (!step) break;
    cur = push(cur, step);
  }
  return cur;
}

/** How far the run goes from the start before the first break, in meters. */
export const openMeters = (points: readonly RunPoint[], gaps: ReadonlyArray<readonly [number, number]>): number => {
  const seg = stretchFromStart(points, gaps);
  return seg.length ? seg[seg.length - 1]!.m : 0;
};

/** Seconds to cover `distanceM` starting at sample `from`, interpolating the last step. Null when the stretch is short of it. */
function coverSec(seg: readonly TimedSample[], from: number, distanceM: number): number | null {
  if (!(distanceM > 0) || from >= seg.length) return null;
  const origin = seg[from]!;
  const need = origin.m + distanceM;
  let j = from + 1;
  while (j < seg.length && seg[j]!.m < need - EPS_M) j++;
  if (j >= seg.length) return null;
  const a = seg[j - 1]!;
  const b = seg[j]!;
  if (b.m + EPS_M < need) return null;
  const span = b.m - a.m;
  const frac = span > EPS_M ? Math.min(1, Math.max(0, (need - a.m) / span)) : 1;
  const dt = a.sec + (b.sec - a.sec) * frac - origin.sec;
  if (!(dt > 0) || distanceM / dt > MAX_SPEED_MPS + 1e-6) return null;
  return dt;
}

/** Fastest seconds to cover `distanceM` inside any one stretch. Null when no stretch reaches it. */
export function bestEffortSec(points: readonly RunPoint[], gaps: ReadonlyArray<readonly [number, number]>, distanceM: number): number | null {
  if (!(distanceM > 0)) return null;
  let best: number | null = null;
  for (const seg of timedSegments(points, gaps)) {
    let j = 1;
    for (let i = 0; i < seg.length; i++) {
      const need = seg[i]!.m + distanceM;
      while (j < seg.length && seg[j]!.m < need - EPS_M) j++;
      if (j >= seg.length) break;
      const dt = coverSec(seg, i, distanceM);
      if (dt !== null && (best === null || dt < best)) best = dt;
    }
  }
  return best;
}

/** Seconds from the start of the run to cover `distanceM`, stopping at the first break. */
export const timeFromStartSec = (points: readonly RunPoint[], gaps: ReadonlyArray<readonly [number, number]>, distanceM: number): number | null =>
  coverSec(stretchFromStart(points, gaps), 0, distanceM);
