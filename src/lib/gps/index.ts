// GPS processing for Run With Me (SPEC 12.3). The front door of this folder. Pure functions: no
// DOM, no navigator, no clock; time comes in with the points. Meters and seconds inside.
//
//   types.ts      shapes and every threshold with its reason
//   geo.ts        haversine distance
//   filter.ts     which reported positions are trusted
//   stillness.ts  standing still and moving again (auto pause)
//   pace.ts       current pace (rolling window) and average pace, null when not sure
//   splits.ts     splits per mile or km, boundaries interpolated
//   tracker.ts    the run state, one position at a time
//   batch.ts      the same tracker over a whole list
//   draw.ts       solid pieces, dashed breaks and smoothing, for drawing only
//   units.ts      meters per mile and per km
export * from './types';
export { EARTH_RADIUS_M, haversineM, pathLengthM } from './geo';
export { judgePoint, filterPoints } from './filter';
export type { Verdict, Filtered } from './filter';
export { pushRecent, isStill, leftStill, resumeRadiusM } from './stillness';
export { pushPace, currentPace, averagePace, pacePerUnit } from './pace';
export type { PaceSample } from './pace';
export { startSplits, addSplitStep, readSplits, splitPace } from './splits';
export type { Split, SplitState, SplitStep } from './splits';
export { startTracker, addPoint, pauseRun, pendingMs, resumeRun, readTracker } from './tracker';
export type { TrackerOptions, TrackerState, TrackerEvent, TrackerReading, RunStatus } from './tracker';
export { stepTracker, processTrack, processPoints } from './batch';
export type { TrackInput, TrackResult } from './batch';
export { toRunPoint, fromRunPoint, toRunGaps, toSegments, smoothPoints, smoothForDrawing } from './draw';
export type { Segment } from './draw';
export { METERS_PER_KM, METERS_PER_MILE, unitMeters } from './units';
