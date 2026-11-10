// Ask before changing the plan (competitor gap 3, SPEC 15): after missed workouts the plan never
// changes on its own; one card asks "Pick up where you left off, or rebuild the week?".
import { daysBetween, startOfDay, weekdayOf } from './time';

/** Missed workouts before the card asks. */
export const MISSED_AT = 2;

export type MissedInput = {
  /** When the last workout was. */
  last: number;
  now: number;
  /** The intake's training days ('mon' …), when the user gave them. */
  weekdays?: readonly string[];
  /** The plan's days per week (used when no training days were given). */
  daysPerWeek: number;
};

/**
 * Planned workouts that did not happen between the last workout and today (both left out: today
 * can still happen). With training days: exactly those weekdays. Without: the plan's days per
 * week over the days in between, rounded down (never more than really fit).
 */
export function missedWorkouts({ last, now, weekdays, daysPerWeek }: MissedInput): number {
  const gap = daysBetween(last, now);
  if (gap < 2) return 0;
  if (weekdays?.length) {
    let n = 0;
    const d = new Date(startOfDay(last));
    for (let i = 1; i < gap; i++) {
      d.setDate(d.getDate() + 1);
      if (weekdays.includes(weekdayOf(d.getTime()))) n++;
    }
    return n;
  }
  return Math.floor(((gap - 1) * Math.max(0, Math.min(7, daysPerWeek))) / 7);
}

export const missedCardId = (last: number): string => `missed:${last}`;

/** "Missed 2 workouts" (PLAN 3.8b: short; the choice is explained once, under it). */
export const missedTitle = (n: number): string => `Missed ${n} ${n === 1 ? 'workout' : 'workouts'}`;

/**
 * PLAN 3.5g: the missed days card's buttons. With the next day somewhere in the week: Resume that day
 * (primary) or Restart Day 1. When the next day already is Day 1 those two are the same thing, so one
 * Start Day 1 (primary) and Rebuild my week (a fresh week: no day counted as done). `next` is the
 * plan's next day index, or null when it is not known.
 */
export type MissedChoice = { primary: { kind: 'resume' | 'start'; label: string }; secondary: { kind: 'restart' | 'rebuild'; label: string } };
export function missedChoice(next: number | null): MissedChoice {
  if (next === 0) return { primary: { kind: 'start', label: 'Start Day 1' }, secondary: { kind: 'rebuild', label: 'Rebuild my week' } };
  return { primary: { kind: 'resume', label: next === null ? 'Resume' : `Resume Day ${next + 1}` }, secondary: { kind: 'restart', label: 'Restart Day 1' } };
}
