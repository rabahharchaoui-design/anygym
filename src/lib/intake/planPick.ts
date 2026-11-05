// The plan reveal's pick (SPEC 14 step 14, PLAN 3.3). The generator is PLAN 3.5, so the reveal
// picks the best plan that exists today, honestly: a curated plan only when it can run at the
// user's gym the way the day list runs it, swaps included (PLAN 3.3a B1, planFit.ts), and one plain
// line on why. No fitting plan: it says so and offers a quick workout, never a made up plan.
import type { Plan } from '../plans';
import { estimateDayMinutes } from '../plans';
import type { SwapData } from '../swap';
import { goalsOf, type IntakeAnswers } from './funnel';
import { EASY_ON, labelOf, WEEKDAYS, type GoalId, type PlaceAnswer } from './options';
import { planFit, swappedLine, type PlanFit } from './planFit';

export { equipmentOf } from './planFit';

export type WeekSlot = { label: string; dayName: string; dayIndex: number };

export type PlanPick = { kind: 'plan'; plan: Plan; others: Plan[]; fit: PlanFit } | ({ kind: 'none' } & NoPlanWords);

/** Plans that can run at this gym (swaps included), in shipped order, with how. */
export function fittingPlans(plans: readonly Plan[], data: SwapData, a: IntakeAnswers): Array<{ plan: Plan; fit: PlanFit }> {
  return plans.map((plan) => ({ plan, fit: planFit(data, plan, a) })).filter((x) => x.fit.fits);
}

const MUSCLE_GOALS = new Set(['muscle', 'tone']);
const SEASONED = new Set(['1_2y', '3y', 'break']);

/** PLAN 3.3a: the Main goal leads the plan; the Also goal adds to it, at half the weight. */
const MAIN_WEIGHT = 1;
const ALSO_WEIGHT = 0.5;

/** Higher is a better fit. Ties keep the shipped order. */
export function fitScore(plan: Plan, a: IntakeAnswers): number {
  let s = 0;
  if (a.days !== undefined) s -= Math.abs(plan.daysPerWeek - a.days);
  const [main, also] = goalsOf(a);
  if (main && plan.goal === 'muscle' && MUSCLE_GOALS.has(main)) s += MAIN_WEIGHT;
  else if (also && plan.goal === 'muscle' && MUSCLE_GOALS.has(also)) s += ALSO_WEIGHT;
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
/** PLAN 3.3a B2: this far off counts as the wrong plan for the person. */
const FAR_DAYS = 2;
const FAR_MINUTES = 1.5;

export type PlanExplain = {
  /** "Your plan" only on a true match; "We don't have a 3 day beginner plan yet" when far off. */
  title: string;
  /** The lime check: earned only by "Your plan". */
  check: boolean;
  /** Days, minutes and level are far enough off that the plan is only an option (B2). */
  mismatch: boolean;
  /** What the pick really used, then what the plan is when that was not their answer. */
  reason: string;
  /** Both goals when there are two: "Main: muscle. Also: fat loss, coming soon." */
  goals: string | null;
  /** At most two lines on an iPhone: what differs from what they asked, what is not built in yet. */
  warning: string | null;
  /** Offer a quick workout too: as the main action when the time picked is short or the plan is far off. */
  quick: 'primary' | 'secondary' | null;
  /** Per plan day, the estimate the workout header shows. */
  minutes: number[];
};

/**
 * The one place the reveal's words and offer come from. The pick uses the equipment; goal and days
 * count only when they truly match the plan's own data. Everything else the user said is named as
 * not built in yet, never implied. The numbers repeated are the days per week answer and the time
 * picked (never the weekday count). `swapped` and `skipped`: plan moves that take a swap or that
 * nothing at this gym stands in for (planFit).
 * The generator (PLAN 3.5) replaces this.
 */
export function explainPick(plan: Plan, a: IntakeAnswers, swapped = 0, skipped = 0): PlanExplain {
  const [main, also] = goalsOf(a);
  // The Main goal earns "Your plan"; a matching Also goal is named, never the title or the check.
  const goalMatch = main === 'muscle' && plan.goal === 'muscle';
  const alsoMatch = !goalMatch && also === 'muscle' && plan.goal === 'muscle';
  const daysMatch = a.days === plan.daysPerWeek;
  const newLifter = a.experience === 'new' || a.experience === 'months';

  const minutes = plan.days.map((d) => estimateDayMinutes(d));
  const avg = average(minutes);
  // 75+ has no upper end.
  const timed = a.minutes !== undefined && a.minutes < 75;
  const longer = timed && avg > a.minutes!;

  // B2: far off on two of days, minutes and level is the wrong plan for this person.
  const farDays = a.days !== undefined && Math.abs(plan.daysPerWeek - a.days) >= FAR_DAYS;
  const farMinutes = timed && avg >= a.minutes! * FAR_MINUTES;
  const farLevel = newLifter && plan.level === 'intermediate';
  const mismatch = [farDays, farMinutes, farLevel].filter(Boolean).length >= 2;
  const wanted = [a.days !== undefined ? `${a.days} day` : null, timed ? `${a.minutes} minute` : null].filter((x): x is string => !!x).join(', ');
  const mismatchTitle = `We don't have a ${[wanted, newLifter ? 'beginner' : null].filter(Boolean).join(' ')} plan yet`;

  const gym = plan.gymType === 'full' ? (a.place === 'mix' ? 'your full gym days' : 'your full gym') : 'your equipment';
  const used = [gym];
  if (goalMatch) used.push(`your ${GOAL_WORD[main!]} goal`);
  if (alsoMatch) used.push(`your second goal (${GOAL_WORD[also!]})`);
  if (daysMatch) used.push(`your ${plan.daysPerWeek} days`);
  const builds = !goalMatch && !alsoMatch && plan.goal === 'muscle';
  const facts = [
    builds && !daysMatch ? `It builds muscle, ${plan.daysPerWeek} days a week.` : builds ? 'It builds muscle.' : !daysMatch ? `It runs ${plan.daysPerWeek} days a week.` : null,
    newLifter && plan.level === 'intermediate' ? 'It expects some experience, so start light.' : null,
    swappedLine(swapped, skipped),
  ].filter((x): x is string => !!x);
  const reason = [`Picked for ${list(used)}.`, ...facts].join(' ');

  // Two goals: both named, each said plainly as used or coming soon (never only the Main).
  const goalOk = (g: GoalId) => g === 'muscle' && plan.goal === 'muscle';
  const goals = main && also ? `Main: ${GOAL_WORD[main]}${goalOk(main) ? '' : ', coming soon'}. Also: ${GOAL_WORD[also]}${goalOk(also) ? '' : ', coming soon'}.` : null;

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
  if (!goals && main && !goalMatch) left.push(`${GOAL_WORD[main]} goal`);
  if (!goals && also && !alsoMatch) left.push(`${GOAL_WORD[also]} goal`);
  const easy = (a.easyOn ?? []).filter((e) => e !== 'none');
  if (easy.length === 1) left.push((labelOf(EASY_ON, easy[0]) ?? easy[0]!).toLowerCase());
  else if (easy.length > 1) left.push('easy-on areas');
  if (a.style === 'bodyweight' && plan.gymType !== 'bodyweight') left.push('bodyweight only');
  if ((a.focus ?? []).some((f) => f !== 'balance')) left.push('focus');
  if (a.never?.length) left.push('exercises to avoid');
  const named = left.length > 3 ? [...left.slice(0, 2), 'more'] : left;
  const plural = named.length > 1 || (/s$/.test(named[0] ?? '') && named[0] !== 'focus') || named[0] === 'exercises to avoid';
  const notBuilt = named.length ? `${capital(list(named))} ${plural ? "aren't" : "isn't"} built in yet.` : null;

  const quick = mismatch || (timed && longer && a.minutes! <= 30) ? 'primary' : (timed && avg >= a.minutes! * WELL_OVER) || a.experience === 'new' ? 'secondary' : null;
  const match = goalMatch && daysMatch && !mismatch;

  return {
    title: mismatch ? mismatchTitle : match ? 'Your plan' : 'Closest plan we have',
    check: match,
    mismatch,
    reason,
    goals,
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

export function pickPlan(plans: readonly Plan[], data: SwapData, a: IntakeAnswers): PlanPick {
  const fits = fittingPlans(plans, data, a);
  if (fits.length === 0) return { kind: 'none', ...noPlanWords(a.place) };
  const ranked = fits.map((x, i) => ({ ...x, i, s: fitScore(x.plan, a) })).sort((x, y) => y.s - x.s || x.i - y.i);
  return { kind: 'plan', plan: ranked[0]!.plan, fit: ranked[0]!.fit, others: ranked.slice(1).map((r) => r.plan) };
}
