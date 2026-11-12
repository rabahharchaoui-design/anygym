// Starting a workout and reading the one in progress (split from workouts.ts, PLAN 3.6x).
import { planById } from '../data/plans';
import { dayIdOf } from '../lib/plans';
import { dayWorkout } from '../lib/planWorkout';
import { adaptDay } from '../lib/swap';
import { SWAP_DATA } from '../data/patterns';
import { newId } from './ids';
import { weekFor } from './planState';
import { db as defaultDb, type AnyGymDB } from './schema';
import { ANY_GYM, type Session } from './types';

/** The workout in progress: started, not ended, not imported. Newest first if somehow several. */
export async function getActiveSession(db: AnyGymDB = defaultDb): Promise<Session | undefined> {
  return db.sessions
    .orderBy('startedAt')
    .reverse()
    .filter((s) => s.endedAt === undefined && !s.imported)
    .first();
}

/** Starts an empty workout at the gym, or returns the one already in progress (a double tap starts one). */
export async function startWorkout(gymId: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Session> {
  return db.transaction('rw', db.sessions, async () => {
    const active = await getActiveSession(db);
    if (active) return active;
    const session: Session = { id: newId(), gymId, startedAt: now, imported: false, exerciseIds: [] };
    await db.sessions.add(session);
    return session;
  });
}

/**
 * Starts a plan day (PLAN 1.10): the session carries planId, dayId and the week, and lists the
 * day's exercises in order. If a workout is already in progress it is returned instead.
 */
export async function startPlanDay(gymId: string, planId: string, dayIndex: number, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Session> {
  const plan = planById(planId);
  const day = plan?.days[dayIndex];
  if (!plan || !day) throw new Error('Plan day not found');
  return db.transaction('rw', db.sessions, db.planState, db.gyms, db.exerciseSettings, async () => {
    const active = await getActiveSession(db);
    if (active) return active;
    const weekIndex = weekFor(await db.planState.get('active'), planId);
    const entries = dayWorkout(plan, dayIndex, weekIndex);
    const exerciseIds = [...new Set(entries.map((e) => e.exerciseId))];
    const session: Session = { id: newId(), gymId, planId, dayId: dayIdOf(day), weekIndex, startedAt: now, imported: false, exerciseIds };
    // PLAN 3.4 (SPEC 7.5): the day meets this gym once, here. What it decided is stored, so a reload
    // or a later change to the gym never reshuffles a workout in progress.
    const gym = await db.gyms.get(gymId);
    if (gym) {
      const always: Record<string, string> = {};
      for (const row of await db.exerciseSettings.filter((x) => x.gymId === ANY_GYM && !!x.alwaysUse?.[planId]).toArray()) always[row.exerciseId] = row.alwaysUse![planId]!;
      const adapted = adaptDay(SWAP_DATA, entries.filter((e, i) => exerciseIds.indexOf(e.exerciseId) === i), gym, always);
      if (adapted.swaps.length) {
        session.exerciseIds = adapted.exerciseIds;
        session.swaps = adapted.swaps;
      }
    }
    await db.sessions.add(session);
    return session;
  });
}
