// The share card's privacy zone (PLAN 4.6, SPEC 12.9): the first and last 200 m of the route come
// off the picture. Pure. Trimmed along the solid track only, so a GPS gap is never drawn across
// and never counted as part of the 200 m. A run of 400 m or less has nothing left to draw.
import type { RunPoint } from '../../db/types';
import { fromRunPoint, haversineM, toSegments, type GpsPoint } from '../gps';

/** SPEC 12.9: the first and the last 200 m. */
export const PRIVACY_ZONE_M = 200;

export type TrimmedRoute = {
  /** Solid pieces left after the trim. Empty when the zone covers the whole route. */
  pieces: GpsPoint[][];
  /** True when there was a route and the zone hid all of it. */
  hidden: boolean;
};

const mix = (a: GpsPoint, b: GpsPoint, f: number): GpsPoint => ({
  lat: a.lat + (b.lat - a.lat) * f,
  lng: a.lng + (b.lng - a.lng) * f,
  t: a.t + (b.t - a.t) * f,
  accuracy: Math.max(a.accuracy, b.accuracy),
});

/** The route with `zoneM` removed from each end. Pieces stay split where a gap was. */
export function trimPrivacy(points: readonly RunPoint[], gaps: ReadonlyArray<readonly [number, number]>, zoneM = PRIVACY_ZONE_M): TrimmedRoute {
  type Step = { a: GpsPoint; b: GpsPoint; len: number };
  const pieces: Step[][] = [];
  let total = 0;
  for (const seg of toSegments(points.map(fromRunPoint), gaps)) {
    const steps: Step[] = [];
    for (let i = 1; i < seg.points.length; i++) {
      const a = seg.points[i - 1]!;
      const b = seg.points[i]!;
      const len = haversineM(a, b);
      if (!(len > 0)) continue;
      steps.push({ a, b, len });
      total += len;
    }
    if (steps.length) pieces.push(steps);
  }
  if (!(total > zoneM * 2)) return { pieces: [], hidden: total > 0 };
  const start = zoneM;
  const end = total - zoneM;
  let m = 0;
  const out: GpsPoint[][] = [];
  for (const steps of pieces) {
    const cur: GpsPoint[] = [];
    const push = (p: GpsPoint) => {
      const last = cur[cur.length - 1];
      if (!last || haversineM(last, p) > 0.05) cur.push(p);
    };
    for (const st of steps) {
      const m0 = m;
      m += st.len;
      if (m <= start || m0 >= end) continue;
      const f0 = Math.max(0, (start - m0) / st.len);
      const f1 = Math.min(1, (end - m0) / st.len);
      push(f0 <= 0 ? st.a : mix(st.a, st.b, f0));
      push(f1 >= 1 ? st.b : mix(st.a, st.b, f1));
    }
    if (cur.length >= 2) out.push(cur);
  }
  return { pieces: out, hidden: false };
}
