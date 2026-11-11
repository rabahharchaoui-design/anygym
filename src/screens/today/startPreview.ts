// Start after "Preview" (PLAN 3.5f): the plan day starts exactly as Today's Start starts it (the
// gym's adapt, a lighter week, the time picked), then only what the person changed on the deck is
// applied: each swap, and each move hidden with nothing to put in its place.
import { db } from '../../db/schema';
import { swapExercise } from '../../db/swaps';
import type { Session } from '../../db/types';
import { getActiveSession, removeExercise, startPlanDay } from '../../db/workouts';
import type { PlanPart, QuickItem } from '../../lib/quick';
import { applyLighterWeek } from './coachStart';
import { applyNextStart } from './startBudget';

export type PreviewChanges = {
  /** The deck as it ended (a card whose id differs from its origin was swapped). */
  items: readonly QuickItem[];
  /** The exercises (as the workout starts them) hidden with no replacement. */
  removed: readonly string[];
};

/** A workout already in progress is returned untouched (nothing of the preview is applied to it). */
export async function startPreviewedDay(gymId: string, part: Pick<PlanPart, 'planId' | 'dayIndex'>, changes: PreviewChanges): Promise<Session> {
  const before = await getActiveSession();
  if (before) return before;
  const session = await startPlanDay(gymId, part.planId, part.dayIndex);
  await applyLighterWeek(session).catch(() => 0);
  await applyNextStart(session, (await db.sets.where('sessionId').equals(session.id).count()) > 0).catch(() => undefined);
  const now = () => db.sessions.get(session.id);
  for (const it of changes.items) {
    if (it.id === it.origin) continue;
    // Only a move still in the workout (the time picked may have cut it).
    if ((await now())?.exerciseIds?.includes(it.origin)) await swapExercise(session.id, it.origin, it.id);
  }
  for (const id of changes.removed) if ((await now())?.exerciseIds?.includes(id)) await removeExercise(session.id, id);
  return (await now()) ?? session;
}
