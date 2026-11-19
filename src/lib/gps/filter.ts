// The filter (SPEC 12.3): which reported positions are trusted. Pure.
import { haversineM } from './geo';
import { GAP_BRIDGE_MAX_SEC, GAP_SEC, MAX_SPEED_MPS, POOR_ACCURACY_M, type GpsPoint, type RawPoint, type RejectReason } from './types';

/**
 * How a trusted point joins the one before it.
 * - `first`: nothing to join (the first point, or the first after a pause by hand).
 * - `step`: the next fix of a continuous stretch.
 * - `gap`: no good point for longer than GAP_SEC. `bridged` says whether the straight line across
 *   may be counted as distance.
 */
export type Verdict =
  | { ok: false; reason: RejectReason }
  | { ok: true; point: GpsPoint; link: 'first' | 'step' }
  | { ok: true; point: GpsPoint; link: 'gap'; bridged: boolean };

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

/** The point with every field present and sane, or the reason it has none. */
function readPoint(raw: RawPoint): GpsPoint | RejectReason {
  if (!finite(raw.t)) return 'no-time';
  if (!finite(raw.lat) || !finite(raw.lng) || Math.abs(raw.lat) > 90 || Math.abs(raw.lng) > 180) return 'bad-position';
  // A missing accuracy is not a good accuracy: the phone did not say how sure it is.
  if (!finite(raw.accuracy) || raw.accuracy < 0 || raw.accuracy > POOR_ACCURACY_M) return 'accuracy';
  // A speed is kept only when the phone gave a real one (iPhone says -1 or null without a GPS lock).
  const speed = finite(raw.speed) && raw.speed >= 0 && raw.speed <= MAX_SPEED_MPS ? { speed: raw.speed } : {};
  return { lat: raw.lat, lng: raw.lng, t: raw.t, accuracy: raw.accuracy, ...speed };
}

/**
 * Judge one reported position against the previous good point (`prev`, null for none).
 *
 * Dropped: no timestamp, a timestamp not after the previous good point's, a position off the globe,
 * no accuracy or one worse than POOR_ACCURACY_M (65 m, PLAN 4.4d), and a jump faster than 8 m/s since the previous good point.
 *
 * After a gap (more than GAP_SEC since the previous good point) the point is judged against the
 * gap's real time, never dropped for distance alone. It is always kept, as a fresh start of the
 * line; the straight line across is counted (`bridged`) only when the implied speed is at most
 * 8 m/s and the gap is at most GAP_BRIDGE_MAX_SEC long. Otherwise that distance is unknown and is
 * not counted. This also means one bad point can never block the track for longer than GAP_SEC.
 *
 * `fresh` (the first point after a pause by hand): only the timestamp order is checked against
 * `prev`, because the runner may have gone anywhere while paused.
 */
export function judgePoint(prev: GpsPoint | null, raw: RawPoint, fresh = false): Verdict {
  const point = readPoint(raw);
  if (typeof point === 'string') return { ok: false, reason: point };
  if (!prev) return { ok: true, point, link: 'first' };
  if (point.t <= prev.t) return { ok: false, reason: 'time-backwards' };
  if (fresh) return { ok: true, point, link: 'first' };
  const sec = (point.t - prev.t) / 1000;
  // PLAN 4.4d: what the two fixes' own accuracy allows is not speed (with poor fixes it was most of it).
  const plausible = Math.max(0, haversineM(prev, point) - prev.accuracy - point.accuracy) / sec <= MAX_SPEED_MPS;
  if (sec > GAP_SEC) return { ok: true, point, link: 'gap', bridged: plausible && sec <= GAP_BRIDGE_MAX_SEC };
  if (!plausible) return { ok: false, reason: 'speed' };
  return { ok: true, point, link: 'step' };
}

export type Filtered = { good: GpsPoint[]; rejected: Array<{ index: number; reason: RejectReason }> };

/** The whole filter over a list: the good points in order, and every dropped one with its reason. */
export function filterPoints(raws: readonly RawPoint[]): Filtered {
  const out: Filtered = { good: [], rejected: [] };
  let prev: GpsPoint | null = null;
  raws.forEach((raw, index) => {
    const v = judgePoint(prev, raw);
    if (!v.ok) out.rejected.push({ index, reason: v.reason });
    else {
      out.good.push(v.point);
      prev = v.point;
    }
  });
  return out;
}
