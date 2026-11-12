// Prescriptions (SPEC 7.3, 22): sets, reps or hold, rest and effort words of one item.
import type { ExperienceId } from '../intake/options';
import { isCompound, restFor } from '../order';
import { EFFORT, FAMILY_OF, HOLD, HOLD_NEW, MAX_ITEM_SETS, maxSetsFor, NEWER, PRESCRIPTION, setsFor, type GoalFamily } from '../generatorRules';
import { kindOf } from './pick';
import type { Ctx, Item, RawFinisher } from './types';

/** The most rest a bodyweight compound gets. */
const BODYWEIGHT_REST = 90;

// ---------------------------------------------------------------- prescriptions (SPEC 7.3, 22)

const ruleGoal = (f: GoalFamily) => (f === 'strength' ? 'strength' : 'muscle');

/** SPEC 7.3's ceiling for this lifter (every rule that adds sets stays under it). */
export const setCap = (ctx: Ctx): number => maxSetsFor(ctx.input.experience, ctx.main === 'comeback' || ctx.also === 'comeback');

/** SPEC 15 may lift an item past its usual sets (to MAX_ITEM_SETS), but a new lifter or a comeback keeps SPEC 7.3's ceiling. */
export const focusCap = (ctx: Ctx): number => (ctx.input.experience === 'new' || ctx.main === 'comeback' || ctx.also === 'comeback' ? Math.min(MAX_ITEM_SETS, setCap(ctx)) : MAX_ITEM_SETS);

/** Sets, reps or hold, rest and the effort words of one item. `lead`: the day's heaviest lift. */
export function prescribe(ctx: Ctx, it: Item, lead: boolean): void {
  const { family, also } = ctx;
  const exp = ctx.input.experience;
  const compound = isCompound(it.profile);
  const comeback = ctx.main === 'comeback' || also === 'comeback';
  const alsoFamily = also ? FAMILY_OF[also] : null;
  const rx = PRESCRIPTION[family];
  it.sets = setsFor(exp, compound, comeback);
  if (it.candidate.timed) {
    it.seconds = NEWER.has(exp as ExperienceId) || exp === undefined ? [...HOLD_NEW] : [...HOLD];
    it.rest = rx.accessoryRest;
    return;
  }
  if (compound) {
    // Also strength: the day's first big lift trains heavy (SPEC 14: the Also goal adds to the plan).
    const strong = family === 'strength' || (lead && alsoFamily === 'strength');
    const r = strong ? PRESCRIPTION.strength : rx;
    it.reps = [...r.compoundReps];
    // A bodyweight compound is never a heavy lift: about 90 s at most (SPEC 22 rule 6 is for loaded lifts).
    const rule = restFor(it.profile, ruleGoal(strong ? 'strength' : family));
    it.rest = Math.max(r.compoundRest, kindOf(it.candidate.requires) === 'body' ? Math.min(rule, BODYWEIGHT_REST) : rule);
  } else {
    // Also muscle (or tone) on another Main goal: the small moves use the muscle range.
    const reps = alsoFamily === 'muscle' && family !== 'muscle' ? PRESCRIPTION.muscle.accessoryReps : rx.accessoryReps;
    it.reps = [...reps];
    it.rest = rx.accessoryRest;
  }
  it.note = NEWER.has(exp as ExperienceId) || exp === undefined ? EFFORT.newer : compound ? EFFORT.compound : EFFORT.isolation;
}

/** Whether the Also goal changes anything in this plan (the reveal never claims more). */
export function alsoChanges(ctx: Ctx, finisher: RawFinisher | undefined): boolean {
  if (!ctx.also) return false;
  const fam = FAMILY_OF[ctx.also];
  if (ctx.also === 'comeback') return ctx.input.experience === '3y';
  if (fam === ctx.family) return false;
  if (fam === 'strength' || fam === 'muscle') return true;
  return finisher !== undefined;
}
