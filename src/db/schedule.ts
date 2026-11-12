// Schedule reads and weekly choices; writes commit together on the phone, offline.
import { planById } from '../data/plans';
import { profileFor } from '../data/order';
import { adaptedPlanDay, alwaysPicks } from './planAdapt';
import { weekKey } from '../lib/coach/time';
import { needsWeeklySchedule, resolveNextDay, rotationOf, scheduleStyleOf, type WeeklySchedule } from '../lib/plan/schedule';
import { WEEKDAYS, type WeekdayId } from '../lib/intake/options';
import { getProfile } from './intake';
import { readTraining } from './training';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { PlanState, Profile } from './types';

export async function resolveSchedule(state: PlanState, profile: Profile | undefined, now: number, db: AnyGymDB, gymId?: string) {
  const plan = planById(state.planId);
  if (!plan) return null;
  const style = scheduleStyleOf(profile?.intake, plan.scheduleStyle);
  // A pre-intake pointer keeps its legacy finish semantics until the person chooses a schedule.
  if (style === 'fixed' || (!profile?.intake && !state.pendingDayIndices && !plan.scheduleStyle)) return { dayIndex: state.nextDayIndex, pendingDayIndices: rotationOf(state, plan.days.length), deferred: [] };
  const trained = await readTraining(now, db);
  const gym = gymId ? await db.gyms.get(gymId) : await db.gyms.filter((g) => g.isActive).first();
  const always = await alwaysPicks(plan.id, db);
  const days = plan.days.map((_, i) => [...new Set(adaptedPlanDay(plan, i, state.weekIndex, gym, always).exerciseIds.flatMap((id) => {
    const p = profileFor(id);
    return p.role === 'lift' ? p.targets : [];
  }))]);
  return resolveNextDay({ state, days, trained, now });
}
export async function readSchedule(now = Date.now(), db: AnyGymDB = defaultDb) {
  return db.transaction('r', [db.profile, db.planState, db.sessions, db.sets, db.gyms, db.exerciseSettings], async () => {
    const profile = await getProfile(db);
    const state = await db.planState.get('active');
    const resolved = state ? await resolveSchedule(state, profile, now, db) : null;
    return { weekKey: weekKey(now), style: scheduleStyleOf(profile?.intake), needsWeek: needsWeeklySchedule(profile?.intake, profile?.weeklySchedule, now), weekly: profile?.weeklySchedule, resolved };
  });
}
export async function saveWeeklySchedule(days: readonly WeekdayId[], now = Date.now(), db: AnyGymDB = defaultDb): Promise<WeeklySchedule> {
  if (!days.every((id) => WEEKDAYS.some((d) => d.id === id))) throw new Error('Choose valid weekdays');
  return db.transaction('rw', db.profile, async () => {
    const profile = await getProfile(db);
    if (!profile) throw new Error('Profile not found');
    const weeklySchedule = { weekKey: weekKey(now), weekdays: [...new Set(days)], answeredAt: now };
    await db.profile.put({ ...profile, weeklySchedule });
    return weeklySchedule;
  });
}
