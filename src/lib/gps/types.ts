// GPS processing for Run With Me (SPEC 12.3): the shapes and the thresholds, each with its reason.
// Everything in this folder is pure: no DOM, no navigator, no clock. Time comes in with the points.
// Inside: meters, seconds for results, milliseconds for timestamps (the stored RunPoint uses ms).

/** A position as the phone reports it. Anything may be missing; nothing missing is ever guessed. */
export type RawPoint = { lat?: number | null; lng?: number | null; t?: number | null; accuracy?: number | null; speed?: number | null };

/**
 * A point that passed the filter: degrees, timestamp in ms, accuracy radius in meters, and (PLAN
 * 4.4d) the phone's own speed in m/s when it gave one (coords.speed: measured from the signal's
 * Doppler shift, so it does not wander with the position).
 */
export type GpsPoint = { lat: number; lng: number; t: number; accuracy: number; speed?: number };

/** Why a point was not trusted. */
/** `jump`: far off where the estimate expects (estimate.ts, PLAN 4.4d). */
export type RejectReason = 'no-time' | 'time-backwards' | 'bad-position' | 'accuracy' | 'speed' | 'jump';

/**
 * Why a good point was not added to the track: the run is paused by hand, the runner stands still,
 * or (PLAN 4.4d) the step is shorter than the estimate's wobble and waits for the next one, or the
 * fix is surprising and waits for the next one to say whether it was real ('checking').
 */
export type HeldReason = 'paused' | 'still' | 'short' | 'checking' | 'settling';

/**
 * A break in the drawn line between two recorded points (their timestamps): a GPS gap, or a pause by
 * hand. Never drawn solid. `bridged` says whether the straight line across it was added to the
 * distance (`distanceM`, 0 when not); a pause is never bridged.
 */
export type TrackBreak = { fromT: number; toT: number; kind: 'gap' | 'pause'; bridged: boolean; distanceM: number };

/**
 * SPEC 12.3: a fix this sure or better is good on its own (the GPS chip says "good" up to here).
 * Worse fixes are still used (PLAN 4.4d), up to POOR_ACCURACY_M, but weighted by their accuracy in
 * the estimate (estimate.ts), so they move the numbers a little and never alone.
 */
export const MAX_ACCURACY_M = 25;

/**
 * PLAN 4.4d (3): fixes up to this are kept, weighted by accuracy. An iPhone often says 30 to 65 m in
 * the first minutes and between buildings; dropping them all froze the run for minutes (the
 * diagnosis in reports/run-lag-4.4d.md). Worse than this a fix is usually a guess from Wi-Fi or a
 * cell tower, and is dropped.
 */
export const POOR_ACCURACY_M = 65;

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
 * PLAN 4.4d (3): ...but never wider than this. A walk at 1.2 m/s covers 9.6 m in 8 s; a wider
 * circle read a walk at poor accuracy as standing and froze its distance for half a minute.
 */
export const STILL_RADIUS_CAP_M = 6;

/**
 * PLAN 4.4d (3): ...and moving again also needs this much way in the last RESUME_LOOKBACK_SEC
 * (1 m/s). A still phone's fixes drift slowly off the spot (a few cm a second); with the standing
 * circle alone that drift ended the standing state again and again and added meters. A walk covers
 * it in under 3 s.
 */
export const RESUME_WINDOW_M = 4;
export const RESUME_LOOKBACK_SEC = 4;

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
 * Current pace uses a rolling window of moving time (SPEC 12.2 said 30 s; PLAN 4.4d (3): 20 s). The
 * distance is already smoothed by the estimate (estimate.ts), so one noisy fix does not swing the
 * number; with 30 s it took 18 s just for a 30% change of speed to show within 10%.
 */
export const PACE_WINDOW_SEC = 15;

/** Current pace needs at least this much moving time in its window, otherwise there is no pace yet. */
export const PACE_MIN_SEC = 6;

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

/**
 * PLAN 4.4d (3): nobody standing still is, a moment later, going faster than this on average (a
 * hard start from a light reaches it in a few seconds). A fix that says so while standing is held
 * as a jump until more agree (estimate.ts JUMP_RESET).
 */
export const START_MAX_MPS = 4.5;

/**
 * PLAN 4.4d (3): a step shorter than this share of the estimate's accuracy (at most MIN_STEP_CAP_M)
 * is not recorded yet: summed fix by fix, the estimate's small wobble from side to side added 3 to
 * 6% to a walk. A walk at one fix a second still records at least every 2 to 3 s.
 */
export const MIN_STEP_SHARE = 0.5;
export const MIN_STEP_CAP_M = 4;

/**
 * PLAN 4.4d (3): the phone's own speed (coords.speed, from the Doppler shift of the signal) at or
 * above this is moving: standing never freezes the distance then, and moving again needs no way
 * off the spot. A walk is 1.2 to 1.6 m/s; a phone lying still reads 0 to 0.3.
 */
export const SPEED_MOVING_MPS = 0.9;

/** PLAN 4.4d (3): current pace from the phone's own speeds is their mean over this many seconds. */
export const SPEED_PACE_SEC = 5;

/** PLAN 4.4d (3): the phone's own speed under STILL_SPEED_MPS for this long is standing, for the distance. */
export const STILL_BY_SPEED_SEC = 3;

/**
 * PLAN 4.4d (3): an estimate less sure than this (its own accuracy, m) never calls the runner
 * standing by the positions: at the 60 m of a cold start a walk moved the estimate so little that it
 * read as standing and froze the distance for a minute (G's "lagged"). The phone's own speed still
 * says standing when it gives one; a still phone at such accuracy may add some meters (reported).
 */
export const STILL_TRUST_M = 15;

/**
 * PLAN 4.4d: a run whose first fix is worse than MAX_ACCURACY_M starts its line once this many
 * fixes in a row agree within their accuracies (a wild first fix of a cold start seeded 7.7% of
 * extra distance). The distance shows 0 until then; the clock counts.
 */
export const SETTLE_FIXES = 3;

/**
 * PLAN 4.4d: a reading of the phone's speed that said standing holds this long for fixes that bring
 * none (a phone at 30 m gives a speed only now and then): positions alone never end it meanwhile.
 */
export const SPEED_MEMORY_SEC = 10;

/**
 * PLAN 4.4d: without the phone's speed and with an unsure estimate, a step is recorded once the net
 * way is past the estimate's accuracy, but never more than this: 7 s of a walk at 1.4 m/s, so a
 * cold start shows its distance within about 10 s while a phone lying still adds only drift beyond it.
 */
export const UNSURE_STEP_CAP_M = 10;

/** PLAN 4.4d: without the phone's speed and with an unsure estimate, moving means at least this over the last 8 s. */
export const UNSURE_MOVE_MPS = 1;

/** PLAN 4.4d: the span over which the fixes themselves must show a walk (fixesWalking). */
export const FIXES_WALK_SEC = 5;
