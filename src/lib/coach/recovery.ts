// Recovery (SPEC 15): when to stop pushing. A lighter week (deload) after 5 straight training
// weeks (so the 6th is lighter), or when most lifts missed reps two workouts in a row, felt Hard all
// week, or lost reps sharply set to set. A "Welcome back" week after 7+ days off. A plateau on one
// lift changes only that lift. Every lighter weight comes from load.ts (about 90%, loadable here).
import { comparableWeight, scaledWeight, weightChange } from '../load';
import { liftClass, weighted } from './classify';
import { allTop, changeWords, lastPicked, missedCount, sameWeight, sharpDrop, weightWords } from './sets';
import { sessionEstimate, spread } from './strength';
import { DAY_MS, daysBetween, lastWeek, weekKey, weekStart, weekStartFrom } from './time';
import type { ChangeRecord, Lift, PlannedChange } from './types';

/** Straight training weeks before a lighter one (SPEC 15: every 5th to 6th week). */
export const DELOAD_AFTER_WEEKS = 5;
/** A lighter week or a welcome back this recent: no new lighter week yet. */
export const DELOAD_QUIET_DAYS = 28;
/** Days off before "Welcome back" (SPEC 15). */
export const WELCOME_BACK_DAYS = 7;
/** About this much of the weight in a lighter week (SPEC 15: about 10% lighter, about 90%). */
export const LIGHTER = 0.9;

/**
 * Training weeks in a row, ending with last week: each with at least one workout, counted back
 * until a week without one or the week a lighter week (or welcome back) started.
 */
export function trainingStreak(dates: readonly number[], now: number, since?: number): number {
  let n = 0;
  for (let w = 1; w < 60; w++) {
    const start = weekStartFrom(now, -w);
    const end = weekStartFrom(now, -w + 1);
    if (since !== undefined && end <= weekStart(since)) break;
    if (!dates.some((d) => d >= start && d < end)) break;
    n++;
  }
  return n;
}

const lighterChanges = (changes: readonly ChangeRecord[]) => changes.filter((c) => (c.source === 'deload' || c.source === 'welcome_back') && c.undoneAt === undefined);

/** The most recent lighter week or welcome back the user took, or undefined. */
export function lastLighter(changes: readonly ChangeRecord[]): number | undefined {
  const at = lighterChanges(changes).map((c) => c.appliedAt);
  return at.length ? Math.max(...at) : undefined;
}

/** Lifts the coach can lighten here, trained in the last `days`. */
const current = (lifts: readonly Lift[], now: number, days: number) =>
  lifts.filter((l) => l.setup && weighted(l.loadKind) && liftClass(l.pattern) && l.sessions[0] && l.sessions[0].date >= now - days * DAY_MS);

/** More than half, and at least two. */
const most = (n: number, of: number) => n >= 2 && n * 2 > of;

export type DeloadSignal = { why: 'weeks' | 'missed' | 'hard' | 'drop'; text: string };

/** Whether this week should be a lighter one, and why (null: keep going). */
export function deloadSignal(lifts: readonly Lift[], dates: readonly number[], changes: readonly ChangeRecord[], now: number): DeloadSignal | null {
  const since = lastLighter(changes);
  if (since !== undefined && now - since < DELOAD_QUIET_DAYS * DAY_MS) return null;
  const streak = trainingStreak(dates, now, since);
  if (streak >= DELOAD_AFTER_WEEKS) return { why: 'weeks', text: `${streak} strong weeks in a row. A lighter week now keeps you progressing.` };
  const recent = current(lifts, now, 21);
  const twice = recent.filter((l) => l.sessions.length >= 2 && missedCount(l.sessions[0]!.sets, l.sessions[0]!.range) > 0 && missedCount(l.sessions[1]!.sets, l.sessions[1]!.range) > 0);
  if (most(twice.length, recent.length)) return { why: 'missed', text: 'Most lifts missed reps two workouts in a row. A lighter week helps you bounce back.' };
  const week = lastWeek(now);
  const ofWeek = recent.map((l) => l.sessions.filter((s) => s.date >= week.start && s.date < week.end)).filter((s) => s.length > 0);
  const tapped = ofWeek.filter((s) => s[0]!.effort !== undefined);
  const hard = tapped.filter((s) => s[0]!.effort === 'hard');
  if (most(hard.length, tapped.length)) return { why: 'hard', text: 'Most lifts felt hard last week. A lighter week helps you recover.' };
  const drops = ofWeek.filter((s) => s.some(sharpDrop));
  if (most(drops.length, ofWeek.length)) return { why: 'drop', text: 'Your reps dropped fast set to set on most lifts last week. A lighter week helps you recover.' };
  return null;
}

export const deloadCardId = (now: number): string => `deload:${weekKey(now)}`;

/** About 10% lighter on each lift trained in the last two weeks, one set fewer, for this week. */
export function deloadChanges(lifts: readonly Lift[], now: number): PlannedChange[] {
  const until = weekStartFrom(now, 1);
  return lighter(current(lifts, now, 14), 'deload', until, (words) => `${words} this week: a lighter week so you come back stronger`, true);
}

/** Whole days since the last workout, or null with none. */
export function daysOff(dates: readonly number[], now: number): number | null {
  if (!dates.length) return null;
  return daysBetween(Math.max(...dates), now);
}

export const welcomeCardId = (last: number): string => `welcome:${weekKey(last)}:${new Date(last).getDate()}`;

/** About 90% on each lift done in the 8 weeks before the break, for the 7 days from now. */
export function welcomeChanges(lifts: readonly Lift[], dates: readonly number[], now: number): PlannedChange[] {
  const last = dates.length ? Math.max(...dates) : now;
  const before = lifts.filter((l) => l.setup && weighted(l.loadKind) && liftClass(l.pattern) && l.sessions[0] && l.sessions[0].date >= last - 56 * DAY_MS);
  return lighter(before, 'welcome_back', now + 7 * DAY_MS, (words) => `${words} this week: welcome back, easing in`, false);
}

function lighter(lifts: readonly Lift[], source: 'deload' | 'welcome_back', until: number, line: (words: string) => string, fewerSets: boolean): PlannedChange[] {
  const out: PlannedChange[] = [];
  for (const l of lifts) {
    const at = lastPicked(l.sessions[0]);
    if (!at || !l.setup || at.unit !== l.setup.unit) continue;
    const used = comparableWeight(at.load, at.unit);
    const to = scaledWeight(l.loadKind, at.value, LIGHTER, l.setup, true, at.load.added ?? 0);
    if (to === null || to >= used) continue;
    const words = changeWords(l.loadKind, weightChange(used, to), at.unit);
    out.push({ key: l.key, exerciseId: l.exerciseId, name: l.name, loadKind: l.loadKind, unit: at.unit, from: at.value, fromTotal: used, to, reason: line(words), source, until, reps: 'low', ...(fewerSets ? { fewerSets: true } : {}) });
  }
  return out;
}

// ---------------------------------------------------------------- plateau (per lift)

/** e1RM change under this share over 3 workouts is "flat" (SPEC 15: under 1%). */
export const FLAT = 0.01;

export type Plateau = {
  key: string;
  cardId: string;
  name: string;
  /** Why, in weights and reps (never the internal estimate). */
  text: string;
  /** The one suggestion (one tap): a lighter week on this lift, or a close variation. */
  action: { kind: 'lighter'; change: PlannedChange } | { kind: 'variation'; id: string; name: string; slot: string; planId: string };
};

/** Whether one lift is stuck: flat for 3 workouts, or Hard twice in a row at the same weight. */
export function plateauOf(lift: Lift, now: number): Plateau | null {
  const setup = lift.setup;
  if (!setup || !weighted(lift.loadKind) || !liftClass(lift.pattern)) return null;
  const [a, b, c] = lift.sessions;
  if (!a || !b) return null;
  // Only a lift trained lately.
  if (a.date < now - 21 * DAY_MS) return null;
  const pa = lastPicked(a);
  const pb = lastPicked(b);
  if (!pa || !pb || pa.unit !== setup.unit) return null;
  const same = pa.unit === pb.unit && Math.abs(weightChange(pa.value, pb.value)) < 0.01;
  // Hard twice in a row at the same weight is a plateau even at the top of the range (Codex 3.8 #4:
  // level up holds a Hard lift, so this is its action). Otherwise a lift at the top is earning a raise.
  const hardTwice = a.effort === 'hard' && b.effort === 'hard' && same;
  if (!hardTwice && a.range && sameWeight(a.sets) && allTop(a.sets, a.range)) return null;
  let flat = false;
  if (c) {
    const est = [a, b, c].map((s) => sessionEstimate(s, setup.unit));
    flat = est.every((e): e is number => e !== null) && spread(est as number[]) < FLAT;
  }
  if (!hardTwice && !flat) return null;
  const at = weightWords(lift.loadKind, pa.value, pa.unit);
  const text = hardTwice ? `${lift.name} felt hard twice in a row at ${at}.` : `${lift.name} has been stuck around ${at} for 3 workouts.`;
  const cardId = `plateau:${lift.key}:${a.sessionId}`;
  const base = { key: lift.key, cardId, name: lift.name, text };
  if (!hardTwice && lift.variation) return { ...base, action: { kind: 'variation', ...lift.variation } };
  const used = comparableWeight(pa.load, pa.unit);
  const to = scaledWeight(lift.loadKind, pa.value, LIGHTER, setup, true, pa.load.added ?? 0);
  if (to === null || to >= used) return null;
  const words = changeWords(lift.loadKind, weightChange(used, to), pa.unit);
  return {
    ...base,
    action: {
      kind: 'lighter',
      change: { key: lift.key, exerciseId: lift.exerciseId, name: lift.name, loadKind: lift.loadKind, unit: pa.unit, from: pa.value, fromTotal: used, to, reason: `${words} next time: a step back to build up past it`, source: 'plateau', reps: 'high' },
    },
  };
}
