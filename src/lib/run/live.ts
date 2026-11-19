// The live run (SPEC 12.2, PLAN 4.3): one state, moved forward by what happens (a reported position,
// a tap on Pause or Resume, the auto pause switch). Pure: lib/gps does every number; this file only
// keeps the track, its breaks and what the run was started as. No clock: time comes in with the points.
import type { DistanceUnit } from '../intake/answers';
import { addPoint, countShown, pauseTrack, pendingMs, readTracker, resumeRun, startTracker, unitMeters, type GpsPoint, type RawPoint, type TrackBreak, type TrackerReading, type TrackerState } from '../gps';
import { distanceLabel, goalMeters, goalSeconds, timeLabel, type RunSetup, type RunType } from './goal';
import { planFor, startIntervals, tickIntervals, type IntervalChoice, type IntervalState } from './intervals';

/** What a Distance or Time run aims at, in meters or seconds, with the words it was picked as ("5 km"). */
export type RunGoal = { kind: 'distance'; meters: number; label: string } | { kind: 'time'; seconds: number; label: string };

export type GpsTrouble = 'denied' | 'unavailable' | null;

export type LiveRun = {
  id: string;
  startedAt: number;
  type: RunType;
  goal: RunGoal | null;
  /** Intervals: the chosen preset (or 'custom'), stored with the run. */
  intervalPreset: IntervalChoice | null;
  /** Intervals: the blocks and their clock (lib/run/intervals). Null on every other run. */
  intervals: IntervalState | null;
  /** Miles or km, fixed at the start: splits and every printed number use it. */
  unit: DistanceUnit;
  tracker: TrackerState;
  /** The track: every recorded point, in order. */
  points: GpsPoint[];
  /** Where the drawn line breaks (gaps, pauses by hand). */
  breaks: TrackBreak[];
  /** The last trusted position, also while paused: where the dot is. */
  here: GpsPoint | null;
  /** The run came back after the app was closed: it waits, paused, until Resume. */
  closed: boolean;
  gps: GpsTrouble;
};

export type LiveAction =
  /** `now`: when it reached the app. The time the clock had shown by then is never taken back (PLAN 4.4c). */
  | { type: 'fix'; point: RawPoint; now?: number }
  /** `now`: the clock at the tap, so the time since the last position still counts (gps pendingMs). */
  | { type: 'pause'; now?: number }
  | { type: 'resume' }
  | { type: 'auto-pause'; on: boolean }
  /** The clock moved on (intervals count time, not positions). */
  | { type: 'tick'; now: number }
  | { type: 'gps'; trouble: GpsTrouble };

/** The goal of a setup, or null: a free run has none, and an interval run has its blocks instead. */
export function goalOf(setup: RunSetup): RunGoal | null {
  if (setup.type === 'distance') return { kind: 'distance', meters: goalMeters(setup.distance), label: distanceLabel(setup.distance) };
  if (setup.type === 'time') return { kind: 'time', seconds: goalSeconds(setup.timeMin), label: timeLabel(setup.timeMin) };
  return null;
}

export type StartInput = { id: string; now: number; setup: RunSetup; unit: DistanceUnit; autoPause: boolean };

export function startLive({ id, now, setup, unit, autoPause }: StartInput): LiveRun {
  return {
    id,
    startedAt: now,
    type: setup.type,
    goal: goalOf(setup),
    intervalPreset: setup.type === 'intervals' ? setup.interval : null,
    intervals: setup.type === 'intervals' ? startIntervals(planFor(setup.interval, setup.custom)) : null,
    unit,
    tracker: startTracker({ splitM: unitMeters(unit), autoPause }),
    points: [],
    breaks: [],
    here: null,
    closed: false,
    gps: null,
  };
}

/** Moving time as the clock on the screen shows it at `now` (the same as liveClock liveMovingMs). */
const shownMs = (tracker: TrackerState, now: number): number => tracker.movingMs + pendingMs(tracker, now);

/** One step. An action that changes nothing returns the same object. */
export function liveStep(run: LiveRun, action: LiveAction): LiveRun {
  switch (action.type) {
    case 'fix': {
      const { state: added, event } = addPoint(run.tracker, action.point);
      // A dropped fix changes nothing on the screen; the estimate may remember it (a jump, PLAN 4.4d).
      if (event.type === 'rejected') return added === run.tracker ? run : { ...run, tracker: added };
      const tracker = action.now === undefined ? added : countShown(added, shownMs(run.tracker, action.now) - shownMs(added, action.now));
      const gps = null;
      if (event.type === 'held') {
        // A good position that is not recorded (paused, or standing): the dot still follows it.
        const p = action.point as GpsPoint;
        return { ...run, tracker, here: { lat: p.lat, lng: p.lng, t: p.t, accuracy: p.accuracy }, gps };
      }
      const points = event.withheld ? [...run.points, event.withheld, event.point] : [...run.points, event.point];
      return { ...run, tracker, here: event.point, points, breaks: event.brk ? [...run.breaks, event.brk] : run.breaks, gps };
    }
    case 'pause': {
      if (run.tracker.manual) return run;
      // Ending or pausing inside the wide standing circle: the way walked there joins the track (PLAN 4.6b).
      const { state: tracker, point } = pauseTrack(run.tracker, action.now);
      return { ...run, tracker, points: point ? [...run.points, point] : run.points };
    }
    case 'resume': {
      const tracker = resumeRun(run.tracker);
      return tracker === run.tracker && !run.closed ? run : { ...run, tracker, closed: false };
    }
    case 'auto-pause':
      return run.tracker.autoPause === action.on ? run : { ...run, tracker: { ...run.tracker, autoPause: action.on } };
    case 'tick': {
      if (!run.intervals) return run;
      const intervals = tickIntervals(run.intervals, action.now, !run.tracker.manual);
      return intervals === run.intervals ? run : { ...run, intervals };
    }
    case 'gps':
      return run.gps === action.trouble ? run : { ...run, gps: action.trouble };
  }
}

export const readLive = (run: LiveRun): TrackerReading => readTracker(run.tracker);

/**
 * How far the phone's own timestamp may lag behind the clock and still be used. PLAN 4.4d: 10 s,
 * was 2 s. After a stall (a busy screen) the held fixes arrive together 2 to 4 s late; given the
 * arrival time they shared one time and were dropped as going backwards. The clock is safe either
 * way: the time the face showed is never taken back (fix `now`, countShown).
 */
export const FIX_LAG_MS = 10_000;
/** ...and how far it may be ahead (two clocks never agree exactly). */
const FIX_LEAD_MS = 500;

/**
 * The time of a reported position. The phone's own timestamp is the truth when it is close to the
 * clock (positions reach the app a little late, sometimes two at once); a timestamp that is missing
 * or far off (some phones count from boot, and old cached positions exist) gives the arrival time.
 */
export function fixTime(timestamp: number | null | undefined, now: number): number {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return now;
  return timestamp >= now - FIX_LAG_MS && timestamp <= now + FIX_LEAD_MS ? timestamp : now;
}
