// History, workouts and runs together (PLAN 4.6, SPEC 12.9). Pure. Imported workouts stay in
// their own group (they have no date, SPEC 9.3). A run still going is not history.
import type { FinishedWorkout } from '../../db/history';
import type { Run } from '../../db/types';
import { weekStart } from '../../lib/coach/time';

export type DatedItem = { kind: 'workout'; at: number; workout: FinishedWorkout } | { kind: 'run'; at: number; run: Run };

/** Dated rows newest first, and the imported workouts left out of that order. */
export function historyFeed(workouts: readonly FinishedWorkout[], runs: readonly Run[]): { dated: DatedItem[]; imported: FinishedWorkout[] } {
  const imported = workouts.filter((w) => w.session.imported);
  const dated: DatedItem[] = [
    ...workouts.filter((w) => !w.session.imported).map((workout) => ({ kind: 'workout' as const, at: workout.session.startedAt, workout })),
    ...runs.filter((run) => run.endedAt !== undefined).map((run) => ({ kind: 'run' as const, at: run.endedAt!, run })),
  ];
  dated.sort((a, b) => b.at - a.at || (a.kind === b.kind ? 0 : a.kind === 'workout' ? -1 : 1));
  return { dated, imported };
}

/**
 * "This week: 2 workouts, 1 run" (board 11): the dated rows since Monday 00:00 of `now`, counted.
 * "This week: nothing yet" when there are none; every word is a count of saved rows.
 */
export function thisWeekLine(dated: readonly DatedItem[], now: number): string {
  const from = weekStart(now);
  const week = dated.filter((d) => d.at >= from && d.at <= now);
  const w = week.filter((d) => d.kind === 'workout').length;
  const r = week.length - w;
  const parts = [...(w ? [`${w} ${w === 1 ? 'workout' : 'workouts'}`] : []), ...(r ? [`${r} ${r === 1 ? 'run' : 'runs'}`] : [])];
  return `This week: ${parts.length ? parts.join(', ') : 'nothing yet'}`;
}
