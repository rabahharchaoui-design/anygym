// The end of a run (PLAN 4.3): the finished row and the plain summary read from it. Pure. Every
// number on the summary comes from the stored row, so the screen and the phone's data always agree.
import type { Run } from '../../db/types';
import type { DistanceUnit } from '../intake/answers';
import { AVG_PACE_MIN_M, averagePace, fromRunPoint, pathLengthM, toSegments, type Segment } from '../gps';
import { formatElapsed } from '../timer';
import { formatDistance, formatPace } from './format';
import type { LiveRun } from './live';
import { liveRow } from './snapshot';

/** The run row with its end (SPEC 12.11). */
export const finishRun = (run: LiveRun, endedAt: number): Run => ({ ...liveRow(run), endedAt });

/**
 * Under this a run is not worth the name: the same floor as an average pace (lib/gps
 * AVG_PACE_MIN_M), below which the numbers would be mostly GPS noise.
 */
export const MIN_RUN_M = AVG_PACE_MIN_M;

export type RunVerdict = 'ok' | 'no-gps' | 'too-short';

/** Is there a run to show? No good position at all, or next to no distance: say so, show no numbers. */
export const runVerdict = (run: Pick<Run, 'points' | 'distanceM'>): RunVerdict => (run.points.length === 0 ? 'no-gps' : run.distanceM < MIN_RUN_M ? 'too-short' : 'ok');

export const VERDICT_WORDS: Record<Exclude<RunVerdict, 'ok'>, { title: string; line: string }> = {
  'no-gps': { title: 'No GPS on this run', line: 'The phone never found a position it could trust, so there is no distance or route to show.' },
  'too-short': { title: 'Too short to measure', line: 'Under 50 m was recorded. That is too little for an honest distance or pace.' },
};

/** The route as solid pieces; the join before a piece with `dashedFromPrev` is drawn dashed. */
export const routeOf = (run: Pick<Run, 'points' | 'gaps'>): Segment[] => toSegments(run.points.map(fromRunPoint), run.gaps);

/**
 * Average pace in seconds per meter from the row: moving time over the distance that has time
 * (`timedM`, the tracker's own figure). Distance bridged across a GPS gap and the leg that ends an
 * auto pause carry no time, so they stay out of the pace, the same rule as lib/gps averagePace.
 * A row without `timedM` falls back to the length of the solid pieces (no dashed join counted).
 */
export function rowPace(run: Pick<Run, 'points' | 'gaps' | 'movingSec' | 'distanceM' | 'timedM' | 'heldSec'>): number | null {
  const timedM = run.timedM ?? Math.min(run.distanceM, routeOf(run).reduce((sum, s) => sum + pathLengthM(s.points), 0));
  // The first seconds of a GPS gap are moving time with no distance: no pace is made of them (PLAN 4.4a).
  return averagePace(run.movingSec - (run.heldSec ?? 0), timedM);
}

export type RunSummary = {
  distance: string;
  unit: DistanceUnit;
  time: string;
  pace: string;
  /** The unit the splits were cut in (the run's own; the given unit for a row that does not say). */
  splitUnit: DistanceUnit;
  /** Finished splits only. `time` is null for a split that holds a GPS gap: no time is shown for it. */
  splits: Array<{ n: number; time: string | null }>;
  /** At least one split holds a GPS gap. */
  anyGap: boolean;
};

export function summaryOf(run: Run, unit: DistanceUnit): RunSummary {
  const gaps = new Set(run.splitGaps ?? []);
  return {
    distance: formatDistance(run.distanceM, unit),
    unit,
    time: formatElapsed(run.movingSec),
    pace: formatPace(rowPace(run), unit),
    splitUnit: run.splitUnit ?? unit,
    splits: run.splits.map((sec, i) => ({ n: i + 1, time: gaps.has(i + 1) ? null : formatElapsed(sec) })),
    anyGap: run.splits.some((_, i) => gaps.has(i + 1)),
  };
}

/** What stands in place of a split's time when the split holds a GPS gap. */
export const SPLIT_GAP = 'GPS gap';
