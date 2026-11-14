// A rotation is a queue, not a calendar. All clocks are explicit; no I/O.
import type { IntakeAnswers } from '../intake/answers';
import type { ScheduleStyle, WeekdayId } from '../intake/options';
import { weekKey } from '../coach/time';
import { TIRED_MS } from '../quickWhy';

export type WeeklySchedule = { weekKey: string; weekdays: WeekdayId[]; answeredAt: number };
export const scheduleStyleOf = (a?: Pick<IntakeAnswers, 'scheduleStyle' | 'weekdays'>, fallback?: ScheduleStyle): ScheduleStyle => a?.scheduleStyle ?? (a?.weekdays?.length ? 'fixed' : fallback ?? 'flexible');
export const remindersEligible = (a?: IntakeAnswers): boolean => scheduleStyleOf(a) === 'fixed';
export const needsWeeklySchedule = (a: IntakeAnswers | undefined, saved: WeeklySchedule | undefined, now: number): boolean => scheduleStyleOf(a) === 'weekly' && saved?.weekKey !== weekKey(now);

/** Monday first, as the week is shown and saved. */
const WEEK: readonly WeekdayId[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const todayAt = (now: number): number => (new Date(now).getDay() + 6) % 7;

/** The days that can still be picked in the week of `now`: today and the days after it. Past days never. */
export const weekdaysLeft = (now: number): WeekdayId[] => WEEK.slice(todayAt(now));

/**
 * "Which days this week?" opens by itself once in a new week. Not straight after the intake when the
 * week is nearly over (fewer days left than the plan has): the row on Today still opens it, and next
 * Monday it asks.
 */
export function asksWeeklySchedule(input: { answers: IntakeAnswers | undefined; saved: WeeklySchedule | undefined; now: number; intakeDoneAt?: number; planDays: number }): boolean {
  if (!needsWeeklySchedule(input.answers, input.saved, input.now)) return false;
  const fresh = input.intakeDoneAt !== undefined && weekKey(input.intakeDoneAt) === weekKey(input.now);
  return !(fresh && weekdaysLeft(input.now).length < input.planDays);
}

/**
 * The days to save for this week: what was picked from today on, plus days already past that were
 * saved before (they happened; they are never added or removed afterwards). Monday first.
 */
export function weekChoice(picked: readonly WeekdayId[], saved: WeeklySchedule | undefined, now: number): WeekdayId[] {
  const left = weekdaysLeft(now);
  const before = saved?.weekKey === weekKey(now) ? saved.weekdays.filter((d) => !left.includes(d)) : [];
  return WEEK.filter((d) => before.includes(d) || (left.includes(d) && picked.includes(d)));
}

/** A calendar day that is not one of the person's days: when the next one is (absent: not known yet). */
export type RestDay = { nextAt?: number };

/**
 * On a calendar (same days each week, or days picked for this week): null on a training day or with
 * no days to go by; else a rest day, with the start of the next training day when it is known (a week
 * to week schedule only knows this week). Start stays possible: this informs, it never blocks.
 */
export function restDayOf(style: ScheduleStyle, weekdays: readonly string[] | undefined, now: number): RestDay | null {
  if (style === 'flexible' || !weekdays?.length) return null;
  const at = todayAt(now);
  if (weekdays.includes(WEEK[at]!)) return null;
  const last = style === 'weekly' ? 6 - at : 6;
  for (let n = 1; n <= last; n++) {
    if (!weekdays.includes(WEEK[(at + n) % 7]!)) continue;
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + n);
    return { nextAt: d.getTime() };
  }
  return {};
}

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
  /** The day shown is the same day again, kept by the 60% rule after a part done finish (lib/finishPlan.ts keptDayOf). */
  kept?: true;
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
