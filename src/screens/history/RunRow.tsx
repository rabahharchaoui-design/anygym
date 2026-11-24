import type { Run } from '../../db/types';
import type { DistanceUnit } from '../../lib/intake/answers';
import { HistoryRow } from './HistoryRow';
import { runRowFacts, runTitle, workoutDate } from './historyWords';

/** A run among the workouts (PLAN 4.6, board 11): what and when, the distance and its time. Opens the run. */
export function RunRow({ run, unit }: { run: Run; unit: DistanceUnit }) {
  return <HistoryRow to={`/history/run/${run.id}`} testId="history-run-row" title={runTitle(run)} sub={workoutDate(run.startedAt)} facts={runRowFacts(run, unit)} />;
}
