// Where the user is in their curated plan (PLAN 1.10): one planState row, id 'active'.
// The plans are static JSON (src/data/plans.ts); only this small pointer is stored.
import { planById } from '../data/plans';
import { clampWeek, dayIndexOf } from '../lib/plans';
import { finishPlanPosition } from '../lib/finishPlan';
import type { DayProgress } from '../lib/planWorkout';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { PlanState, Session } from './types';

export async function getPlanState(db: AnyGymDB = defaultDb): Promise<PlanState | undefined> {
  return db.planState.get('active');
}

/**
 * "Use this plan": starts it at Day 1 (week 1). Throws for a plan that is not shipped. Choosing the
 * plan that is already active changes nothing (PLAN 1.7j): its week, next day and done marks stay,
 * read inside the same write transaction so a stale screen can never reset them.
 */
export async function choosePlan(planId: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<PlanState> {
  if (!planById(planId)) throw new Error('Plan not found');
  return db.transaction('rw', db.planState, async () => {
    const current = await db.planState.get('active');
    if (current?.planId === planId) return current;
    const state: PlanState = { id: 'active', planId, startedAt: now, weekIndex: 0, nextDayIndex: 0, doneDays: [] };
    await db.planState.put(state);
    return state;
  });
}

/** "Change day": the day the Start button opens next. */
export async function setNextDay(dayIndex: number, db: AnyGymDB = defaultDb): Promise<PlanState | undefined> {
  return db.transaction('rw', db.planState, async () => {
    const state = await db.planState.get('active');
    const plan = planById(state?.planId);
    if (!state || !plan) return state;
    const next = { ...state, nextDayIndex: Math.max(0, Math.min(plan.days.length - 1, Math.floor(dayIndex))) };
    await db.planState.put(next);
    return next;
  });
}

/** The week a plan day starts in: the state's week for a weekly table, else 0. */
export function weekFor(state: PlanState | undefined, planId: string): number {
  const plan = planById(planId);
  if (!plan || plan.progressionMode !== 'weekly_table' || state?.planId !== planId) return 0;
  return clampWeek(state.weekIndex, plan.weeks ?? 1);
}

/**
 * A saved plan workout moves the plan (PLAN 2.0a; call inside Finish's transaction, which includes
 * planState): 60% or more of the day's working sets moves on to the next day, less keeps the day
 * up next (lib/finishPlan.ts). A workout from another plan, or with no plan, changes nothing.
 */
export async function applyFinishProgress(session: Session, progress: Pick<DayProgress, 'share' | 'complete'> | undefined, db: AnyGymDB): Promise<void> {
  if (!progress) return;
  const at = await planDayOf(session, db);
  if (!at) return;
  const { state, plan, done } = at;
  const pos = finishPlanPosition(state, plan, done, progress);
  await db.planState.put(withPartial({ ...state, nextDayIndex: pos.nextDayIndex, weekIndex: pos.weekIndex, doneDays: pos.doneDays }, pos.partial));
}

/** Why the finish screen's "Change" could not set the next day. */
export class NextDayRefusedError extends Error {
  constructor() {
    super('The next day cannot be changed from this workout');
    this.name = 'NextDayRefusedError';
  }
}

/**
 * "Change" on the finish screen (PLAN 2.0a): the day Today opens next, saved at once. Only for a
 * finished workout of the active plan while no other workout is in progress, and only a real day
 * of that plan; the week stays as Finish left it. Otherwise NextDayRefusedError and nothing changes.
 */
export async function setFinishNextDay(sessionId: string, dayIndex: number, db: AnyGymDB = defaultDb): Promise<PlanState> {
  return db.transaction('rw', db.sessions, db.planState, async () => {
    const session = await db.sessions.get(sessionId);
    if (!session || session.endedAt === undefined || session.imported) throw new NextDayRefusedError();
    const active = await db.sessions.filter((s) => s.endedAt === undefined && !s.imported).first();
    if (active) throw new NextDayRefusedError();
    const at = await planDayOf(session, db);
    if (!at || !Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= at.plan.days.length) throw new NextDayRefusedError();
    const next = { ...at.state, nextDayIndex: dayIndex };
    await db.planState.put(next);
    return next;
  });
}

async function planDayOf(session: Session, db: AnyGymDB) {
  const state = await db.planState.get('active');
  const plan = planById(session.planId);
  if (!state || !plan || state.planId !== plan.id) return undefined;
  const done = dayIndexOf(plan, session.dayId);
  return done === -1 ? undefined : { state, plan, done };
}

/** Stores `partial` only when it has entries (older states never had the field). */
function withPartial(state: PlanState, partial: Record<number, number>): PlanState {
  const { partial: _old, ...rest } = state;
  return Object.keys(partial).length ? { ...rest, partial } : rest;
}
