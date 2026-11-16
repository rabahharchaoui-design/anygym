// PLAN 3.6j (audit A5): a plan and the builds that come from it are one family, so their workouts
// count for each other. A coach tuned copy names its origin in its own id (lib/coachTips.ts
// parseTunedId), and a rebuild of "Your plan" keeps its place by position (lib/plan/carry.ts).
import { parseTunedId } from '../lib/coachTips';
import { dayIndexOf, type Plan } from '../lib/plans';
import { isGeneratedId, planById } from './plans';

/**
 * True for two ids of one plan family: the same id, a coach tuned copy and the plan it came from
 * (or two copies of it), or two builds of "Your plan".
 */
export function samePlanFamily(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const baseA = parseTunedId(a).baseId;
  const baseB = parseTunedId(b).baseId;
  return baseA === baseB || (isGeneratedId(baseA) && isGeneratedId(baseB));
}

/**
 * The index in `plan` of a workout's day (`planId`, `dayId` as stored on the session), or -1. The
 * day is found in the workout's own plan and kept by position; a workout of another family, a day
 * the plan does not have, or a plan this phone cannot read gives -1 (never a guess).
 */
export function familyDayIndex(plan: Pick<Plan, 'id' | 'days'>, planId: string | undefined, dayId: string | undefined): number {
  if (!samePlanFamily(plan.id, planId)) return -1;
  const own = planId === plan.id ? plan : planById(planId);
  if (!own) return -1;
  const at = dayIndexOf(own, dayId);
  return at >= 0 && at < plan.days.length ? at : -1;
}
