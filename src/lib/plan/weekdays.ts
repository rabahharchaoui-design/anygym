// "Same days each week" (PLAN 3.6f round 3): the weekdays picked always number the plan's days.
// A plan with 3 days and 2 weekdays would leave Day 3 without a day, so "sets a week" could never
// happen. The intake and the reveal keep the two equal; a profile saved before this rule is found
// on read (fixedDaysOf) and Today asks for the right days instead of pretending. Pure.
import { WEEKDAYS, type ScheduleStyle, type WeekdayId } from '../intake/options';
import { plural } from '../words';

const ORDER = WEEKDAYS.map((d) => d.id);

/** Real weekdays, once each, Monday first. */
export function cleanWeekdays(days: readonly string[] | undefined): WeekdayId[] {
  return ORDER.filter((d) => days?.includes(d));
}

/** The invariant: on a fixed schedule there is exactly one weekday for each plan day. Other styles have none to count. */
export function fixedScheduleHolds(style: ScheduleStyle, weekdays: readonly string[] | undefined, planDays: number): boolean {
  return style !== 'fixed' || planDays <= 0 || cleanWeekdays(weekdays).length === planDays;
}

export type FixedDays = {
  /** The saved weekdays, cleaned. */
  weekdays: WeekdayId[];
  planDays: number;
  /** Weekdays still to pick (the plan has more days than weekdays). */
  missing: number;
  /** Weekdays too many (the plan has fewer days). */
  extra: number;
};

/** Repair on read: null when the schedule is not fixed or already holds; else what is off. Nothing is guessed or changed. */
export function fixedDaysOf(style: ScheduleStyle, weekdays: readonly string[] | undefined, planDays: number): FixedDays | null {
  if (fixedScheduleHolds(style, weekdays, planDays)) return null;
  const clean = cleanWeekdays(weekdays);
  return { weekdays: clean, planDays, missing: Math.max(0, planDays - clean.length), extra: Math.max(0, clean.length - planDays) };
}

/**
 * The weekdays the coming training days fall on, in the order they come from `now` on: today first
 * when it is one of them, then round the week (truth pass, critic r3 7). Each weekday once.
 */
export function comingWeekdays(weekdays: readonly string[] | undefined, now: number): WeekdayId[] {
  const clean = cleanWeekdays(weekdays);
  const today = (new Date(now).getDay() + 6) % 7;
  const at = clean.findIndex((d) => ORDER.indexOf(d) >= today);
  return at <= 0 ? clean : [...clean.slice(at), ...clean.slice(0, at)];
}

/** One more weekday, Monday first (the reveal's "Add a day" on a fixed schedule). */
export const addWeekday = (weekdays: readonly string[] | undefined, day: WeekdayId): WeekdayId[] => cleanWeekdays([...(weekdays ?? []), day]);

/** The weekdays not picked yet. */
export const freeWeekdays = (weekdays: readonly string[] | undefined): WeekdayId[] => ORDER.filter((d) => !weekdays?.includes(d));

/** Today's row: "Pick 1 more day" / "Pick 3 days" / "Take 1 day away". */
export function fixedDaysAsk(f: FixedDays): string {
  if (f.extra) return `Take ${plural(f.extra, 'day', 'days')} away`;
  return f.weekdays.length ? `Pick ${f.missing} more ${f.missing === 1 ? 'day' : 'days'}` : `Pick ${plural(f.planDays, 'day', 'days')}`;
}

/** Under the chips: the plan's number of days against what is picked. */
export function fixedPickWords(planDays: number, picked: number): string {
  const plan = `Your plan has ${plural(planDays, 'day', 'days')}.`;
  if (picked === planDays) return `${plan} You picked ${picked === 1 ? 'it' : `all ${picked}`}.`;
  if (picked < planDays) return `${plan} Pick ${planDays - picked}${picked ? ' more' : ''}.`;
  return `${plan} Take ${picked - planDays} away.`;
}

/** Under the reveal's "Which day do you add?": the plan is not rebuilt until the day is picked, so it "will have" its days (truth pass, critic r3 12). */
export function addDayWords(planDays: number, picked: number): string {
  return `Your plan will have ${plural(planDays, 'day', 'days')}. Pick ${Math.max(1, planDays - picked)} more.`;
}
