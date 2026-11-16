// The run tracker (SPEC 12.2, 12.3): one state, fed one reported position at a time. Pure: the same
// inputs always give the same state, so a live run and a replay of it agree (see batch.ts).
//
// The rules, in one place:
// - Distance is haversine over the recorded points. Recorded = passed the filter (filter.ts), not
//   during a pause by hand, not while standing still.
// - Standing still (stillness.ts) freezes the distance whether auto pause is on or off, so GPS wander
//   on the spot never adds meters. Auto pause decides only whether the moving clock stops too.
// - Moving again: the leg from the standing spot to the new point counts (it was really covered).
// - A gap (no good point for more than GAP_SEC): its time is never moving time. The straight line
//   across counts as distance only when filter.ts calls it plausible; either way the line breaks.
// - A pause by hand always wins: nothing is recorded, auto pause does nothing, and the first point
//   after resume starts a new piece of line with no distance and no time across the pause.
// - Moving time only moves forward with good points, so it never has to be taken back.
import { judgePoint } from './filter';
import { haversineM } from './geo';
import { averagePace, currentPace, pushPace, type PaceSample } from './pace';
import { addSplitStep, readSplits, startSplits, type Split, type SplitState } from './splits';
import { isStill, leftStill, pushRecent, type Recent } from './stillness';
import type { GpsPoint, HeldReason, RawPoint, RejectReason, TrackBreak } from './types';

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
  /** Standing still (distance frozen; the clock too when autoPause is on). */
  still: boolean;
  /** The next good point is the first after a pause by hand. */
  afterPause: boolean;
  firstT: number | null;
  /** The last point that passed the filter while not paused by hand. */
  lastGood: GpsPoint | null;
  /** The last point on the track: where the next leg is measured from (the standing spot while still). */
  lastRecorded: GpsPoint | null;
  distanceM: number;
  /** Distance covered while time counted (everything but bridged gaps). */
  timedM: number;
  movingMs: number;
  recent: Recent;
  pace: readonly PaceSample[];
  splits: SplitState;
};

export type TrackerEvent =
  | { type: 'rejected'; reason: RejectReason }
  | { type: 'held'; reason: HeldReason }
  /** The point joined the track. `brk`: the line breaks before it. `splits`: splits it completed. */
  | { type: 'recorded'; point: GpsPoint; brk: TrackBreak | null; splits: Split[] };

export function startTracker(options: TrackerOptions): TrackerState {
  return {
    splitM: options.splitM,
    autoPause: options.autoPause ?? true,
    manual: false,
    still: false,
    afterPause: false,
    firstT: null,
    lastGood: null,
    lastRecorded: null,
    distanceM: 0,
    timedM: 0,
    movingMs: 0,
    recent: [],
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
const restart = (state: TrackerState, p: GpsPoint): TrackerState => ({ ...state, lastGood: p, lastRecorded: p, still: false, afterPause: false, recent: [p] });

/** Feed one reported position. Returns the new state and what happened to the point. */
export function addPoint(state: TrackerState, raw: RawPoint): { state: TrackerState; event: TrackerEvent } {
  const v = judgePoint(state.lastGood, raw, state.afterPause);
  if (!v.ok) return { state, event: { type: 'rejected', reason: v.reason } };
  if (state.manual) return { state, event: { type: 'held', reason: 'paused' } };
  const p = v.point;
  const from = state.lastRecorded;
  const prev = state.lastGood;

  if (!from || !prev) {
    const sample = { movingMs: 0, timedM: 0 };
    return { state: { ...restart(state, p), firstT: p.t, pace: [sample] }, event: { type: 'recorded', point: p, brk: null, splits: [] } };
  }
  if (v.link === 'first') {
    const brk: TrackBreak = { fromT: from.t, toT: p.t, kind: 'pause', bridged: false, distanceM: 0 };
    const sample = { movingMs: state.movingMs, timedM: state.timedM };
    return { state: { ...restart(state, p), pace: [sample] }, event: { type: 'recorded', point: p, brk, splits: [] } };
  }
  if (v.link === 'gap') {
    const distanceM = v.bridged ? haversineM(from, p) : 0;
    const next = advance(state, { distanceM, ms: 0, timed: false, gap: true });
    const brk: TrackBreak = { fromT: from.t, toT: p.t, kind: 'gap', bridged: v.bridged, distanceM };
    return { state: restart(next.state, p), event: { type: 'recorded', point: p, brk, splits: next.completed } };
  }

  const ms = p.t - prev.t;
  if (state.still && !leftStill(from, p)) {
    // Standing: no distance. The clock stops with auto pause on and keeps counting with it off.
    const held = state.autoPause ? state : advance(state, { distanceM: 0, ms, timed: true, gap: false }).state;
    return { state: { ...held, lastGood: p }, event: { type: 'held', reason: 'still' } };
  }
  const next = advance(state, { distanceM: haversineM(from, p), ms, timed: true, gap: false });
  const recent = state.still ? [p] : pushRecent(state.recent, p);
  return {
    state: { ...next.state, lastGood: p, lastRecorded: p, recent, still: isStill(recent) },
    event: { type: 'recorded', point: p, brk: null, splits: next.completed },
  };
}

/** Pause by hand. Until resumeRun nothing is recorded and auto pause does nothing. */
export const pauseRun = (state: TrackerState): TrackerState => (state.manual ? state : { ...state, manual: true });

/**
 * Resume by hand. After a pause by hand the next good point starts a new piece of line. Tapped
 * while auto paused it simply ends the standing state (the runner says they are moving).
 */
export function resumeRun(state: TrackerState): TrackerState {
  if (state.manual) return { ...state, manual: false, still: false, recent: [], afterPause: state.lastGood !== null };
  return state.still ? { ...state, still: false, recent: [] } : state;
}

export type RunStatus = 'waiting' | 'running' | 'auto-paused' | 'paused';

export type TrackerReading = {
  /** waiting: no good point yet. paused: by hand. auto-paused: standing, with auto pause on. */
  status: RunStatus;
  /** Standing still right now (also true with auto pause off, where the status stays running). */
  standing: boolean;
  distanceM: number;
  movingSec: number;
  /** From the first good point to the last one, pauses and gaps included. */
  elapsedSec: number;
  /** Seconds per meter, or null: no pace yet, or not moving. */
  currentPace: number | null;
  /** Seconds per meter, or null: not enough distance yet. */
  averagePace: number | null;
  splits: { full: readonly Split[]; partial: Split | null };
};

/** Everything the live screen and the finish screen show, read from the state. */
export function readTracker(state: TrackerState): TrackerReading {
  const status: RunStatus = state.manual ? 'paused' : !state.lastGood ? 'waiting' : state.still && state.autoPause ? 'auto-paused' : 'running';
  const movingSec = state.movingMs / 1000;
  return {
    status,
    standing: state.still,
    distanceM: state.distanceM,
    movingSec,
    elapsedSec: state.lastGood && state.firstT !== null ? (state.lastGood.t - state.firstT) / 1000 : 0,
    currentPace: state.manual || state.still ? null : currentPace(state.pace),
    averagePace: averagePace(movingSec, state.timedM),
    splits: readSplits(state.splits),
  };
}
