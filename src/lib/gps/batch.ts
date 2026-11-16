// A whole run at once (SPEC 12.3): the same tracker, folded over a list of inputs. Used to replay a
// run and by the tests; a live run that feeds the tracker one input at a time ends in the same state.
import { addPoint, pauseRun, readTracker, resumeRun, startTracker, type TrackerOptions, type TrackerReading, type TrackerState } from './tracker';
import type { Split } from './splits';
import type { GpsPoint, RawPoint, RejectReason, TrackBreak } from './types';

/** One thing that happened during a run, in order: a reported position, or a tap on pause or resume. */
export type TrackInput = { type: 'point'; point: RawPoint } | { type: 'pause' } | { type: 'resume' };

export type TrackResult = {
  state: TrackerState;
  reading: TrackerReading;
  /** The track: every recorded point, in order. */
  points: GpsPoint[];
  /** Where the drawn line breaks (gaps and pauses by hand), with what each gap added to the distance. */
  breaks: TrackBreak[];
  /** Dropped inputs (index into the input list) with the reason. */
  rejected: Array<{ index: number; reason: RejectReason }>;
  /** Good points left off the track: paused by hand, or standing still. */
  heldCount: number;
  /** Distance not counted because a gap could not be bridged honestly is unknown, never guessed. */
  unbridgedGaps: number;
  /** Each completed split with the index of the input that completed it. */
  splitEvents: Array<{ index: number; split: Split }>;
};

/** Feed one input to a tracker state. */
export function stepTracker(state: TrackerState, input: TrackInput): ReturnType<typeof addPoint> | { state: TrackerState; event: null } {
  if (input.type === 'point') return addPoint(state, input.point);
  return { state: input.type === 'pause' ? pauseRun(state) : resumeRun(state), event: null };
}

/** Process a whole list of inputs. */
export function processTrack(inputs: readonly TrackInput[], options: TrackerOptions): TrackResult {
  let state = startTracker(options);
  const out = { points: [] as GpsPoint[], breaks: [] as TrackBreak[], rejected: [] as TrackResult['rejected'], heldCount: 0, splitEvents: [] as TrackResult['splitEvents'] };
  inputs.forEach((input, index) => {
    const step = stepTracker(state, input);
    state = step.state;
    const e = step.event;
    if (!e) return;
    if (e.type === 'rejected') out.rejected.push({ index, reason: e.reason });
    else if (e.type === 'held') out.heldCount++;
    else {
      out.points.push(e.point);
      if (e.brk) out.breaks.push(e.brk);
      for (const split of e.splits) out.splitEvents.push({ index, split });
    }
  });
  return { state, reading: readTracker(state), ...out, unbridgedGaps: out.breaks.filter((b) => b.kind === 'gap' && !b.bridged).length };
}

/** Process reported positions only (no taps on pause). */
export const processPoints = (points: readonly RawPoint[], options: TrackerOptions): TrackResult =>
  processTrack(points.map((point) => ({ type: 'point' as const, point })), options);
