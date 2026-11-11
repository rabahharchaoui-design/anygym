// "Preview" of today's plan day before Start (PLAN 3.5f): the day's lifts as the workout will start
// them at this gym (the same adaptDay the workout runs), one per deck card, in day order, with the
// time picked on Today applied. Nothing is replaced for the sake of a photo and nothing is left out
// that Start would keep: a swipe is the only thing that changes the day. Pure.
import type { Concept, PlanPart, QuickDeps } from './quick';
import type { GymKit } from './picker';
import type { Plan } from './plans';
import type { DayTrim } from './timeBudget';
import { EQUIPMENT_LABEL } from './intake/options';
import { dayWorkout, isStretchName } from './planWorkout';
import { planItems, planMinutes } from './quickPlan';
import { gearOf, hasGear, mainMuscles } from './quickShow';
import { withNotes } from './quickNotes';
import { adaptDay, requiresOf } from './swap';

export type PreviewInput = {
  plan: Plan;
  dayIndex: number;
  weekIndex: number;
  gym: GymKit;
  /** The plan's "Always use this" picks, slot → exercise. */
  always?: Readonly<Record<string, string>>;
  /** The trim of the time picked on Today for this Start (null: the day as planned). */
  trim: DayTrim | null;
};

/** The plan day as a deck, or null when it has no lift to look through. */
export function previewConcept(input: PreviewInput, deps: QuickDeps): Concept | null {
  const { plan, dayIndex, weekIndex, gym } = input;
  const day = plan.days[dayIndex];
  if (!day) return null;
  const entries = dayWorkout(plan, dayIndex, weekIndex);
  const unique = entries.filter((e, i) => entries.findIndex((x) => x.exerciseId === e.exerciseId) === i);
  const adapted = adaptDay(deps.data, unique, gym, input.always ?? {});
  const currentOf = new Map(unique.map((e) => [e.exerciseId, e.exerciseId]));
  for (const sw of adapted.swaps) currentOf.set(sw.slot, sw.current);
  const lifts = new Set(unique.filter((e) => !e.finisher && !e.warmup && !e.mobility && !isStretchName(e.name) && deps.profileOf(e.exerciseId, e.name).role === 'lift').map((e) => e.exerciseId));
  const part: PlanPart = { planId: plan.id, dayIndex, weekIndex, day, trim: input.trim };
  // Why the workout starts with another move than the plan lists: the gym lacks its gear, or the person always uses this one.
  const whyReplaced = (slot: string): string => {
    if (input.always?.[slot] && input.always[slot] === currentOf.get(slot)) return 'you always use this one';
    const missing = requiresOf(deps.data, slot)?.find((g) => !g.some((x) => hasGear(x, gym)));
    return missing?.length ? `your gym has no ${EQUIPMENT_LABEL[missing[0]!].toLowerCase()}` : 'it fits this gym';
  };
  const items = withNotes(
    planItems(part, deps, (slot) => currentOf.get(slot) ?? slot, () => undefined, whyReplaced).filter((it) => lifts.has(it.slot)),
    deps,
  );
  if (!items.length) return null;
  const ids = items.map((it) => it.id);
  return {
    id: 'plan',
    title: day.name,
    line: `${day.name} from your ${plan.name}`,
    items,
    minutes: planMinutes(part),
    over: false,
    plan: part,
    chip: 'Your plan',
    effort: 2,
    gear: gearOf(ids, deps.data, gym),
    primary: mainMuscles(items, deps),
  };
}
