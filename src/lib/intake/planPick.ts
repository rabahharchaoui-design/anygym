// The plan reveal's pick (SPEC 14 step 14, PLAN 3.3). The generator is PLAN 3.5, so the reveal
// picks the best plan that exists today, honestly: a curated plan only when the user's equipment
// covers every exercise in it (the same needs the place tiles of PLAN 3.1 use), and one plain
// line on why. No fitting plan: it says so and offers a quick workout, never a made up plan.
import { EQUIPMENT_IDS, type EquipmentId } from '../../db/types';
import type { Plan } from '../plans';
import { estimateDayMinutes } from '../plans';
import { placeFits, type Need, type Place } from '../places';
import { presetEquipment, type IntakeAnswers } from './funnel';
import { EASY_ON, labelOf, WEEKDAYS, type GoalId, type PlaceAnswer } from './options';

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

export type PlanPick = { kind: 'plan'; plan: Plan; others: Plan[] } | ({ kind: 'none' } & NoPlanWords);

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

const GOAL_WORD: Record<GoalId, string> = {
  muscle: 'muscle',
  strength: 'strength',
  fat_loss: 'fat loss',
  tone: 'tone up',
  health: 'stay healthy',
  athletic: 'athletic',
  race: 'race',
  comeback: 'comeback',
};

const list = (items: readonly string[]): string => (items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
const capital = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** One line when the sessions run longer than the time picked; numbers from the workout header's estimator. */
export function sessionWarning(plan: Plan, a: IntakeAnswers): string | null {
  // 75+ has no upper end.
  if (a.minutes === undefined || a.minutes >= 75) return null;
  const minutes = plan.days.map((d) => estimateDayMinutes(d));
  const over = minutes.filter((m) => m > a.minutes!);
  if (over.length === 0) return null;
  if (over.length === minutes.length) return `These sessions run about ${Math.round(minutes.reduce((x, y) => x + y, 0) / minutes.length)} min, longer than the ${a.minutes} you picked.`;
  return `Some sessions run about ${Math.max(...over)} min, longer than the ${a.minutes} you picked.`;
}

export type PlanExplain = {
  /** "Your plan" only when the plan truly matches the goal and the days. */
  title: 'Your plan' | 'Closest plan we have';
  /** What the pick really used, then what the plan is when that was not their answer. */
  reason: string;
  /** What they told us that is not built in yet; null when nothing is left out. */
  notBuilt: string | null;
  /** One line each: session length, schedule, level, place. */
  notes: string[];
  /** Per plan day, the estimate the workout header shows. */
  minutes: number[];
};

/**
 * The one place the reveal's words come from. The pick uses the equipment; goal and days count
 * only when they truly match the plan's own data. Everything else the user said is named as not
 * built in yet, never implied. The generator (PLAN 3.5) replaces this.
 */
export function explainPick(plan: Plan, a: IntakeAnswers): PlanExplain {
  const goalMatch = a.goal === 'muscle' && plan.goal === 'muscle';
  const daysMatch = a.days === plan.daysPerWeek;
  const used = [plan.gymType === 'full' ? 'your full gym' : 'your equipment'];
  if (goalMatch) used.push(`your ${GOAL_WORD[a.goal!]} goal`);
  if (daysMatch) used.push(`your ${plan.daysPerWeek} days`);
  const builds = !goalMatch && plan.goal === 'muscle';
  const fact = builds && !daysMatch ? `It builds muscle, ${plan.daysPerWeek} days a week.` : builds ? 'It builds muscle.' : !daysMatch ? `It runs ${plan.daysPerWeek} days a week.` : '';
  const reason = `Picked for ${list(used)}.${fact ? ` ${fact}` : ''}`;

  const left: string[] = [];
  if (a.goal && !goalMatch) left.push(`your ${GOAL_WORD[a.goal]} goal`);
  const easy = (a.easyOn ?? []).filter((e) => e !== 'none');
  if (easy.length) left.push(`going easy on your ${list(easy.map((e) => (labelOf(EASY_ON, e) ?? e).toLowerCase()))}`);
  if ((a.focus ?? []).some((f) => f !== 'balance')) left.push('your focus areas');
  if (a.never?.length) left.push('exercises to avoid');
  const notBuilt = left.length ? `${capital(list(left))} ${left.length > 1 ? "aren't" : "isn't"} built in yet.` : null;

  const picked = a.weekdays?.length || a.days;
  const notes = [
    sessionWarning(plan, a),
    picked && picked !== plan.days.length ? `You picked ${picked} days and this plan has ${plan.days.length}. Do them in order at your own pace.` : null,
    a.experience && !SEASONED.has(a.experience) && plan.level === 'intermediate' ? 'It is made for lifters with some experience, so start light.' : null,
    a.place === 'mix' ? 'It needs a full gym. On the road, start a quick workout.' : null,
  ].filter((n): n is string => !!n);

  return { title: goalMatch && daysMatch ? 'Your plan' : 'Closest plan we have', reason, notBuilt, notes, minutes: plan.days.map((d) => estimateDayMinutes(d)) };
}

export type NoPlanWords = { title: string; saved: string; quick: string };

const NO_PLAN_TITLE: Record<PlaceAnswer, string> = {
  hotel: 'No hotel plan yet',
  home: 'No home plan yet',
  outdoors: 'No outdoor plan yet',
  full: 'No plan for your equipment yet',
  mix: 'No plan for your equipment yet',
};

/** The honest words when no plan fits (the notice after the equipment, and the reveal). */
export function noPlanWords(place: PlaceAnswer | undefined): NoPlanWords {
  return {
    title: place ? NO_PLAN_TITLE[place] : 'No plan for your equipment yet',
    saved: 'Your gym and equipment are saved.',
    quick: 'A quick workout works anywhere: add exercises as you go.',
  };
}

export function pickPlan(plans: readonly Plan[], needsOf: (p: Plan) => readonly Need[], a: IntakeAnswers): PlanPick {
  const fits = fittingPlans(plans, needsOf, a);
  if (fits.length === 0) return { kind: 'none', ...noPlanWords(a.place) };
  const ranked = fits.map((p, i) => ({ p, i, s: fitScore(p, a) })).sort((x, y) => y.s - x.s || x.i - y.i);
  return { kind: 'plan', plan: ranked[0]!.p, others: ranked.slice(1).map((r) => r.p) };
}
