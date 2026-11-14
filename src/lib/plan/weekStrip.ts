// PLAN 3.6f truth pass (third critique, item 9): what the day card's strip marks as done. On a
// fixed schedule the strip is labelled "This week", so it only shows what happened this calendar
// week (Monday to Sunday): a day done the week before is the pass's business, not this week's. A
// rotation (flexible, week to week) is labelled "This rotation" and keeps its own cycle. Pure.
import { weekStart } from '../coach/time';
import type { ScheduleStyle } from '../intake/options';

/** A finished plan workout: when it started and which plan day it was (by position). */
export type DayWorkout = { startedAt: number; dayIndex: number };

/**
 * The plan days with a finished workout in the calendar week of `now`. Null when the strip is not a
 * calendar week (a rotation): then every mark of the pass shows.
 */
export function weekDaysOf(style: ScheduleStyle, workouts: readonly DayWorkout[], now: number): number[] | null {
  if (style !== 'fixed') return null;
  const from = weekStart(now);
  return [...new Set(workouts.filter((w) => w.startedAt >= from && w.startedAt <= now && w.dayIndex >= 0).map((w) => w.dayIndex))].sort((a, b) => a - b);
}

/**
 * The strip's marks: the pass's done and part done days, kept only where the day was trained this
 * week when the strip is a calendar week (`weekDays` not null). The day up next is never changed.
 */
export function stripMarks(state: { doneDays: readonly number[]; partial?: Readonly<Record<number, number>> }, weekDays: readonly number[] | null | undefined): { done: number[]; partial: Record<number, number> } {
  const shown = (i: number) => !weekDays || weekDays.includes(i);
  return { done: state.doneDays.filter(shown), partial: Object.fromEntries(Object.entries(state.partial ?? {}).filter(([i]) => shown(Number(i)))) };
}
