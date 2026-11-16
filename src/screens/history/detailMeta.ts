// The line under a finished workout's title in History: date, sets, time and total lifted, each only
// when known (SPEC 9.3: imported workouts have no times; one left open for hours reads "Over 4 h").
import type { Session, Unit, WorkoutSet } from '../../db/types';
import { workSetCount, isWorkSet } from '../../lib/workSets';
import { formatTotal, totalLifted } from '../../lib/load';
import { isImportOrder } from '../../lib/import/importOrder';
import { workoutTime } from '../../lib/workoutTime';
import { setCount, workoutDate } from './historyWords';

/** 3.6z A12: a set the import was not sure of is marked in History and kept out of the total, as records already skip it. */
export const isSureWorkSet = (s: Pick<WorkoutSet, 'kind' | 'uncertain'>): boolean => isWorkSet(s) && !s.uncertain;

export function detailMeta(session: Session, sets: readonly WorkoutSet[], unit: Unit | undefined, now = Date.now()): string {
  const time = session.endedAt !== undefined && !session.imported && !isImportOrder(session.startedAt) ? workoutTime(session.startedAt, session.endedAt) : null;
  const sure = sets.filter(isSureWorkSet);
  const lifted = unit ? totalLifted(sure, unit) : 0;
  return [
    workoutDate(session.startedAt, now),
    setCount(workSetCount(sets)),
    ...(time ? [time.words] : []),
    // Dumbbells count both hands: say so, so the number is never a surprise.
    ...(lifted > 0 && unit ? [`${formatTotal(lifted, unit)} lifted${sure.some((x) => x.load?.kind === 'dumbbell_each') ? ' (both hands)' : ''}`] : []),
  ].join(' · ');
}
