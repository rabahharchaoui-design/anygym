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
 * Average pace in seconds per meter from the row: moving time over the distance of the solid
 * pieces only. Distance bridged across a gap has no time, so it must stay out of the pace.
 */
export function rowPace(run: Pick<Run, 'points' | 'gaps' | 'movingSec' | 'distanceM'>): number | null {
  const solidM = routeOf(run).reduce((sum, s) => sum + pathLengthM(s.points), 0);
  return averagePace(run.movingSec, Math.min(run.distanceM, solidM));
}

export type RunSummary = {
  distance: string;
  unit: DistanceUnit;
  time: string;
  pace: string;
  /** Finished splits only: "1", "5:12". */
  splits: Array<{ n: number; time: string }>;
};

export function summaryOf(run: Run, unit: DistanceUnit): RunSummary {
  return {
    distance: formatDistance(run.distanceM, unit),
    unit,
    time: formatElapsed(run.movingSec),
    pace: formatPace(rowPace(run), unit),
    splits: run.splits.map((sec, i) => ({ n: i + 1, time: formatElapsed(sec) })),
  };
}
