// Schedule reads and weekly choices; writes commit together on the phone, offline.
import { planById } from '../data/plans';
import { profileFor } from '../data/order';
import { adaptedPlanDay, alwaysPicks } from './planAdapt';
import { weekKey, weekStart } from '../lib/coach/time';
import { weekDaysOf } from '../lib/plan/weekStrip';
import { asksWeeklySchedule, needsWeeklySchedule, resolveNextDay, restDayOf, rotationOf, scheduleStyleOf, weekChoice, weekdaysLeft, type WeeklySchedule } from '../lib/plan/schedule';
import { WEEKDAYS, type WeekdayId } from '../lib/intake/options';
import { cleanWeekdays, fixedDaysOf, fixedScheduleHolds } from '../lib/plan/weekdays';
import { getProfile } from './intake';
import { readTrainingLog } from './training';
import { countedTraining } from '../lib/plan/recovery';
import { keptDayOf } from '../lib/finishPlan';
import { familyDayIndex, samePlanFamily } from '../data/planFamily';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { PlanState, Profile } from './types';

export async function resolveSchedule(state: PlanState, profile: Profile | undefined, now: number, db: AnyGymDB, gymId?: string) {
  const plan = planById(state.planId);
  if (!plan) return null;
  const style = scheduleStyleOf(profile?.intake, plan.scheduleStyle);
  // A pre-intake pointer keeps its legacy finish semantics until the person chooses a schedule.
  const keptIndex = keptDayOf(state);
  if (style === 'fixed' || (!profile?.intake && !state.pendingDayIndices && !plan.scheduleStyle)) return { dayIndex: state.nextDayIndex, pendingDayIndices: rotationOf(state, plan.days.length), deferred: [], ...(keptIndex !== undefined ? { kept: true as const } : {}) };
  const log = await readTrainingLog(now, db);
  // A day kept up next (under 60% done) is never moved away by its own part done workout.
  const keptDay = keptIndex !== undefined ? plan.days[keptIndex] : undefined;
  // PLAN 3.6j (A5): the kept day's own workout may be from the plan this one was tuned or rebuilt from.
  const kept = keptDay ? { dayIndex: state.nextDayIndex, trained: countedTraining(log, now, (e) => familyDayIndex(plan, e.planId, e.dayId) === keptIndex) } : undefined;
  const gym = gymId ? await db.gyms.get(gymId) : await db.gyms.filter((g) => g.isActive).first();
  const always = await alwaysPicks(plan.id, db);
  const days = plan.days.map((_, i) => [...new Set(adaptedPlanDay(plan, i, state.weekIndex, gym, always).exerciseIds.flatMap((id) => {
    const p = profileFor(id);
    return p.role === 'lift' ? p.targets : [];
  }))]);
  const next = resolveNextDay({ state, days, trained: countedTraining(log, now), now, ...(kept ? { kept } : {}) });
  return kept && next.dayIndex === kept.dayIndex ? { ...next, kept: true as const } : next;
}
export async function readSchedule(now = Date.now(), db: AnyGymDB = defaultDb) {
  return db.transaction('r', [db.profile, db.planState, db.sessions, db.sets, db.gyms, db.exerciseSettings], async () => {
    const profile = await getProfile(db);
    const state = await db.planState.get('active');
    const resolved = state ? await resolveSchedule(state, profile, now, db) : null;
    const style = scheduleStyleOf(profile?.intake);
    const planDays = planById(state?.planId)?.days.length ?? profile?.intake?.days ?? 0;
    const weekdays = style === 'weekly' ? (profile?.weeklySchedule?.weekKey === weekKey(now) ? profile.weeklySchedule.weekdays : undefined) : profile?.intake?.weekdays;
    // Round 3: a fixed schedule whose weekdays do not number the plan's days is found here, never papered over.
    const fixedDays = state && resolved ? fixedDaysOf(style, profile?.intake?.weekdays, planDays) : null;
    // "This week" on a fixed schedule means this calendar week: the plan days with a finished workout since Monday.
    // A rebuilt "Your plan" keeps its days by position (lib/plan/carry.ts), so its earlier builds count too.
    const plan = planById(state?.planId);
    const mine = (id: string | undefined) => !!plan && samePlanFamily(id, plan.id);
    const finished = style === 'fixed' && plan ? await db.sessions.where('startedAt').between(weekStart(now), now, true, true).filter((s) => !s.imported && s.endedAt !== undefined && !!s.dayId && mine(s.planId)).toArray() : [];
    // PLAN 3.6g2: a plan day finished today on a fixed schedule is done for today (not a day kept up next by the 60% rule: that one still waits).
    // 3.6z A13: "today" is the day the workout started, as in History and the week strip; one that runs past midnight belongs to the day before.
    const midnight = new Date(now).setHours(0, 0, 0, 0);
    const doneToday = !!state && keptDayOf(state) === undefined && finished.some((s) => s.startedAt >= midnight);
    const weekDays = plan ? weekDaysOf(style, finished.map((s) => ({ startedAt: s.startedAt, dayIndex: familyDayIndex(plan, s.planId, s.dayId) })), now) : null;
    return {
      weekKey: weekKey(now), style, weekly: profile?.weeklySchedule, resolved, planDays, fixedDays,
      /** Fixed schedule: the plan days trained this calendar week (the strip's "This week"). Null on a rotation. */
      weekDays,
      needsWeek: needsWeeklySchedule(profile?.intake, profile?.weeklySchedule, now),
      /** The sheet opens by itself (not straight after the intake late in a week). */
      asksWeek: asksWeeklySchedule({ answers: profile?.intake, saved: profile?.weeklySchedule, now, intakeDoneAt: profile?.intakeDoneAt, planDays }),
      /** The days that can still be picked this week: today on. */
      weekdaysLeft: weekdaysLeft(now),
      /** Not one of the person's days (fixed or weekly), or a fixed day already done today: Today says so, Start stays. */
      restDay: state && resolved && !fixedDays ? restDayOf(style, weekdays, now, doneToday) : null,
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

/** "Same days each week": the weekdays, exactly one for each day of the plan in use (lib/plan/weekdays.ts). */
export async function saveFixedWeekdays(days: readonly WeekdayId[], db: AnyGymDB = defaultDb): Promise<WeekdayId[]> {
  return db.transaction('rw', db.profile, db.planState, async () => {
    const profile = await getProfile(db);
    const planDays = planById((await db.planState.get('active'))?.planId)?.days.length ?? 0;
    const weekdays = cleanWeekdays(days);
    if (!profile?.intake || !planDays || !fixedScheduleHolds('fixed', weekdays, planDays)) throw new Error('Pick one weekday for each plan day');
    await db.profile.put({ ...profile, intake: { ...profile.intake, scheduleStyle: 'fixed', weekdays } });
    return weekdays;
  });
}
