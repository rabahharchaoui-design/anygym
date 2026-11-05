// The plan reveal's pick (SPEC 14 step 14, PLAN 3.3). The generator is PLAN 3.5, so the reveal
// picks the best plan that exists today, honestly: a curated plan only when the user's equipment
// covers every exercise in it (the same needs the place tiles of PLAN 3.1 use), and one plain
// line on why. No fitting plan: it says so and offers a quick workout, never a made up plan.
import { EQUIPMENT_IDS, type EquipmentId } from '../../db/types';
import type { Plan } from '../plans';
import { estimateDayMinutes } from '../plans';
import { placeFits, type Need, type Place } from '../places';
import { presetEquipment, type IntakeAnswers } from './funnel';
import { labelOf, PLACES, WEEKDAYS, type PlaceAnswer } from './options';

const CARDIO_GEAR: readonly EquipmentId[] = ['treadmill', 'bike', 'stair_climber', 'rower', 'jump_rope'];
/** Machines (SPEC 3 list). A plan's "machine" need does not say which one, so it needs them all. */
const MACHINES: readonly EquipmentId[] = [
  'smith_machine',
  'leg_press',
  'leg_extension',
  'leg_curl',
  'chest_press_machine',
  'pec_deck',
  'lat_pulldown',
  'seated_row',
  'shoulder_press_machine',
  'calf_raise_machine',
  'hip_adductor_abductor',
];

/** What the user's equipment covers, as plan needs. Everything on also covers unknown needs. */
export function needsCovered(equipment: readonly EquipmentId[]): Place['has'] {
  const has = new Set(equipment);
  if (EQUIPMENT_IDS.every((id) => has.has(id))) return 'all';
  const out: Need[] = ['bodyweight'];
  if (has.has('barbell_rack')) out.push('barbell');
  if (has.has('dumbbells')) out.push('dumbbell');
  if (has.has('kettlebells')) out.push('kettlebell');
  if (has.has('cable_station')) out.push('cable');
  if (has.has('resistance_bands')) out.push('bands');
  if (CARDIO_GEAR.some((id) => has.has(id))) out.push('cardio');
  if (MACHINES.every((id) => has.has(id))) out.push('machine');
  return out;
}

export type WeekSlot = { label: string; dayName: string; dayIndex: number };

export type PlanPick =
  | { kind: 'plan'; plan: Plan; reason: string; caveat: string | null; week: WeekSlot[]; others: Plan[] }
  | { kind: 'none'; reason: string; caveat: string };

/** The equipment the reveal uses: the picker's answer, else the place's preset. */
export function equipmentOf(a: IntakeAnswers): EquipmentId[] {
  return a.equipment ?? (a.place ? presetEquipment(a.place) : []);
}

/** Plans whose every exercise this equipment covers, in shipped order. */
export function fittingPlans(plans: readonly Plan[], needsOf: (p: Plan) => readonly Need[], a: IntakeAnswers): Plan[] {
  const place: Place = { id: 'full', label: '', has: needsCovered(equipmentOf(a)) };
  return plans.filter((p) => placeFits(place, needsOf(p)));
}

const MUSCLE_GOALS = new Set(['muscle', 'tone']);
const SEASONED = new Set(['1_2y', '3y', 'break']);

/** Higher is a better fit. Ties keep the shipped order. */
export function fitScore(plan: Plan, a: IntakeAnswers): number {
  let s = 0;
  if (a.days !== undefined) s -= Math.abs(plan.daysPerWeek - a.days);
  if (a.goal && plan.goal === 'muscle' && MUSCLE_GOALS.has(a.goal)) s += 1;
  if (a.experience && plan.level === 'intermediate' && SEASONED.has(a.experience)) s += 1;
  return s;
}

const PLACE_WORDS: Record<PlaceAnswer, string> = {
  full: 'a full gym',
  hotel: 'hotel gyms',
  home: 'home',
  outdoors: 'outdoors',
  mix: 'your mix of places',
};

/**
 * The week as the plan will run it: the user's days when there is one for each plan day, else
 * Day 1 to N. Every workout always shows, once (never hidden, never repeated).
 */
export function weekOf(plan: Plan, a: IntakeAnswers): WeekSlot[] {
  const order = WEEKDAYS.map((d) => d.id);
  const days = [...(a.weekdays ?? [])].sort((x, y) => order.indexOf(x) - order.indexOf(y));
  return plan.days.map((d, i) => ({
    label: days.length === plan.days.length ? (labelOf(WEEKDAYS, days[i]) ?? days[i]!) : `Day ${i + 1}`,
    dayName: d.name,
    dayIndex: i,
  }));
}

/** The one caveat worth saying, most important first; null when the plan fits as is. */
export function caveatFor(plan: Plan, a: IntakeAnswers): string | null {
  const picked = a.weekdays?.length ?? 0;
  if (picked > 0 && picked !== plan.days.length) return `You picked ${picked} days and this plan has ${plan.days.length}. Do them in order at your own pace.`;
  if (a.place === 'mix') return 'It needs a full gym. On the road, start a quick workout.';
  if (a.days !== undefined && a.days !== plan.daysPerWeek) return `You picked ${a.days} days. Do the days in order at your own pace.`;
  if (a.experience && !SEASONED.has(a.experience) && plan.level === 'intermediate') return 'It is made for lifters with some experience, so start light.';
  if (a.minutes !== undefined && a.minutes < 75) {
    const longest = Math.max(...plan.days.map((d) => estimateDayMinutes(d)));
    if (longest > a.minutes) return `Some days run longer than ${a.minutes} min.`;
  }
  return null;
}

/** Why the plan fits, in one line, from the plan's own data. */
export function reasonFor(plan: Plan): string {
  const goal = plan.goal === 'muscle' ? ', built to add muscle' : '';
  const gym = plan.gymType === 'full' ? 'full gym' : (labelOf(PLACES, plan.gymType as PlaceAnswer) ?? plan.gymType).toLowerCase();
  return `${plan.daysPerWeek} days a week in a ${gym}${goal}.`;
}

export function pickPlan(plans: readonly Plan[], needsOf: (p: Plan) => readonly Need[], a: IntakeAnswers): PlanPick {
  const fits = fittingPlans(plans, needsOf, a);
  if (fits.length === 0) {
    const where = a.place ? PLACE_WORDS[a.place] : 'your equipment';
    return {
      kind: 'none',
      reason: `No plan made for ${where} yet.`,
      caveat: 'A quick workout works anywhere: add exercises as you go.',
    };
  }
  const ranked = fits.map((p, i) => ({ p, i, s: fitScore(p, a) })).sort((x, y) => y.s - x.s || x.i - y.i);
  const plan = ranked[0]!.p;
  return {
    kind: 'plan',
    plan,
    reason: reasonFor(plan),
    caveat: caveatFor(plan, a),
    week: weekOf(plan, a),
    others: ranked.slice(1).map((r) => r.p),
  };
}
