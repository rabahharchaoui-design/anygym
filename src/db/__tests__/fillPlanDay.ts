// Test helper (1.7e): one set on every lift of a plan day session, so Finish counts the day as done.
import { planById } from '../../data/plans';
import { dayIndexOf } from '../../lib/plans';
import { dayWorkout } from '../../lib/planWorkout';
import type { AnyGymDB } from '../schema';
import type { Load } from '../types';
import { logSet } from '../workouts';

const BAR: Load = { kind: 'barbell', unit: 'kg', total: 60, barWeight: 20, perSide: [20] };

/** Tops every lift up to its planned sets (warm ups and the finisher are not needed). Returns how many. */
export async function fillPlanDay(db: AnyGymDB, sessionId: string, load: Load = BAR): Promise<number> {
  const s = await db.sessions.get(sessionId);
  const plan = planById(s?.planId);
  const i = plan && s ? dayIndexOf(plan, s.dayId) : -1;
  if (!plan || !s || i < 0) return 0;
  const existing = await db.sets.where('sessionId').equals(sessionId).toArray();
  const have = (id: string) => existing.filter((x) => x.exerciseId === id && x.kind !== 'warmup').length;
  let n = 0;
  for (const e of dayWorkout(plan, i, s.weekIndex ?? 0)) {
    if (e.warmup || e.finisher) continue;
    // Tops every lift up to all its planned sets, so the day counts as done (1.7e).
    for (let k = have(e.exerciseId); k < Math.max(1, e.sets); k++) {
      await logSet({ id: `fill-${sessionId}-${e.exerciseId}-${k}`, sessionId, exerciseId: e.exerciseId, reps: 8, load }, db);
      n++;
    }
  }
  return n;
}
