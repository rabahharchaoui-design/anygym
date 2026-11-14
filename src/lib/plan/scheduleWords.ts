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
 * A day that is not one of the person's days: the day card's headline, in two parts that wrap
 * between them: "Rest day" and "Next: Wed, Day 1" ("Next: tomorrow, Day 1" when it is). Start stays
 * on the card as a second choice: this never blocks training.
 */
export function restDayWords(rest: RestDay | null | undefined, dayN: number, now: number): { title: string; next: string } | null {
  if (!rest) return null;
  if (rest.nextAt === undefined) return { title: 'Rest day', next: `Day ${dayN} is next` };
  const days = Math.round((startOfDay(rest.nextAt) - startOfDay(now)) / DAY_MS);
  return { title: 'Rest day', next: `Next: ${days === 1 ? 'tomorrow' : WEEKDAY[new Date(rest.nextAt).getDay()]!.slice(0, 3)}, Day ${dayN}` };
}

/**
 * The one sentence for a day kept up next by the 60% rule (Today's coach line). Start opens that day
 * as a new workout with nothing logged, so it says "from the top", never "where you left off". The
 * counts are the part done workout's own (the finish screen's numbers); without them, no number.
 */
export function keptDayWords(k: { dayN: number; logged?: number; planned?: number }): string {
  const did = k.logged && k.planned ? `You did ${k.logged} of ${k.planned} sets last time` : 'You stopped it early last time';
  return `Day ${k.dayN} again. ${did}, so it stays up next and starts from the top.`;
}

/** Under "Which days this week?": the plan's number of days, and what was picked against it. */
export function weekPickWords(planDays: number, picked: number): string {
  const plan = `Your plan has ${plural(planDays, 'day', 'days')}.`;
  if (picked === 0) return `${plan} Pick ${planDays === 1 ? 'it' : `up to ${planDays}`}.`;
  if (picked === planDays) return `${plan} You picked ${picked === 1 ? 'it' : `all ${picked}`}.`;
  if (picked < planDays) return `${plan} You picked ${picked}: the rest wait for next week.`;
  return `${plan} You picked ${picked}: the plan starts over after Day ${planDays}.`;
}
