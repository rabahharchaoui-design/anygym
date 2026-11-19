// GPS processing for Run With Me (SPEC 12.3): the shapes and the thresholds, each with its reason.
// Everything in this folder is pure: no DOM, no navigator, no clock. Time comes in with the points.
// Inside: meters, seconds for results, milliseconds for timestamps (the stored RunPoint uses ms).

/** A position as the phone reports it. Anything may be missing; nothing missing is ever guessed. */
export type RawPoint = { lat?: number | null; lng?: number | null; t?: number | null; accuracy?: number | null };

/** A point that passed the filter: degrees, timestamp in ms, accuracy radius in meters. */
export type GpsPoint = { lat: number; lng: number; t: number; accuracy: number };

/** Why a point was not trusted. */
export type RejectReason = 'no-time' | 'time-backwards' | 'bad-position' | 'accuracy' | 'speed';

/** Why a good point was not added to the track: the run is paused by hand, or the runner stands still. */
export type HeldReason = 'paused' | 'still';

/**
 * A break in the drawn line between two recorded points (their timestamps): a GPS gap, or a pause by
 * hand. Never drawn solid. `bridged` says whether the straight line across it was added to the
 * distance (`distanceM`, 0 when not); a pause is never bridged.
 */
export type TrackBreak = { fromT: number; toT: number; kind: 'gap' | 'pause'; bridged: boolean; distanceM: number };

/** SPEC 12.3: a point with an accuracy radius worse than this is dropped. */
export const MAX_ACCURACY_M = 25;

/** SPEC 12.3: a point that implies more than this from the previous good point is dropped. */
export const MAX_SPEED_MPS = 8;

/** SPEC 12.3: under this speed the runner counts as standing. */
export const STILL_SPEED_MPS = 0.5;

/** SPEC 12.3: standing for this long pauses. */
export const AUTO_PAUSE_SEC = 8;

/**
 * Standing means: every point of the last AUTO_PAUSE_SEC seconds lies inside this circle around the
 * newest one. It is the farthest anyone gets in that time under the standing speed (0.5 × 8 = 4 m).
 */
export const STILL_RADIUS_M = STILL_SPEED_MPS * AUTO_PAUSE_SEC;

/** PLAN 4.4b (13): the standing circle is at least this share of the fixes' stated accuracy. */
export const STILL_ACCURACY_SHARE = 0.5;

/**
 * No good point for longer than this is a gap. The phone reports about once a second, so two or
 * three dropped fixes under trees stay far below it, while 15 missing fixes in a row is a real loss
 * (phone locked, app switched). At a running pace 15 s is at most about 60 m, so the straight line
 * that joins shorter holes is still the route and not an invention.
 */
export const GAP_SEC = 15;

/**
 * The straight line across a gap is added to the distance only when the gap is no longer than this
 * and the implied speed is at most MAX_SPEED_MPS. Past five minutes nobody knows what happened in
 * between (a locked phone, a bus ride), so the line would be a guess and is not counted.
 */
export const GAP_BRIDGE_MAX_SEC = 300;

/**
 * SPEC 12.2: current pace uses a rolling 30 second window (of moving time). Long enough that one
 * noisy fix does not swing the number, short enough to follow a change of effort.
 */
export const PACE_WINDOW_SEC = 30;

/** Current pace needs at least this much moving time in its window, otherwise there is no pace yet. */
export const PACE_MIN_SEC = 10;

/**
 * Current pace needs at least this much distance in its window: twice what PACE_MIN_SEC covers at
 * the standing speed, so a shuffle inside the GPS noise never becomes a pace.
 */
export const PACE_MIN_M = 10;

/**
 * Average pace needs at least this much timed distance. With a typical accuracy of 5 m the error is
 * then about a tenth, and it shrinks from there; below it the number would be mostly noise.
 */
export const AVG_PACE_MIN_M = 50;
