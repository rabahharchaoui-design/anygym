// The line to draw (SPEC 12.2 "honest dashed gaps", 12.3 light smoothing). Pure. For drawing only:
// distance never uses anything from this file.
import type { RunPoint } from '../../db/types';
import type { GpsPoint, TrackBreak } from './types';

/** The stored point (db Run.points): [lat, lng, t (ms), accuracy (m)]. */
export const toRunPoint = (p: GpsPoint): RunPoint => [p.lat, p.lng, p.t, p.accuracy];
export const fromRunPoint = ([lat, lng, t, accuracy]: RunPoint): GpsPoint => ({ lat, lng, t, accuracy });

/** The stored breaks (db Run.gaps): [timestamp of the point before, timestamp of the point after]. */
export const toRunGaps = (breaks: readonly TrackBreak[]): Array<[number, number]> => breaks.map((b) => [b.fromT, b.toT]);

/** PLAN 4.4f (5): the breaks that are only a move of the estimate (db Run.shifts, also in Run.gaps). */
export const toRunShifts = (breaks: readonly TrackBreak[]): Array<[number, number]> => toRunGaps(breaks.filter((b) => b.kind === 'shift'));

/**
 * The breaks the line is drawn dashed across: a GPS gap or a pause, never a shift of the estimate
 * (no GPS was lost there; the line goes on). Distance and pace still read every break in Run.gaps.
 */
export function dashedGaps(gaps: ReadonlyArray<readonly [number, number]>, shifts: ReadonlyArray<readonly [number, number]> = []): ReadonlyArray<readonly [number, number]> {
  if (!shifts.length) return gaps;
  const moved = new Set(shifts.map(([a, b]) => `${a}:${b}`));
  return gaps.filter(([a, b]) => !moved.has(`${a}:${b}`));
}

/**
 * One solid piece of line. `dashedFromPrev`: the stretch from the end of the piece before to the
 * start of this one is a gap or a pause; draw it dashed or not at all, never solid.
 */
export type Segment = { points: GpsPoint[]; dashedFromPrev: boolean };

/** Cut the track into solid pieces at the breaks (pairs of timestamps, as stored in Run.gaps). */
export function toSegments(points: readonly GpsPoint[], gaps: ReadonlyArray<readonly [number, number]>): Segment[] {
  const after = new Map(gaps.map(([fromT, toT]) => [fromT, toT]));
  const segments: Segment[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (!prev || after.get(prev.t) === p.t) segments.push({ points: [p], dashedFromPrev: i > 0 });
    else segments[segments.length - 1]!.points.push(p);
  });
  return segments;
}

/** Shortest way round from one longitude to another, so averaging works across the date line. */
const lngDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;

/**
 * Moving average for drawing over `window` points (3 to 5; anything else is pulled into that
 * range, 4 uses 3). The first and the last point stay exactly where they are, so the start marker,
 * the runner's dot and the dashed joins sit on real positions; near the ends the window shrinks to
 * stay centered. Timestamps and accuracy are untouched.
 */
export function smoothPoints(points: readonly GpsPoint[], window = 5): GpsPoint[] {
  const half = window >= 5 ? 2 : 1;
  return points.map((p, i) => {
    const h = Math.min(half, i, points.length - 1 - i);
    if (h === 0) return p;
    let lat = 0;
    let lng = 0;
    for (let k = i - h; k <= i + h; k++) {
      const q = points[k]!;
      lat += q.lat;
      lng += lngDelta(p.lng, q.lng);
    }
    const n = 2 * h + 1;
    return { ...p, lat: lat / n, lng: p.lng + lng / n };
  });
}

/** The track as smoothed solid pieces. The average never crosses a gap or a pause. */
export const smoothForDrawing = (points: readonly GpsPoint[], gaps: ReadonlyArray<readonly [number, number]>, window = 5): Segment[] =>
  toSegments(points, gaps).map((s) => ({ ...s, points: smoothPoints(s.points, window) }));
