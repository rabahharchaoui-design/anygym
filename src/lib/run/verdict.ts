// Is there a run to show? (PLAN 4.3) Kept in its own tiny file so History's list can say it
// without loading the live run code that summary.ts reads. summary.ts re-exports all of it.
import type { Run } from '../../db/types';
import { AVG_PACE_MIN_M } from '../gps/types';

/**
 * Under this a run is not worth the name: the same floor as an average pace (lib/gps
 * AVG_PACE_MIN_M), below which the numbers would be mostly GPS noise.
 */
export const MIN_RUN_M = AVG_PACE_MIN_M;

export type RunVerdict = 'ok' | 'no-gps' | 'too-short';

/** Is there a run to show? No good position at all, or next to no distance: say so, show no numbers. */
export const runVerdict = (run: Pick<Run, 'points' | 'distanceM'>): RunVerdict => (run.points.length === 0 ? 'no-gps' : run.distanceM < MIN_RUN_M ? 'too-short' : 'ok');
