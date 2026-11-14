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
export type ResolvedDay = {
  dayIndex: number | null; pendingDayIndices: number[]; deferred: number[]; eligibleAt?: number;
  /** Every day rests: the one "Train anyway" offers, the most rested day left (never the day just trained while another waits). */
  anywayIndex?: number;
  /** Every day rests: the muscles holding that day back, and when they were last trained. */
  resting?: { muscles: string[]; trainedAt: number };
};

/**
 * The one next day rule (finish screen, Today and Start all read this). `trained` holds only work
 * that counted (lib/plan/recovery.ts). Blocked days move later in stable order and stay in the same
 * cycle. Exactly 48 h is eligible. A day the person chose themselves is never moved: the rule
 * suggests, the person decides. A day kept up next (under 60% done) is judged without its own part
 * done workout (`kept.trained`), so that workout never moves it away. When every pending day is
 * blocked there is no suggestion (dayIndex null): `eligibleAt` says when the first one is rested and
 * `anywayIndex` is that day; `pendingDayIndices[0]` is still the next day in order.
 */
export function resolveNextDay(input: {
  state: RotationPosition; days: readonly (readonly string[])[];
  trained: Readonly<Record<string, number | undefined>>; now: number;
  kept?: { dayIndex: number; trained: Readonly<Record<string, number | undefined>> };
}): ResolvedDay {
  const pending = rotationOf(input.state, input.days.length);
  const chosen = input.state.chosenDayIndex;
  if (chosen !== undefined && pending.includes(chosen)) return { dayIndex: chosen, pendingDayIndices: [chosen, ...pending.filter((i) => i !== chosen)], deferred: [] };
  const lastOf = (i: number, m: string) => {
    const at = (input.kept?.dayIndex === i ? input.kept.trained : input.trained)[m];
    return at !== undefined && at <= input.now && at + TIRED_MS > input.now ? at : undefined;
  };
  const readyAt = (i: number) => Math.max(input.now, ...input.days[i]!.map((m) => (lastOf(i, m) ?? input.now - TIRED_MS) + TIRED_MS));
  const at = pending.findIndex((i) => readyAt(i) <= input.now);
  if (at === -1) {
    if (!pending.length) return { dayIndex: null, pendingDayIndices: pending, deferred: pending };
    const eligibleAt = Math.min(...pending.map(readyAt));
    const anywayIndex = pending.find((i) => readyAt(i) === eligibleAt)!;
    const muscles = input.days[anywayIndex]!.filter((m) => lastOf(anywayIndex, m) !== undefined);
    return { dayIndex: null, pendingDayIndices: pending, deferred: pending, eligibleAt, anywayIndex, resting: { muscles, trainedAt: Math.max(...muscles.map((m) => lastOf(anywayIndex, m)!)) } };
  }
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
