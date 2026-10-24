// Where the user is in their curated plan (PLAN 1.10): one planState row, id 'active'.
// The plans are static JSON (src/data/plans.ts); only this small pointer is stored.
import { planById } from '../data/plans';
import { advancePlan, clampWeek, dayIndexOf } from '../lib/plans';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { PlanState, Session } from './types';

export async function getPlanState(db: AnyGymDB = defaultDb): Promise<PlanState | undefined> {
  return db.planState.get('active');
}

/** "Use this plan": starts it at Day 1 (week 1). Throws for a plan that is not shipped. */
export async function choosePlan(planId: string, db: AnyGymDB = defaultDb, now = Date.now()): Promise<PlanState> {
  if (!planById(planId)) throw new Error('Plan not found');
  const state: PlanState = { id: 'active', planId, startedAt: now, weekIndex: 0, nextDayIndex: 0, doneDays: [] };
  await db.transaction('rw', db.planState, () => db.planState.put(state));
  return state;
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
 * A saved plan workout moves the plan on (call inside a transaction that includes planState):
 * the next day is the one after the day just done, wrapping (and for a weekly table, one week on).
 * A workout from another plan, or with no plan, changes nothing.
 */
export async function advanceAfter(session: Session, db: AnyGymDB): Promise<void> {
  const state = await db.planState.get('active');
  const plan = planById(session.planId);
  if (!state || !plan || state.planId !== plan.id) return;
  const done = dayIndexOf(plan, session.dayId);
  if (done === -1) return;
  const pos = advancePlan(state, done, plan);
  await db.planState.put({ ...state, ...pos });
}
