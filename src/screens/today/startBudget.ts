// "How much time today?" before Start (PLAN 3.6 round 2, SPEC 7.4: the sheet is before Start). The
// pick on Today is for the next Start of that day only: kept on this phone for the day it was made,
// tied to the gym, plan and day, and applied to the workout the moment Start makes it. The minutes
// are also remembered per gym (Gym.timeBudgetMin) to preselect the chip next time. Nothing is ever
// trimmed without this pick.
import { profileFor } from '../../data/order';
import { planById } from '../../data/plans';
import { setWorkoutTrim } from '../../db/timeBudget';
import type { Session } from '../../db/types';
import { dayIndexOf, type PlanDay } from '../../lib/plans';
import { dayKey } from '../../lib/dayKey';
import { AS_PLANNED, trimDay, type TrimResult } from '../../lib/timeBudget';

export const NEXT_START_KEY = 'anygym-time-next-start';

export type NextStart = { gymId: string; planId: string; dayIndex: number; minutes: number; date: string };

export const localDay = (now = new Date()) => dayKey(now);

export function readNextStart(): NextStart | null {
  try {
    const raw = localStorage.getItem(NEXT_START_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<NextStart>) : null;
    if (!v || typeof v.gymId !== 'string' || typeof v.planId !== 'string' || typeof v.dayIndex !== 'number' || typeof v.minutes !== 'number' || typeof v.date !== 'string') return null;
    return v as NextStart;
  } catch {
    return null;
  }
}

export function writeNextStart(v: NextStart | null): void {
  try {
    if (v) localStorage.setItem(NEXT_START_KEY, JSON.stringify(v));
    else localStorage.removeItem(NEXT_START_KEY);
  } catch {
    // Storage blocked: the pick is not kept, the day starts as planned (never a wrong trim).
  }
}

/** The pick, when it is for this gym, plan and day, made today. */
export function pickFor(gymId: string | undefined, planId: string, dayIndex: number, now = new Date()): NextStart | null {
  const v = readNextStart();
  return v && v.gymId === gymId && v.planId === planId && v.dayIndex === dayIndex && v.date === localDay(now) ? v : null;
}

export const trimFor = (day: PlanDay, minutes: number, weekIndex: number): TrimResult => trimDay(day, { budget: minutes, weekIndex, profileOf: (id, name) => profileFor(id, name) });

/**
 * Start made `session`: the pick for its gym, plan and day (if any) trims it now, then is used up.
 * A workout that already has a trim or sets is left alone.
 */
export async function applyNextStart(session: Session, hasSets: boolean): Promise<void> {
  const plan = planById(session.planId);
  const dayIndex = plan ? dayIndexOf(plan, session.dayId) : -1;
  const day = plan?.days[dayIndex];
  if (!plan || !day) return;
  const pick = pickFor(session.gymId, plan.id, dayIndex);
  if (!pick) return;
  writeNextStart(null);
  if (session.trim || hasSets || pick.minutes >= AS_PLANNED) return;
  const r = trimFor(day, pick.minutes, session.weekIndex ?? 0);
  if (r.trim) await setWorkoutTrim(session.id, pick.minutes, r.trim);
}
