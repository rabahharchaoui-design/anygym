// The run tracker (SPEC 12.2, 12.3): one state, fed one reported position at a time. Pure: the same
// inputs always give the same state, so a live run and a replay of it agree (see batch.ts).
//
// The rules, in one place:
// - Distance is haversine over the recorded points. Recorded = passed the filter (filter.ts), not
//   during a pause by hand, not while standing still.
// - Standing still (stillness.ts isStill, a circle that grows at poor accuracy) freezes the distance
//   whether auto pause is on or off, so GPS wander on the spot never adds meters. The moving clock
//   stops only on the 4 m rule (clockStill, PLAN 4.6a 3) with auto pause on: a walk at poor accuracy
//   can look like wander for a while, and keeps its time; its distance counts once it leaves the spot,
//   or, when the run stops there first (pause, end, a gap), right then (flushStill, PLAN 4.6b).
// - Moving again: the leg from the standing spot to the new point counts (it was really covered).
//   With auto pause on nobody knows how long that leg took (the clock was stopped), so it adds
//   distance but no time and stays out of every pace, the same way a bridged gap does.
// - A gap (no good point for more than GAP_SEC): only its first GAP_SEC count as moving time (the
//   clock on the screen had already counted them while it waited, PLAN 4.4a, and a clock never goes
//   back); nothing after them. The straight line across counts as distance only when filter.ts
//   calls it plausible; either way the line breaks. A hole while auto paused that ends on the
//   standing spot is no gap at all: the runner stood there throughout, so the run stays still.
// - A pause by hand always wins: nothing is recorded, auto pause does nothing, and the first point
//   after resume starts a new piece of line with no distance and no time across the pause.
// - Moving time only moves forward with good points, so it never has to be taken back.
import { JUMP_RESET, estimatePoint, estimateSpeed, reopenSpeed, startEstimate, stepEstimate, type Estimate } from './estimate';
import { judgePoint } from './filter';
import { calmNow, fixesWalking, pushRaw, settleWith, speedKnown, standsAt, stillBySpeed } from './standing';
import { haversineM } from './geo';
import { pushPace, pushSpeed, type PaceSample } from './pace';
import { addSplitStep, startSplits, type Split, type SplitState } from './splits';
import { clockStill, leftStill, minStepM, movedLately, pushRecent, walkingLately, type Recent } from './stillness';
import { AUTO_PAUSE_SEC, GAP_SEC, MAX_ACCURACY_M, SETTLE_FIXES, SPEED_MOVING_MPS, STILL_SPEED_MPS, STILL_TRUST_M, START_MAX_MPS, type GpsPoint, type HeldReason, type RawPoint, type RejectReason, type TrackBreak } from './types';

export type TrackerOptions = {
  /** Split length in meters (units.ts unitMeters). */
  splitM: number;
  /** SPEC 12.3: optional, on by default. Off: the moving clock keeps counting while standing. */
  autoPause?: boolean;
};

export type TrackerState = {
  splitM: number;
  autoPause: boolean;
  /** Paused by hand. */
  manual: boolean;
  /** Standing still (distance frozen). */
  still: boolean;
  /**
   * Standing by the 4 m rule too (stillness.ts clockStill): with autoPause on the moving clock stops.
   * Only ever true while `still` (PLAN 4.6a 3).
   */
  stopped: boolean;
  /**
   * Where the clock stopped, when that came after the distance froze (a walk at poor accuracy that
   * looked like wander first): the way from the standing spot to here was walked while the clock
   * counted, so leaving the spot times that part. Absent (older snapshots) or null: none.
   */
  stopAt?: GpsPoint | null;
  /** The next good point is the first after a pause by hand. */
  afterPause: boolean;
  firstT: number | null;
  /** The last point that passed the filter while not paused by hand. */
  lastGood: GpsPoint | null;
  /** The last point on the track: where the next leg is measured from (the standing spot while still). */
  lastRecorded: GpsPoint | null;
  distanceM: number;
  /** Distance covered while time counted (everything but bridged gaps and the leg that ends an auto pause). */
  timedM: number;
  movingMs: number;
  /** Moving time counted with no distance of its own (the first GAP_SEC of a gap): pace leaves it out. */
  heldMs: number;
  recent: Recent;
  /**
   * PLAN 4.4d: the phone's own speed has said "standing" (under STILL_SPEED_MPS) on every reading
   * since `since`; `last` is the newest reading. Null: it said moving, or never spoke.
   */
  calm?: { since: number; last: number } | null;
  /** PLAN 4.4d: the fixes of the last few seconds as the phone gave them (fixesWalking). */
  raws?: readonly GpsPoint[];
  /** PLAN 4.4d: the first fixes of a run that is not sure yet (SETTLE_FIXES); null once settled. */
  settle?: GpsPoint[] | null;
  /** The phone's own speeds of the last SPEED_PACE_SEC (PLAN 4.4d), [time, m/s]. Absent in older snapshots. */
  speeds?: ReadonlyArray<readonly [number, number]>;
  /** Every recorded or held point of the last AUTO_PAUSE_SEC, standing or not (movedLately). Absent in older snapshots. */
  trail?: Recent;
  /**
   * Where the runner most likely is (estimate.ts, PLAN 4.4d): the track is made of its points, so
   * distance is never the jitter of the raw fixes. Absent (older snapshots) or null: none yet, the
   * next fix starts one.
   */
  est?: Estimate | null;
  pace: readonly PaceSample[];
  splits: SplitState;
};

export type TrackerEvent =
  | { type: 'rejected'; reason: RejectReason }
  | { type: 'held'; reason: HeldReason }
  /**
   * The point joined the track. `brk`: the line breaks before it. `splits`: splits it completed.
   * `withheld`: a point that joined the track just before it (the end of the withheld leg, flushStill).
   */
  | { type: 'recorded'; point: GpsPoint; brk: TrackBreak | null; splits: Split[]; withheld?: GpsPoint };

export function startTracker(options: TrackerOptions): TrackerState {
  return {
    splitM: options.splitM,
    autoPause: options.autoPause ?? true,
    manual: false,
    still: false,
    stopped: false,
    afterPause: false,
    firstT: null,
    lastGood: null,
    lastRecorded: null,
    distanceM: 0,
    timedM: 0,
    movingMs: 0,
    heldMs: 0,
    recent: [],
    est: null,
    pace: [],
    splits: startSplits(options.splitM),
  };
}

type Move = { distanceM: number; ms: number; timed: boolean; gap: boolean };

/** Add distance and time to the totals, the splits and the pace window. */
function advance(state: TrackerState, move: Move): { state: TrackerState; completed: Split[] } {
  const { state: splits, completed } = addSplitStep(state.splits, move);
  const sample = { movingMs: state.movingMs + move.ms, timedM: state.timedM + (move.timed ? move.distanceM : 0) };
  return {
    state: { ...state, distanceM: state.distanceM + move.distanceM, ...sample, splits, pace: move.timed ? pushPace(state.pace, sample) : [sample] },
    completed,
  };
}

/** Put a point on the track as the start of a new continuous stretch. */
const restart = (state: TrackerState, p: GpsPoint): TrackerState => ({ ...state, lastGood: p, lastRecorded: p, still: false, stopped: false, stopAt: null, afterPause: false, recent: [p], trail: [p] });

/** Auto paused: standing by the clock's rule with auto pause on. The moving clock stands. */
export const clockStopped = (state: TrackerState): boolean => state.autoPause && state.still && state.stopped;

/** Feed one reported position. Returns the new state and what happened to the point. */
export function addPoint(state: TrackerState, raw: RawPoint): { state: TrackerState; event: TrackerEvent } {
  const out = addFix(state, raw);
  const e = out.event;
  if (e.type === 'rejected' || (e.type === 'held' && e.reason === 'paused')) return out;
  // The fixes as the phone gave them, last few seconds (fixesWalking).
  const fix = { lat: raw.lat!, lng: raw.lng!, t: raw.t!, accuracy: raw.accuracy! };
  const raws = e.type === 'recorded' && e.brk !== null ? [fix] : pushRaw(out.state.raws ?? [], fix);
  // The phone's own speeds of the last seconds (PLAN 4.4d): current pace and moving again read them.
  const p = out.state.lastGood!;
  const calm = p.speed === undefined ? (out.state.calm ?? null) : p.speed < STILL_SPEED_MPS ? { since: out.state.calm?.since ?? p.t, last: p.t } : null;
  return { ...out, state: { ...out.state, raws, calm, speeds: p.speed === undefined ? [] : pushSpeed(out.state.speeds ?? [], p, e.type === 'recorded' && e.brk !== null) } };
}

function addFix(state: TrackerState, raw: RawPoint): { state: TrackerState; event: TrackerEvent } {
  const v = judgePoint(state.lastGood, raw, state.afterPause);
  if (!v.ok) return { state, event: { type: 'rejected', reason: v.reason } };
  if (state.manual) return { state, event: { type: 'held', reason: 'paused' } };
  const from = state.lastRecorded;
  const prev = state.lastGood;
  // Standing, a fix that would mean starting off faster than START_MAX_MPS is not believed until
  // JUMP_RESET such fixes in a row say so (PLAN 4.4d): with fixes 5 s apart one wild fix otherwise
  // pulled the estimate off the spot and counted tens of meters for a phone lying still.
  if (state.still && state.stopped && state.est && prev && v.link === 'step' && haversineM(prev, v.point) / ((v.point.t - prev.t) / 1000) > START_MAX_MPS && state.est.jumps + 1 < JUMP_RESET) {
    return { state: { ...state, est: { ...state.est, jumps: state.est.jumps + 1 } }, event: { type: 'rejected', reason: 'jump' } };
  }
  // The fix moves the estimate (PLAN 4.4d); a new stretch (the first fix, after a pause or a gap) starts one.
  const stepped = state.est && from && prev && v.link === 'step' ? stepEstimate(state.est, v.point, state.still && state.stopped, state.still) : { kind: 'ok' as const, est: startEstimate(v.point) };
  // A surprising fix waiting for the next one is held, not dropped: the dot may show it (PLAN 4.4d).
  if (stepped.kind === 'jump') return { state: { ...state, est: stepped.est }, event: stepped.est.pending === v.point ? { type: 'held', reason: 'checking' } : { type: 'rejected', reason: 'jump' } };
  let est = stepped.est;
  const p = estimatePoint(est, v.point.speed);

  if (!from || !prev) {
    // The start of the run (PLAN 4.4d): a first fix sure enough alone (MAX_ACCURACY_M) starts the
    // track; a poorer one waits until SETTLE_FIXES fixes in a row agree within their accuracies,
    // so one wild fix of a cold start never becomes the start of the line. Meanwhile the clock
    // counts (kept out of every pace) and the distance stays 0.
    const chain = settleWith(state.settle ?? [], v.point);
    const ms = prev ? v.point.t - prev.t : 0;
    const timed = ms > 0 ? { ...advance(state, { distanceM: 0, ms, timed: false, gap: false }).state, heldMs: (state.heldMs ?? 0) + ms } : state;
    const firstT = state.firstT ?? v.point.t;
    if (v.point.accuracy > MAX_ACCURACY_M && chain.length < SETTLE_FIXES) return { state: { ...timed, lastGood: v.point, firstT, settle: chain }, event: { type: 'held', reason: 'settling' } };
    let start = startEstimate(chain[0]!);
    for (const q of chain.slice(1)) {
      const s = stepEstimate(start, q);
      start = s.kind === 'ok' ? s.est : startEstimate(q);
    }
    const p0 = estimatePoint(start, v.point.speed);
    const sample = { movingMs: timed.movingMs, timedM: timed.timedM };
    if (chain.length < 2) return { state: { ...restart(timed, p0), est: start, firstT, settle: null, pace: [sample] }, event: { type: 'recorded', point: p0, brk: null, splits: [] } };
    // The line starts at the first of the agreeing fixes and the way since then counts (PLAN 4.4d).
    const first = chain[0]!;
    const credited = advance({ ...timed, pace: [sample] }, { distanceM: haversineM(first, p0), ms: 0, timed: true, gap: false });
    return { state: { ...restart(credited.state, p0), est: start, firstT, settle: null }, event: { type: 'recorded', point: p0, brk: null, splits: credited.completed, withheld: first } };
  }
  if (v.link === 'first') {
    const brk: TrackBreak = { fromT: from.t, toT: p.t, kind: 'pause', bridged: false, distanceM: 0 };
    const sample = { movingMs: state.movingMs, timedM: state.timedM };
    return { state: { ...restart(state, p), est, pace: [sample] }, event: { type: 'recorded', point: p, brk, splits: [] } };
  }
  if (stepped.kind === 'reanchor') {
    // The estimate was off and starts again at the fix: the line breaks there and the correction is
    // no distance. What the estimated speed covered in the time since the last fix counts (at most
    // the straight line across), as timed distance, so the numbers go on moving (PLAN 4.4d).
    const flushed = flushStill(state);
    const start = flushed.state.lastRecorded!;
    const ms = clockStopped(state) ? 0 : p.t - prev.t;
    const distanceM = state.still ? 0 : Math.min(haversineM(start, p), (estimateSpeed(est) * ms) / 1000);
    const next = advance(flushed.state, { distanceM, ms, timed: true, gap: false });
    const brk: TrackBreak = { fromT: start.t, toT: p.t, kind: 'gap', bridged: distanceM > 0, distanceM };
    return { state: { ...restart(next.state, p), est }, event: { type: 'recorded', point: p, brk, splits: [...flushed.completed, ...next.completed], ...(flushed.point ? { withheld: flushed.point } : {}) } };
  }
  if (v.link === 'gap') {
    const onSpot = state.still && !leftStill(from, p);
    // Auto paused and back on the same spot: the runner never left, so nothing moved and the run stays still.
    if (onSpot && clockStopped(state)) return { state: { ...state, lastGood: p, est, trail: [p] }, event: { type: 'held', reason: 'still' } };
    // The way walked on the clock before the gap counts first; the gap starts where it ends.
    const flushed = flushStill(state);
    const start = flushed.state.lastRecorded!;
    // Back on the standing spot: whatever lies across is wander, not distance, so it is not bridged.
    const bridged = v.bridged && !onSpot;
    const distanceM = bridged ? haversineM(start, p) : 0;
    // The wait up to GAP_SEC was counted on the screen (pendingMs): it stays counted (holdGap).
    const credit = clockStopped(state) ? 0 : GAP_SEC * 1000;
    const next = advance(holdGap(flushed.state, credit), { distanceM, ms: 0, timed: false, gap: true });
    const brk: TrackBreak = { fromT: start.t, toT: p.t, kind: 'gap', bridged, distanceM };
    const splits = [...flushed.completed, ...next.completed];
    return { state: { ...restart(next.state, p), est }, event: { type: 'recorded', point: p, brk, splits, ...(flushed.point ? { withheld: flushed.point } : {}) } };
  }

  const ms = p.t - prev.t;
  const trail = pushRecent(state.trail ?? [], p);
  // Moving again: off the standing spot, and moving now, not drifting there (PLAN 4.4d).
  // Moving again (PLAN 4.4d): the phone's own speed says so when it gives one (it does not wander
  // with the position). Without one (no GPS lock: the phone is unsure anyway) the old rule: off the
  // spot by more than both accuracy circles, and moving now, not drifting there.
  // A recent reading of the phone's speed that said standing holds too: positions alone never end it.
  const goingAgain = p.speed !== undefined ? p.speed >= SPEED_MOVING_MPS : !calmNow(state, p) && leftStill(from, p) && movedLately(state.trail ?? [], p) && walkingLately(state.trail ?? [], p);
  if (state.still && !goingAgain) {
    // Standing: no distance. Auto paused, the clock stands. Otherwise it counts, and the window goes
    // on so the 4 m rule can still stop it (a walk at poor accuracy that then stops at a light).
    if (clockStopped(state)) return { state: { ...state, lastGood: p, est, trail }, event: { type: 'held', reason: 'still' } };
    const recent = state.stopped ? state.recent : pushRecent(state.recent, p);
    const held = advance(state, { distanceM: 0, ms, timed: true, gap: false }).state;
    const stops = !state.stopped && clockStill(recent);
    return { state: { ...held, lastGood: p, est, trail, recent, stopped: state.stopped || stops, stopAt: stops ? p : (state.stopAt ?? null) }, event: { type: 'held', reason: 'still' } };
  }
  const legM = haversineM(from, p);
  // Without the phone's speed and too unsure to call standing, way counts only while the estimate
  // moves like a walk over the last seconds (PLAN 4.4d): a still phone's slow drift never does.
  const known = speedKnown(state, p);
  const drifting = !known && p.accuracy > STILL_TRUST_M && !walkingLately(trail, p) && !fixesWalking([...(state.raws ?? []), v.point]);
  if (!state.still && drifting && legM >= minStepM(p, known) && p.t - from.t >= AUTO_PAUSE_SEC * 1000) {
    // Drifted off the last point without moving like a walk: the spot moves with the drift, the
    // distance does not (PLAN 4.4d). The line breaks there (no distance across, like an unbridged gap).
    const held = advance(state, { distanceM: 0, ms, timed: true, gap: false }).state;
    const brk: TrackBreak = { fromT: from.t, toT: p.t, kind: 'gap', bridged: false, distanceM: 0 };
    return { state: { ...held, lastGood: p, lastRecorded: p, est, trail, recent: pushRecent(state.recent, p) }, event: { type: 'recorded', point: p, brk, splits: [] } };
  }
  if (!state.still && (legM < minStepM(p, known) || drifting)) {
    // A step shorter than the estimate's own wobble (PLAN 4.4d): it waits for the next, so the
    // wobble from side to side never adds meters. Its time counts now, its way with the next step.
    const recent = pushRecent(state.recent, p);
    const held = advance(state, { distanceM: 0, ms, timed: true, gap: false }).state;
    return { state: { ...held, lastGood: p, est, trail, recent, still: standsAt(recent, p) || stillBySpeed(state, p), stopped: standsAt(recent, p, clockStill), stopAt: null }, event: { type: 'held', reason: 'short' } };
  }
  // Off again after standing: the speed is unknown again, so the estimate takes it from the fixes quickly.
  if (state.still) est = reopenSpeed(est);
  let next: { state: TrackerState; completed: Split[] };
  if (clockStopped(state)) {
    // Leaving the spot after the clock stood: the part walked before it stood was timed (its
    // seconds were counted); the rest took an unknown time, so it adds distance only.
    const timedM = state.stopAt ? Math.min(legM, haversineM(from, state.stopAt)) : 0;
    const first = advance(state, { distanceM: timedM, ms: 0, timed: true, gap: false });
    const rest = advance(first.state, { distanceM: legM - timedM, ms: 0, timed: false, gap: false });
    next = { state: rest.state, completed: [...first.completed, ...rest.completed] };
  } else next = advance(state, { distanceM: legM, ms, timed: true, gap: false });
  const recent = state.still ? [p] : pushRecent(state.recent, p);
  const stopped = standsAt(recent, p, clockStill);
  return {
    state: { ...next.state, lastGood: p, lastRecorded: p, est, trail, recent, still: standsAt(recent, p) || stillBySpeed(state, p), stopped, stopAt: null },
    event: { type: 'recorded', point: p, brk: null, splits: next.completed },
  };
}

/**
 * Moving time with no distance of its own (the first GAP_SEC of a gap): counted, kept out of every
 * pace, and its split is flagged as holding a gap (no split time is shown for it).
 */
function holdGap(state: TrackerState, ms: number): TrackerState {
  if (ms <= 0) return state;
  const held = advance(state, { distanceM: 0, ms, timed: false, gap: true }).state;
  return { ...held, heldMs: (state.heldMs ?? 0) + ms };
}

/**
 * The moving time since the last good point that the next good point would add, as far as `now`
 * can tell (PLAN 4.4a: the clock on the screen counts between two positions). Zero whenever the
 * next point would add none: paused by hand, standing with auto pause on, before the first point,
 * right after a resume by hand (the first point after it starts a new piece with no time). It stops
 * growing at GAP_SEC: past that the wait is a gap, and only its first GAP_SEC count (addPoint).
 */
export function pendingMs(state: TrackerState, now: number): number {
  if (state.manual || state.afterPause || !state.lastGood || clockStopped(state)) return 0;
  const since = now - state.lastGood.t;
  return since > 0 ? Math.min(since, GAP_SEC * 1000) : 0;
}

/**
 * Moving time the clock on the screen had already shown that the engine would take back (PLAN
 * 4.4c): a position reaches the app up to 2 s after its stamp, and when that position starts an
 * auto pause the engine counts only up to the stamp. The runner was counted as moving until the app
 * learned of the stop (as for the 8 s it takes to see one), so those seconds count, as standing
 * time: no distance. The live run gives them (live.ts, fix `now`); a replay has no arrival times.
 */
export function countShown(state: TrackerState, ms: number): TrackerState {
  return ms > 0 ? advance(state, { distanceM: 0, ms, timed: true, gap: false }).state : state;
}

/**
 * The withheld leg (PLAN 4.6b): standing by the wide circle (poor accuracy) while the 4 m rule says
 * moving, the clock counts but the way from the standing spot to the last good point waits until
 * the runner leaves the spot. When the run stops there first (a pause, the end, a gap) it counts
 * now, as timed distance (its seconds are already counted), and its end joins the track. Once the
 * 4 m rule stopped the clock too, only the way up to where it stopped (stopAt) was walked on the
 * clock: that part counts, as when leaving the spot (addPoint); the rest is wander. A phone that
 * stood from the start (no stopAt) adds nothing. A second call finds no leg.
 */
export function flushStill(state: TrackerState): { state: TrackerState; point: GpsPoint | null; completed: Split[] } {
  const from = state.lastRecorded;
  const last = state.lastGood;
  const none = { state, point: null, completed: [] };
  if (!from || !last) return none;
  // Moving, the last steps may be waiting (shorter than the estimate's wobble, PLAN 4.4d): the run
  // stops here, so they count now (their time already did).
  if (!state.still) {
    if (last.t <= from.t) return none;
    const moved = advance(state, { distanceM: haversineM(from, last), ms: 0, timed: true, gap: false });
    return { state: { ...moved.state, lastRecorded: last }, point: last, completed: moved.completed };
  }
  // The phone's own speed says standing (PLAN 4.4d): the way off the spot is wander, not a walk.
  const lastSpeed = state.speeds?.[state.speeds.length - 1];
  if ((lastSpeed && lastSpeed[0] === last.t && lastSpeed[1] < STILL_SPEED_MPS) || calmNow(state, last)) return none;
  // Stopped: the shorter of the way to the last point and the way to where the clock stopped, with
  // the point it ends on, so the line and the distance agree.
  const stopAt = state.stopped ? (state.stopAt ?? null) : null;
  if (state.stopped && !stopAt) return none;
  const to = stopAt && haversineM(from, stopAt) <= haversineM(from, last) ? stopAt : last;
  if (to.t <= from.t) return none;
  const next = advance(state, { distanceM: haversineM(from, to), ms: 0, timed: true, gap: false });
  return { state: { ...next.state, lastRecorded: to }, point: to, completed: next.completed };
}

/**
 * Pause by hand (also how a run ends). Until resumeRun nothing is recorded and auto pause does
 * nothing. The withheld leg counts first (flushStill): `point`, when there is one, joins the track.
 * With `now` (the live run gives it) the moving time since the last good point is counted too
 * (pendingMs): the runner was moving until the tap, and the clock on the screen had already shown
 * that time. That adds time only, never distance.
 */
export function pauseTrack(state: TrackerState, now?: number): { state: TrackerState; point: GpsPoint | null; completed: Split[] } {
  if (state.manual) return { state, point: null, completed: [] };
  const flushed = flushStill(state);
  const s = flushed.state;
  const ms = now === undefined ? 0 : pendingMs(s, now);
  // Paused (or ended) inside a gap: its first GAP_SEC count the way the next point would count them.
  const gap = ms > 0 && now! - s.lastGood!.t > GAP_SEC * 1000;
  const counted = ms <= 0 ? { state: s, completed: [] } : gap ? { state: holdGap(s, ms), completed: [] } : advance(s, { distanceM: 0, ms, timed: true, gap: false });
  return { state: { ...counted.state, manual: true }, point: flushed.point, completed: [...flushed.completed, ...counted.completed] };
}

/** pauseTrack, the state alone: for a caller that keeps no track of its own. */
export const pauseRun = (state: TrackerState, now?: number): TrackerState => pauseTrack(state, now).state;

/**
 * Resume by hand. After a pause by hand the next good point starts a new piece of line. Tapped
 * while auto paused it simply ends the standing state (the runner says they are moving).
 */
export function resumeRun(state: TrackerState): TrackerState {
  if (state.manual) return { ...state, manual: false, still: false, stopped: false, stopAt: null, recent: [], afterPause: state.lastGood !== null };
  return state.still ? { ...state, still: false, stopped: false, stopAt: null, recent: [] } : state;
}

export { readTracker } from './reading';
export type { RunStatus, TrackerReading } from './reading';
