// PLAN 3.6f: what Today and the finish screen say about the schedule, in plain words. Every fact
// (muscles, times, days) comes from lib/plan/schedule.ts; this file only words it. Pure.
import { muscleWord, type Muscle } from '../order';
import { whenWords, wordList } from '../quickWhy';
import { startOfDay, DAY_MS } from '../coach/time';
import { cap } from '../words';
import { plural } from '../words';
import type { ResolvedDay, RestDay } from './schedule';

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "later today", "tomorrow morning", "Monday afternoon": when a rested day is ready, never a clock time. */
export function readyWords(at: number, now: number): string {
  const days = Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
  const hour = new Date(at).getHours();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  if (days <= 0) return hour < 12 ? 'later this morning' : `this ${part}`;
  return `${days === 1 ? 'tomorrow' : WEEKDAY[new Date(at).getDay()]} ${part}`;
}

/**
 * The recovery card's two lines: "Chest and shoulders trained yesterday." and "Ready tomorrow
 * morning." Null unless every day left is resting.
 */
export function restingWords(r: Pick<ResolvedDay, 'resting' | 'eligibleAt'> | null | undefined, now: number): { trained: string; ready: string } | null {
  if (!r?.resting?.muscles.length || r.eligibleAt === undefined) return null;
  const words = [...new Set(r.resting.muscles.map((m) => muscleWord(m as Muscle) ?? m))];
  return { trained: `${cap(wordList(words, 3))} trained ${whenWords(r.resting.trainedAt, now)}.`, ready: `Ready ${readyWords(r.eligibleAt, now)}.` };
}

/**
 * A day that is not one of the person's days, said calmly: "Rest day today. Next: Wednesday, Day 1."
 * ("tomorrow" when it is). Start stays on the card: this never blocks training.
 */
export function restDayWords(rest: RestDay | null | undefined, dayN: number, now: number): string | null {
  if (!rest) return null;
  if (rest.nextAt === undefined) return `Rest day today. Day ${dayN} is up next.`;
  const days = Math.round((startOfDay(rest.nextAt) - startOfDay(now)) / DAY_MS);
  return `Rest day today. Next: ${days === 1 ? 'tomorrow' : WEEKDAY[new Date(rest.nextAt).getDay()]}, Day ${dayN}.`;
}

/** Under "Which days this week?": the plan's number of days, and what was picked against it. */
export function weekPickWords(planDays: number, picked: number): string {
  const plan = `Your plan has ${plural(planDays, 'day', 'days')}.`;
  if (picked === 0) return `${plan} Pick ${planDays === 1 ? 'it' : `up to ${planDays}`}.`;
  if (picked === planDays) return `${plan} You picked ${picked === 1 ? 'it' : `all ${picked}`}.`;
  if (picked < planDays) return `${plan} You picked ${picked}: the rest wait for next week.`;
  return `${plan} You picked ${picked}: the plan starts over after Day ${planDays}.`;
}
