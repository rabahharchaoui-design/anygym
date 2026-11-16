// The line under a finished workout's title in History: date, sets, time and total lifted, each only
// when known (SPEC 9.3: imported workouts have no times).
import type { Session, Unit, WorkoutSet } from '../../db/types';
import { workSetCount, isWorkSet } from '../../lib/workSets';
import { formatTotal, totalLifted } from '../../lib/load';
import { isImportOrder } from '../../lib/import/importOrder';
import { setCount, workoutDate } from './historyWords';

/** 3.6z A12: a set the import was not sure of is marked in History and kept out of the total, as records already skip it. */
export const isSureWorkSet = (s: Pick<WorkoutSet, 'kind' | 'uncertain'>): boolean => isWorkSet(s) && !s.uncertain;

export function detailMeta(session: Session, sets: readonly WorkoutSet[], unit: Unit | undefined, now = Date.now()): string {
  const minutes = session.endedAt !== undefined && !session.imported && !isImportOrder(session.startedAt) ? Math.round((session.endedAt - session.startedAt) / 60000) : null;
  const sure = sets.filter(isSureWorkSet);
  const lifted = unit ? totalLifted(sure, unit) : 0;
  return [
    workoutDate(session.startedAt, now),
    setCount(workSetCount(sets)),
    ...(minutes !== null ? [minutes < 1 ? '<1 min' : `${minutes} min`] : []),
    // Dumbbells count both hands: say so, so the number is never a surprise.
    ...(lifted > 0 && unit ? [`${formatTotal(lifted, unit)} lifted${sure.some((x) => x.load?.kind === 'dumbbell_each') ? ' (both hands)' : ''}`] : []),
  ].join(' · ');
}
