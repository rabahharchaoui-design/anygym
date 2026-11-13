// A rotation is a queue, not a calendar. All clocks are explicit; no I/O.
import type { IntakeAnswers } from '../intake/answers';
import type { ScheduleStyle, WeekdayId } from '../intake/options';
import { weekKey } from '../coach/time';
import { TIRED_MS } from '../quickWhy';

export type WeeklySchedule = { weekKey: string; weekdays: WeekdayId[]; answeredAt: number };
export const scheduleStyleOf = (a?: Pick<IntakeAnswers, 'scheduleStyle' | 'weekdays'>, fallback?: ScheduleStyle): ScheduleStyle => a?.scheduleStyle ?? (a?.weekdays?.length ? 'fixed' : fallback ?? 'flexible');
export const remindersEligible = (a?: IntakeAnswers): boolean => scheduleStyleOf(a) === 'fixed';
export const needsWeeklySchedule = (a: IntakeAnswers | undefined, saved: WeeklySchedule | undefined, now: number): boolean => scheduleStyleOf(a) === 'weekly' && saved?.weekKey !== weekKey(now);

export type RotationPosition = { nextDayIndex: number; doneDays: number[]; pendingDayIndices?: number[]; chosenDayIndex?: number };
export function rotationOf(state: RotationPosition, count: number): number[] {
  if (state.pendingDayIndices?.length) return state.pendingDayIndices.filter((d, i, all) => Number.isInteger(d) && d >= 0 && d < count && all.indexOf(d) === i);
  const remaining = Array.from({ length: count }, (_, i) => i).filter((i) => !state.doneDays.includes(i));
  const pending = remaining.length ? remaining : Array.from({ length: count }, (_, i) => i);
  const at = pending.indexOf(state.nextDayIndex);
  return at < 0 ? pending : [...pending.slice(at), ...pending.slice(0, at)];
}
export type ResolvedDay = { dayIndex: number | null; pendingDayIndices: number[]; deferred: number[]; eligibleAt?: number };

/**
 * Blocked days move later in stable order and stay in the same cycle. Exactly 48 h is eligible.
 * A day the person chose themselves is never moved: the rule suggests, the person decides.
 * When every pending day is blocked there is no suggestion (dayIndex null) and `eligibleAt` says
 * when the first one is rested; `pendingDayIndices[0]` is still the next day in order.
 */
export function resolveNextDay(input: {
  state: RotationPosition; days: readonly (readonly string[])[];
  trained: Readonly<Record<string, number | undefined>>; now: number;
}): ResolvedDay {
  const pending = rotationOf(input.state, input.days.length);
  const chosen = input.state.chosenDayIndex;
  if (chosen !== undefined && pending.includes(chosen)) return { dayIndex: chosen, pendingDayIndices: [chosen, ...pending.filter((i) => i !== chosen)], deferred: [] };
  const readyAt = (i: number) => Math.max(input.now, ...input.days[i]!.map((m) => {
    const at = input.trained[m];
    return at !== undefined && at <= input.now ? at + TIRED_MS : input.now;
  }));
  const at = pending.findIndex((i) => readyAt(i) <= input.now);
  if (at === -1) return { dayIndex: null, pendingDayIndices: pending, deferred: pending, ...(pending.length ? { eligibleAt: Math.min(...pending.map(readyAt)) } : {}) };
  const deferred = pending.slice(0, at);
  return { dayIndex: pending[at]!, pendingDayIndices: [...pending.slice(at), ...deferred], deferred };
}

/** Complete only after every pending day advances, even if the last numeric day went first. */
export function advanceRotation(state: RotationPosition, count: number, dayIndex: number): { pendingDayIndices: number[]; nextDayIndex: number; wrapped: boolean } {
  const pending = rotationOf(state, count).filter((i) => i !== dayIndex);
  const wrapped = pending.length === 0;
  const next = wrapped ? Array.from({ length: count }, (_, i) => i) : pending;
  return { pendingDayIndices: next, nextDayIndex: next[0] ?? 0, wrapped };
}
