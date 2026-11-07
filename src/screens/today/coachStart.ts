// A lighter week's "one set fewer" (PLAN 3.8, SPEC 15 deload): when a plan day starts during it,
// each of its exercises with a lighter week target loses one planned row for this workout only
// (lib/extraSets: the same "Remove set" the user has, so Finish and the plan count it the same).
import { db } from '../../db/schema';
import type { Session } from '../../db/types';
import { planById } from '../../data/plans';
import { dayIndexOf } from '../../lib/plans';
import { dayWorkout } from '../../lib/planWorkout';
import { extraSets, removeExtraSet } from '../../lib/extraSets';

/** Returns how many exercises got one set fewer. Never below one set; never twice. */
export async function applyLighterWeek(session: Session, now = Date.now()): Promise<number> {
  const ids = session.exerciseIds ?? [];
  const plan = planById(session.planId);
  const day = plan ? dayIndexOf(plan, session.dayId) : -1;
  if (!plan || day < 0 || !ids.length) return 0;
  const entries = new Map(dayWorkout(plan, day, session.weekIndex ?? 0).map((e) => [e.exerciseId, e]));
  const rows = await db.coachLifts.where('exerciseId').anyOf(ids).toArray();
  let n = 0;
  for (const id of ids) {
    const lighter = rows.some((r) => r.exerciseId === id && r.target?.fewerSets && r.target.until !== undefined && now < r.target.until);
    const entry = entries.get(id);
    if (!lighter || !entry || entry.warmup || entry.sets < 2 || extraSets(session.id, id) !== 0) continue;
    removeExtraSet(session.id, id);
    n++;
  }
  return n;
}
