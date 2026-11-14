// Starting a workout and reading the one in progress (split from workouts.ts, PLAN 3.6x).
import { planById } from '../data/plans';
import { dayIdOf } from '../lib/plans';
import { getProfile } from './intake';
import { resolveSchedule } from './schedule';
import { scheduleStyleOf } from '../lib/plan/schedule';
import { newId } from './ids';
import { weekFor } from './planState';
import { db as defaultDb, type AnyGymDB } from './schema';
import { adaptedPlanDay, alwaysPicks } from './planAdapt';
import { type Session } from './types';

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
  return db.transaction('rw', [db.sessions, db.sets, db.profile, db.planState, db.gyms, db.exerciseSettings], async () => {
    const active = await getActiveSession(db);
    if (active) return active;
    let state = await db.planState.get('active');
    const profile = await getProfile(db);
    if (state?.planId === planId && (profile?.intake || state.pendingDayIndices || plan.scheduleStyle) && scheduleStyleOf(profile?.intake, plan.scheduleStyle) !== 'fixed') {
      const next = await resolveSchedule(state, profile, now, db, gymId);
      if (next?.dayIndex === null) throw new Error('Your rotation needs more recovery time.');
      if (next && next.dayIndex !== dayIndex) throw new Error('Your next day changed. Open Today to see it.');
      if (next) {
        state = { ...state, nextDayIndex: dayIndex, pendingDayIndices: next.pendingDayIndices };
        await db.planState.put(state);
      }
    }
    if (state?.planId === planId && state.pendingDayIndices && scheduleStyleOf(profile?.intake, plan.scheduleStyle) === 'fixed') {
      const { pendingDayIndices: _pending, ...fixed } = state;
      state = fixed;
      await db.planState.put(state);
    }
    const weekIndex = weekFor(state, planId);
    const gym = await db.gyms.get(gymId);
    const adapted = adaptedPlanDay(plan, dayIndex, weekIndex, gym, await alwaysPicks(planId, db));
    const session: Session = { id: newId(), gymId, planId, dayId: dayIdOf(day), weekIndex, startedAt: now, imported: false, exerciseIds: adapted.exerciseIds };
    if (adapted.swaps.length) session.swaps = adapted.swaps;
    await db.sessions.add(session);
    return session;
  });
}
