// Schedule reads and weekly choices; writes commit together on the phone, offline.
import { planById } from '../data/plans';
import { profileFor } from '../data/order';
import { adaptedPlanDay, alwaysPicks } from './planAdapt';
import { weekKey } from '../lib/coach/time';
import { asksWeeklySchedule, needsWeeklySchedule, resolveNextDay, restDayOf, rotationOf, scheduleStyleOf, weekChoice, weekdaysLeft, type WeeklySchedule } from '../lib/plan/schedule';
import { WEEKDAYS, type WeekdayId } from '../lib/intake/options';
import { getProfile } from './intake';
import { readTrainingLog } from './training';
import { countedTraining } from '../lib/plan/recovery';
import { movesOn } from '../lib/finishPlan';
import { dayIdOf } from '../lib/plans';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { PlanState, Profile } from './types';

export async function resolveSchedule(state: PlanState, profile: Profile | undefined, now: number, db: AnyGymDB, gymId?: string) {
  const plan = planById(state.planId);
  if (!plan) return null;
  const style = scheduleStyleOf(profile?.intake, plan.scheduleStyle);
  // A pre-intake pointer keeps its legacy finish semantics until the person chooses a schedule.
  if (style === 'fixed' || (!profile?.intake && !state.pendingDayIndices && !plan.scheduleStyle)) return { dayIndex: state.nextDayIndex, pendingDayIndices: rotationOf(state, plan.days.length), deferred: [] };
  const log = await readTrainingLog(now, db);
  // A day kept up next (under 60% done) is never moved away by its own part done workout.
  const share = state.partial?.[state.nextDayIndex];
  const keptDay = share !== undefined && !movesOn(share) && !state.doneDays.includes(state.nextDayIndex) ? plan.days[state.nextDayIndex] : undefined;
  const kept = keptDay ? { dayIndex: state.nextDayIndex, trained: countedTraining(log, now, (e) => e.planId === plan.id && e.dayId === dayIdOf(keptDay)) } : undefined;
  const gym = gymId ? await db.gyms.get(gymId) : await db.gyms.filter((g) => g.isActive).first();
  const always = await alwaysPicks(plan.id, db);
  const days = plan.days.map((_, i) => [...new Set(adaptedPlanDay(plan, i, state.weekIndex, gym, always).exerciseIds.flatMap((id) => {
    const p = profileFor(id);
    return p.role === 'lift' ? p.targets : [];
  }))]);
  return resolveNextDay({ state, days, trained: countedTraining(log, now), now, ...(kept ? { kept } : {}) });
}
export async function readSchedule(now = Date.now(), db: AnyGymDB = defaultDb) {
  return db.transaction('r', [db.profile, db.planState, db.sessions, db.sets, db.gyms, db.exerciseSettings], async () => {
    const profile = await getProfile(db);
    const state = await db.planState.get('active');
    const resolved = state ? await resolveSchedule(state, profile, now, db) : null;
    const style = scheduleStyleOf(profile?.intake);
    const planDays = planById(state?.planId)?.days.length ?? profile?.intake?.days ?? 0;
    const weekdays = style === 'weekly' ? (profile?.weeklySchedule?.weekKey === weekKey(now) ? profile.weeklySchedule.weekdays : undefined) : profile?.intake?.weekdays;
    return {
      weekKey: weekKey(now), style, weekly: profile?.weeklySchedule, resolved, planDays,
      needsWeek: needsWeeklySchedule(profile?.intake, profile?.weeklySchedule, now),
      /** The sheet opens by itself (not straight after the intake late in a week). */
      asksWeek: asksWeeklySchedule({ answers: profile?.intake, saved: profile?.weeklySchedule, now, intakeDoneAt: profile?.intakeDoneAt, planDays }),
      /** The days that can still be picked this week: today on. */
      weekdaysLeft: weekdaysLeft(now),
      /** Not one of the person's days (fixed or weekly): Today says so, Start stays. */
      restDay: state && resolved ? restDayOf(style, weekdays, now) : null,
    };
  });
}
export async function saveWeeklySchedule(days: readonly WeekdayId[], now = Date.now(), db: AnyGymDB = defaultDb): Promise<WeeklySchedule> {
  if (!days.every((id) => WEEKDAYS.some((d) => d.id === id))) throw new Error('Choose valid weekdays');
  return db.transaction('rw', db.profile, async () => {
    const profile = await getProfile(db);
    if (!profile) throw new Error('Profile not found');
    // Only today and the days after it can be picked; days already past stay as they were saved.
    const weeklySchedule = { weekKey: weekKey(now), weekdays: weekChoice(days, profile.weeklySchedule, now), answeredAt: now };
    if (!weeklySchedule.weekdays.length) throw new Error('Choose a day from today on');
    await db.profile.put({ ...profile, weeklySchedule });
    return weeklySchedule;
  });
}
