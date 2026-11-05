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
const average = (ns: readonly number[]): number => Math.round(ns.reduce((x, y) => x + y, 0) / ns.length);

/** Sessions this much over the time picked count as well over: offer a quick workout. */
const WELL_OVER = 1.25;

export type PlanExplain = {
  /** "Your plan" only when the plan truly matches the goal and the days. */
  title: 'Your plan' | 'Closest plan we have';
  /** The lime check: earned only by "Your plan". */
  check: boolean;
  /** What the pick really used, then what the plan is when that was not their answer. */
  reason: string;
  /** At most two lines on an iPhone: what differs from what they asked, what is not built in yet. */
  warning: string | null;
  /** Offer a quick workout too: as the main action when the time picked is short. */
  quick: 'primary' | 'secondary' | null;
  /** Per plan day, the estimate the workout header shows. */
  minutes: number[];
};

/**
 * The one place the reveal's words and offer come from. The pick uses the equipment; goal and days
 * count only when they truly match the plan's own data. Everything else the user said is named as
 * not built in yet, never implied. The numbers repeated are the days per week answer and the time
 * picked (never the weekday count). The generator (PLAN 3.5) replaces this.
 */
export function explainPick(plan: Plan, a: IntakeAnswers): PlanExplain {
  const goalMatch = a.goal === 'muscle' && plan.goal === 'muscle';
  const daysMatch = a.days === plan.daysPerWeek;
  const newLifter = a.experience === 'new' || a.experience === 'months';

  const gym = plan.gymType === 'full' ? (a.place === 'mix' ? 'your full gym days' : 'your full gym') : 'your equipment';
  const used = [gym];
  if (goalMatch) used.push(`your ${GOAL_WORD[a.goal!]} goal`);
  if (daysMatch) used.push(`your ${plan.daysPerWeek} days`);
  const builds = !goalMatch && plan.goal === 'muscle';
  const facts = [
    builds && !daysMatch ? `It builds muscle, ${plan.daysPerWeek} days a week.` : builds ? 'It builds muscle.' : !daysMatch ? `It runs ${plan.daysPerWeek} days a week.` : null,
    newLifter && plan.level === 'intermediate' ? 'It expects some experience, so start light.' : null,
  ].filter((x): x is string => !!x);
  const reason = [`Picked for ${list(used)}.`, ...facts].join(' ');

  const minutes = plan.days.map((d) => estimateDayMinutes(d));
  const avg = average(minutes);
  // 75+ has no upper end.
  const timed = a.minutes !== undefined && a.minutes < 75;
  const longer = timed && avg > a.minutes!;
  const otherDays = a.days !== undefined && !daysMatch;
  const compared =
    longer && otherDays
      ? `About ${avg} min, ${plan.daysPerWeek} days. You asked for ${a.minutes} min, ${a.days} days.`
      : longer
        ? `About ${avg} min. You asked for ${a.minutes} min.`
        : otherDays
          ? `${plan.daysPerWeek} days a week. You asked for ${a.days} days.`
          : null;

  const left: string[] = [];
  if (a.goal && !goalMatch) left.push(`${GOAL_WORD[a.goal]} goal`);
  const easy = (a.easyOn ?? []).filter((e) => e !== 'none');
  if (easy.length === 1) left.push((labelOf(EASY_ON, easy[0]) ?? easy[0]!).toLowerCase());
  else if (easy.length > 1) left.push('easy-on areas');
  if (a.style === 'bodyweight' && plan.gymType !== 'bodyweight') left.push('bodyweight only');
  if ((a.focus ?? []).some((f) => f !== 'balance')) left.push('focus');
  if (a.never?.length) left.push('exercises to avoid');
  const named = left.length > 3 ? [...left.slice(0, 2), 'more'] : left;
  const plural = named.length > 1 || (/s$/.test(named[0] ?? '') && named[0] !== 'focus') || named[0] === 'exercises to avoid';
  const notBuilt = named.length ? `${capital(list(named))} ${plural ? "aren't" : "isn't"} built in yet.` : null;

  const quick = timed && longer && a.minutes! <= 30 ? 'primary' : (timed && avg >= a.minutes! * WELL_OVER) || a.experience === 'new' ? 'secondary' : null;

  return {
    title: goalMatch && daysMatch ? 'Your plan' : 'Closest plan we have',
    check: goalMatch && daysMatch,
    reason,
    warning: [compared, notBuilt].filter(Boolean).join(' ') || null,
    quick,
    minutes,
  };
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
