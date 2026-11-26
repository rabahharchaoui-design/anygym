// The Plan tab's week (PLAN M6, board 10): the active plan's days as rows, each with what is true of
// it in this pass. The same marks as Today's strip (lib/plan/weekStrip.ts stripMarks), so the two
// screens never disagree. Pure: no reads, no clock.
import type { Plan } from '../../lib/plans';
import type { PlanState } from '../../db/types';
import { stripMarks } from '../../lib/plan/weekStrip';
import { cleanWeekdays } from '../../lib/plan/weekdays';
import { WEEKDAYS } from '../../lib/intake/options';

export type WeekRowState = 'done' | 'partial' | 'next' | 'todo';
export type WeekRow = { index: number; n: number; name: string; state: WeekRowState };

export type WeekInput = {
  /** The plan day up next (Today's), null when every day rests, undefined when not known yet. */
  nextIndex: number | null | undefined;
  /** A rotation (flexible or week to week): the pass shows every mark it has. */
  flexible: boolean;
  /** Fixed schedule: the plan days trained this calendar week (readSchedule weekDays). */
  weekDays?: readonly number[] | null;
};

/** Every plan day in order, marked done, part done, up next or still to do. Never a mark the pass does not hold. */
export function planWeekRows(plan: Pick<Plan, 'days' | 'weeks'>, state: Pick<PlanState, 'doneDays' | 'partial'>, input: WeekInput): WeekRow[] {
  const marks = stripMarks(state, plan.weeks || input.flexible ? null : input.weekDays);
  const done = new Set(marks.done);
  return plan.days.map((d, i) => ({
    index: i,
    n: d.n,
    name: d.name,
    state: i === input.nextIndex ? 'next' : done.has(i) ? 'done' : marks.partial[i] !== undefined ? 'partial' : 'todo',
  }));
}

/**
 * The small grey line under "Plan": the plan's name, its week when it has a set length, and the
 * weekdays when the person fixed them ("Mon, Wed, Fri"). Only what is saved.
 */
export function planLine(plan: Pick<Plan, 'name' | 'weeks'>, weekIndex: number, fixedWeekdays?: readonly string[]): string {
  const parts = [plan.name];
  if (plan.weeks) parts.push(`Week ${weekIndex + 1} of ${plan.weeks}`);
  const days = cleanWeekdays(fixedWeekdays);
  if (days.length) parts.push(days.map((id) => WEEKDAYS.find((w) => w.id === id)!.label).join(', '));
  return parts.join(' · ');
}

/** The word at the right of the day up next: "Today" only when today is truly a training day on a calendar; else "Next". */
export const nextWord = (flexible: boolean, restDay: boolean): string => (!flexible && !restDay ? 'Today' : 'Next');
