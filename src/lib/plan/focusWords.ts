// PLAN 3.6f: what the plan says about each focus pick, the way a coach would say it in one short
// line. Words only: every number is the one the focus report gives. Pure.
import type { ScheduleStyle } from '../intake/options';
import { focusLabel, type FocusResult } from './focus';

/**
 * How often the sets come round. A calendar plan (same days, or days picked each week) counts "a
 * week"; a flexible rotation has no week to promise, so it counts its own workouts.
 */
export const focusPeriod = (style: ScheduleStyle | undefined, workouts: number): string => (style === 'fixed' || style === 'weekly' ? 'a week' : `every ${workouts} workouts`);

const sets = (n: number): string => `${n} ${n === 1 ? 'set' : 'sets'}`;

/**
 * One line for one pick: [what, how much]. A pick that got nothing is never a zero: it says what is
 * true in words ("no room for it yet", "no sure exercises yet").
 */
export function focusLine(p: FocusResult, period: string): [string, string] {
  const name = focusLabel(p.id);
  if (p.id === 'mobility') return (p.minutes ?? 0) > 0 ? [name, `${p.minutes} min of stretches ${period}`] : [name, 'no stretch time fits yet'];
  if (p.noMove) return [name, 'no sure exercises yet'];
  if (p.total === 0) return [name, 'no room for it yet'];
  if (p.id === 'posture') return [name, `${sets(p.total)} of back and rear shoulder work ${period}`];
  if (p.extra > 0) return [`Extra ${name.toLowerCase()} work`, `${sets(p.total)} ${period}`];
  return [name, `${sets(p.total)} ${period}, nothing extra`];
}
