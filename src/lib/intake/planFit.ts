// PLAN 3.3a round 2 (B1): whether a plan can run at the gym the intake describes, the way the day
// list will really run it (src/lib/swap.ts adaptDay, PLAN 3.4): an exercise whose gear is on stays,
// one whose gear is off takes its best swap, and one with no swap in the data at all is marked
// "Nothing fits: skip it" on the day list. A plan still fits while every day keeps at least three
// quarters of its moves (a leg extension with no stand in never sinks a whole full gym plan); the
// reveal says what was swapped and skipped. An exercise or finisher whose gear the data does not know
// for sure is left alone by the day list; it fits only a gym the user called a full gym (or one with
// everything on), never a guess at a hotel or at home. Pure: the swap data is passed in.
import { EQUIPMENT_IDS, type EquipmentId } from '../../db/types';
import { equipmentPreset } from '../../db/gyms';
import { dayWorkout } from '../planWorkout';
import type { Plan } from '../plans';
import type { GymKit } from '../picker';
import { adaptDay, requiresOf, supports, type SwapData } from '../swap';
import { GYM_TYPE_OF, presetEquipment, type IntakeAnswers } from './funnel';

export type PlanFit = {
  fits: boolean;
  /** Plan exercises (counted once across the week) that take a swap at this gym. */
  swapped: number;
  /** Plan exercises nothing at this gym can stand in for: the day list says skip them. */
  noFit: string[];
};

/** A day may lose at most this share of its moves to "nothing fits" and still count. */
const MAX_SKIPPED_SHARE = 0.25;

/** The equipment the plan meets: the picker's answer, else the place's preset. */
export function equipmentOf(a: IntakeAnswers): EquipmentId[] {
  return a.equipment ?? (a.place ? presetEquipment(a.place) : []);
}

/** The gym as the intake describes it: dumbbells count only with a range (typed, or the place's preset). */
export function gymKitOf(a: IntakeAnswers): GymKit {
  const equipment = equipmentOf(a);
  const preset = a.place ? equipmentPreset(GYM_TYPE_OF[a.place], a.units?.weight ?? 'lb').dumbbellRange : null;
  return { equipment, dumbbellRange: a.dumbbellRange ?? preset };
}

/** A full gym as the user said it (or everything on): gear the data does not know for sure is there. */
const fullGym = (a: IntakeAnswers, kit: GymKit) => a.place === 'full' || a.place === 'mix' || EQUIPMENT_IDS.every((id) => kit.equipment.includes(id));

export function planFit(data: SwapData, plan: Plan, a: IntakeAnswers): PlanFit {
  const kit = gymKitOf(a);
  const full = fullGym(a, kit);
  const swapped = new Set<string>();
  const noFit = new Set<string>();
  let fits = true;
  plan.days.forEach((day, i) => {
    const entries = dayWorkout(plan, i).filter((e, j, all) => all.findIndex((x) => x.exerciseId === e.exerciseId) === j);
    const adapted = adaptDay(data, entries, kit);
    let skipped = 0;
    for (const s of adapted.swaps) {
      if (s.noFit) {
        noFit.add(s.slot);
        skipped++;
      } else if (s.current !== s.slot) swapped.add(s.slot);
    }
    if (skipped > entries.length * MAX_SKIPPED_SHARE) fits = false;
    // Not sure of the gear and not a full gym: never claimed to fit.
    // A generated finisher says its gear (PLAN 3.5): it fits only where that gear is.
    const finisherOk = !day.finisher || (day.finisher.requires !== undefined && supports(day.finisher.requires, kit));
    if (day.finisher?.requires && !finisherOk) fits = false;
    if (!full && (!finisherOk || entries.some((e) => !e.finisher && !requiresOf(data, e.exerciseId)))) fits = false;
  });
  return { fits, swapped: swapped.size, noFit: [...noFit] };
}

/** "3 moves swapped for your gym." / "2 moves swapped and 1 skipped for your gym." or null. */
export function swappedLine(swapped: number, skipped = 0): string | null {
  const moves = (n: number) => `${n} ${n === 1 ? 'move' : 'moves'}`;
  if (swapped > 0 && skipped > 0) return `${moves(swapped)} swapped and ${skipped} skipped for your gym.`;
  if (swapped > 0) return `${moves(swapped)} swapped for your gym.`;
  if (skipped > 0) return `${moves(skipped)} skipped: nothing at your gym stands in.`;
  return null;
}
