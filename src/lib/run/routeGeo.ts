// The route as the map draws it (SPEC 12.2: the line in the accent colour, honest dashed gaps).
// Pure: lib/gps cuts and smooths the track; this file only turns the pieces into coordinates.
import type { Run } from '../../db/types';
import { dashedGaps, fromRunPoint, smoothForDrawing, type GpsPoint, type Segment } from '../gps';

/** [lng, lat], the order maps use. */
export type LngLat = [number, number];

export type RouteGeo = {
  /** Solid pieces (each at least two positions). */
  solid: LngLat[][];
  /** The straight joins across a gap or a pause: drawn dashed, never solid. */
  dashed: LngLat[][];
  start: LngLat | null;
  end: LngLat | null;
  /** [west, south, east, north], or null with no position at all. */
  bounds: [number, number, number, number] | null;
};

const at = (p: GpsPoint): LngLat => [p.lng, p.lat];

export function routeGeo(segments: readonly Segment[]): RouteGeo {
  const solid: LngLat[][] = [];
  const dashed: LngLat[][] = [];
  let prevEnd: GpsPoint | null = null;
  let bounds: RouteGeo['bounds'] = null;
  let first: GpsPoint | null = null;
  for (const s of segments) {
    const head = s.points[0];
    if (!head) continue;
    first ??= head;
    if (s.dashedFromPrev && prevEnd) dashed.push([at(prevEnd), at(head)]);
    if (s.points.length > 1) solid.push(s.points.map(at));
    for (const p of s.points) bounds = bounds ? [Math.min(bounds[0], p.lng), Math.min(bounds[1], p.lat), Math.max(bounds[2], p.lng), Math.max(bounds[3], p.lat)] : [p.lng, p.lat, p.lng, p.lat];
    prevEnd = s.points[s.points.length - 1]!;
  }
  return { solid, dashed, start: first ? at(first) : null, end: prevEnd ? at(prevEnd) : null, bounds };
}

/** The live or the stored track, smoothed for drawing, as map coordinates. */
export const drawRoute = (points: readonly GpsPoint[], gaps: ReadonlyArray<readonly [number, number]>): RouteGeo => routeGeo(smoothForDrawing(points, gaps));

/** A stored run's route (PLAN 4.4f 5): dashed only across a GPS gap or a pause, never a shift of the estimate. */
export const drawRunRoute = (run: Pick<Run, 'points' | 'gaps' | 'shifts'>): RouteGeo => drawRoute(run.points.map(fromRunPoint), dashedGaps(run.gaps, run.shifts));
