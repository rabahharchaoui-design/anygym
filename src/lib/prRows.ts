// The new PRs of a finished workout, one per lift (PLAN M18a; the finish screen's PR rows, M18b).
// Detection is NOT here: it is the one record rule of lib/records.ts (recordSets, the live "New
// best" chip), read through db/history.ts finishedWins. This only picks, per lift, the record that
// beat its history by the most (lib/load biggerGain), and drops ones that only beat an earlier set
// of the same workout.
import { biggerGain } from './load';
import type { SetRecord } from './records';

export type PrRow = { exerciseId: string; name: string; record: SetRecord };

/** One row per lift with a record over its history, in workout order. */
export function prRows(groups: ReadonlyArray<{ exerciseId: string; name: string; records: readonly SetRecord[] }>): PrRow[] {
  const out: PrRow[] = [];
  for (const g of groups) {
    let best: SetRecord | undefined;
    for (const r of g.records) if (r.gainOverHistory > 0 && (!best || biggerGain(r.gainOverHistory, best.gainOverHistory))) best = r;
    if (best) out.push({ exerciseId: g.exerciseId, name: g.name, record: best });
  }
  return out;
}
