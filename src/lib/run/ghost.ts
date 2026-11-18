// The finish line of a ghost race (PLAN 4.6, SPEC 12.9 "ghost result if raced"). Pure. Compared
// from the start of each run up to the distance both covered before a GPS gap. No number when
// that cannot be measured. The race itself is offered by PLAN 4.5; this only reads a stored one.
import type { Run } from '../../db/types';
import type { DistanceUnit } from '../intake/answers';
import { formatElapsed } from '../timer';
import { openMeters, timeFromStartSec } from './efforts';
import { distanceWithUnit } from './format';
import { MIN_RUN_M } from './summary';

export type GhostResult = {
  /** Positive: this run was faster. */
  seconds: number;
  /** The distance the two times cover. */
  atM: number;
  /** Both runs were compared over essentially their whole distance, so the line needs no qualifier. */
  full: boolean;
};

/** How this run compared with the one it raced. Null when it raced nothing we can measure. */
export function ghostResult(run: Run, runs: readonly Run[]): GhostResult | null {
  if (!run.ghostOfRunId || run.ghostOfRunId === run.id) return null;
  const ghost = runs.find((r) => r.id === run.ghostOfRunId && r.endedAt !== undefined);
  if (!ghost) return null;
  const aM = openMeters(run.points, run.gaps);
  const bM = openMeters(ghost.points, ghost.gaps);
  const atM = Math.min(aM, bM);
  if (atM < MIN_RUN_M) return null;
  const mine = timeFromStartSec(run.points, run.gaps, atM);
  const theirs = timeFromStartSec(ghost.points, ghost.gaps, atM);
  if (mine === null || theirs === null) return null;
  const close = (x: number, y: number) => y > 0 && x >= y * 0.98 && x <= y * 1.02;
  const full = close(aM, bM) && close(aM, run.distanceM) && close(bM, ghost.distanceM);
  return { seconds: theirs - mine, atM, full };
}

/** The one line the finish screen shows. Null when there is no result. */
export function ghostWords(result: GhostResult | null, unit: DistanceUnit): string | null {
  if (!result) return null;
  const n = Math.round(Math.abs(result.seconds));
  const where = result.full ? '' : ` at ${distanceWithUnit(result.atM, unit)}`;
  if (n < 1) return `Even with your earlier run${where}`;
  const clock = n < 60 ? `${n} s` : formatElapsed(n);
  const which = result.seconds > 0 ? 'ahead of' : 'behind';
  return `${clock} ${which} your earlier run${where}`;
}
