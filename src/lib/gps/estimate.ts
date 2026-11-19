// Where the runner most likely is (PLAN 4.4d (3)): every trusted fix moves an estimate, weighted by
// how sure the phone says it is. Pure. A Kalman filter per axis (east, north) with a constant
// speed model: a fix at 5 m pulls the estimate most of the way, a fix at 50 m only a little, so a
// stretch of poor fixes still moves the distance on every fix without its jitter adding meters.
//
// Two guards so one bad fix never adds distance:
// - A fix far outside what the estimate and the fix's own accuracy allow (JUMP_GATE) is a jump: it
//   is dropped. If the next ones agree with it (JUMP_RESET in a row), the estimate was wrong: it
//   starts again there (reanchor), with no distance across.
// - When a much surer fix arrives (the GPS lock after a cold start), the estimate is corrected to it
//   without counting the correction as distance (reanchor): it was where the phone was, not a run.
import { EARTH_RADIUS_M } from './geo';
import { MAX_SPEED_MPS, type GpsPoint } from './types';

/** One axis: position (m), speed (m/s) and their uncertainty [pp, pv, vv]. */
type Axis = { x: number; v: number; p: [number, number, number] };

export type Estimate = {
  /** Where the local meters count from (the first fix of the stretch). */
  lat0: number;
  lng0: number;
  t: number;
  e: Axis;
  n: Axis;
  /** Fixes dropped as jumps in a row. */
  jumps: number;
  /** A surprising fix waiting for the next one to say whether it was real (CONFIRM_WITHIN_MS). */
  pending?: GpsPoint | null;
};

/** The phone's accuracy is about 1.5 standard deviations of its real error (68% of fixes inside). */
const ACCURACY_SIGMAS = 1.5;
/** How far a runner's speed may change per second, as a spread (m/s per s): walking to sprinting. */
const ACCEL_SIGMA = 1;
/** The speed is unknown at the start of a stretch: anything up to a fast run. */
const START_SPEED_SIGMA = 4;
/**
 * A fix this far off what the estimate expects is a jump: 3.5 standard deviations (squared, over
 * both axes). A real turn or stop, even at 5 s between fixes, stays inside it: the wait widens it.
 */
const JUMP_GATE_SQ = 12.25;
/**
 * A fix this surprising (2.5 standard deviations, squared) that comes within CONFIRM_WITHIN_MS of
 * the last one waits for the next fix: a lone outlier is then never counted, a real turn or stop is
 * counted one fix late. With fixes 5 s apart there is no waiting (it would freeze the number).
 */
const SURPRISE_SQ = 6.25;
const CONFIRM_WITHIN_MS = 2500;
/** Past this surprise (2 standard deviations, squared) a fix is weighted down. */
const ROBUST_FROM_SQ = 4;
/** After this many jumps in a row the estimate, not the fixes, is wrong: start again from them. */
export const JUMP_RESET = 3;
/** A fix this many times surer than the estimate, and off it by more than its own spread x CORRECT_SIGMAS, corrects it. */
const CORRECT_RATIO = 2;
const CORRECT_SIGMAS = 3;

const DEG = 180 / Math.PI;
const sigmaOf = (accuracy: number) => Math.max(accuracy, 1) / ACCURACY_SIGMAS;

function toLocal(est: Pick<Estimate, 'lat0' | 'lng0'>, p: { lat: number; lng: number }) {
  return { east: ((p.lng - est.lng0) / DEG) * EARTH_RADIUS_M * Math.cos(est.lat0 / DEG), north: ((p.lat - est.lat0) / DEG) * EARTH_RADIUS_M };
}

function toLatLng(est: Estimate): { lat: number; lng: number } {
  return { lat: est.lat0 + (est.n.x / EARTH_RADIUS_M) * DEG, lng: est.lng0 + (est.e.x / (EARTH_RADIUS_M * Math.cos(est.lat0 / DEG))) * DEG };
}

/** A new stretch: the estimate is the fix itself, the speed unknown. */
export function startEstimate(p: GpsPoint): Estimate {
  const r = sigmaOf(p.accuracy) ** 2;
  const axis = (): Axis => ({ x: 0, v: 0, p: [r, 0, START_SPEED_SIGMA ** 2] });
  return { lat0: p.lat, lng0: p.lng, t: p.t, e: axis(), n: axis(), jumps: 0 };
}

function predict(a: Axis, dt: number): Axis {
  const q = ACCEL_SIGMA ** 2;
  const [pp, pv, vv] = a.p;
  return { x: a.x + a.v * dt, v: a.v, p: [pp + dt * (2 * pv + dt * vv) + (q * dt ** 4) / 4, pv + dt * vv + (q * dt ** 3) / 2, vv + q * dt ** 2] };
}

function update(a: Axis, z: number, r: number): Axis {
  const [pp, pv, vv] = a.p;
  const s = pp + r;
  const k0 = pp / s;
  const k1 = pv / s;
  const y = z - a.x;
  return { x: a.x + k0 * y, v: a.v + k1 * y, p: [(1 - k0) * pp, (1 - k0) * pv, vv - k1 * pv] };
}

/** Keeps the speed estimate under MAX_SPEED_MPS (one burst of noise is never a sprint). */
function capSpeed(e: Axis, n: Axis): [Axis, Axis] {
  const speed = Math.hypot(e.v, n.v);
  if (speed <= MAX_SPEED_MPS) return [e, n];
  const k = MAX_SPEED_MPS / speed;
  return [{ ...e, v: e.v * k }, { ...n, v: n.v * k }];
}

/** The estimate as a point: its position, the fix's time, and its own accuracy (same scale as a phone's). */
export function estimatePoint(est: Estimate): GpsPoint {
  const { lat, lng } = toLatLng(est);
  return { lat, lng, t: est.t, accuracy: ACCURACY_SIGMAS * Math.sqrt((est.e.p[0] + est.n.p[0]) / 2) };
}

/** The estimated speed in m/s. */
export const estimateSpeed = (est: Estimate): number => Math.hypot(est.e.v, est.n.v);

type Judged = { d2: number; ye: number; yn: number; e: Axis; n: Axis; r: number; z: { east: number; north: number } };

/** How the fix compares with where the estimate expects the runner at its time. */
function judge(est: Estimate, p: GpsPoint): Judged {
  const dt = Math.max(0, (p.t - est.t) / 1000);
  const e = predict(est.e, dt);
  const n = predict(est.n, dt);
  const r = sigmaOf(p.accuracy) ** 2;
  const z = toLocal(est, p);
  const ye = z.east - e.x;
  const yn = z.north - n.x;
  return { d2: (ye * ye) / (e.p[0] + r) + (yn * yn) / (n.p[0] + r), ye, yn, e, n, r, z };
}

/** The estimate moved by a fix (weighted down the more it surprises: a robust weight). */
function apply(est: Estimate, p: GpsPoint, j: Judged): Estimate {
  const rw = j.d2 > ROBUST_FROM_SQ ? (j.r * j.d2) / ROBUST_FROM_SQ : j.r;
  const [e, n] = capSpeed(update(j.e, j.z.east, rw), update(j.n, j.z.north, rw));
  return { ...est, t: p.t, e, n, jumps: 0, pending: null };
}

/**
 * Feed one trusted fix. `ok`: the estimate moved. `jump`: the fix was dropped (or is held until the
 * next one says whether it was real). `reanchor`: the estimate starts again at the fix (a
 * correction, or the jumps were right): no distance across.
 */
export function stepEstimate(est: Estimate, p: GpsPoint): { kind: 'ok' | 'jump' | 'reanchor'; est: Estimate } {
  const j = judge(est, p);
  // A held surprise (CONFIRM): if this fix is where the estimate expects, the held one was noise
  // and is forgotten; if not, the held one was the first step of a real change and counts first.
  const held = est.pending ?? null;
  if (held && j.d2 > SURPRISE_SQ) {
    const first = apply(est, held, judge(est, held));
    return stepEstimate(first, p);
  }
  // How sure the estimate was before this fix (not after the wait: a long wait is no correction).
  const prior = Math.sqrt((est.e.p[0] + est.n.p[0]) / 2);
  const off = Math.hypot(j.ye, j.yn);
  // A much surer fix that shows the estimate was off: the estimate jumps to it, the distance does not.
  const corrects = prior > CORRECT_RATIO * Math.sqrt(j.r) && off > CORRECT_SIGMAS * Math.sqrt(j.r);
  if (corrects || (j.d2 > JUMP_GATE_SQ && est.jumps + 1 >= JUMP_RESET)) {
    const fresh = startEstimate(p);
    // The speed it had is still the best guess of the speed.
    return { kind: 'reanchor', est: { ...fresh, e: { ...fresh.e, v: j.e.v }, n: { ...fresh.n, v: j.n.v } } };
  }
  if (j.d2 > JUMP_GATE_SQ) return { kind: 'jump', est: { ...est, jumps: est.jumps + 1, pending: null } };
  // With fixes every second or so, a surprising one waits for the next to confirm it.
  if (!held && j.d2 > SURPRISE_SQ && p.t - est.t <= CONFIRM_WITHIN_MS) return { kind: 'jump', est: { ...est, pending: p } };
  return { kind: 'ok', est: apply(est, p, j) };
}
