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

/** The recovery card with nothing known about the muscles: rest is part of the plan. */
export const RECOVER = { title: 'Time to recover', line: 'Rest today, and your next workout keeps its place.' };

/**
 * The recovery card's words: "Chest and shoulders trained yesterday." and "Ready tomorrow morning.",
 * under "Time to recover" with "Rest today, …". After a workout today (truth pass, critic r3 15)
 * nobody is told to rest: the card says the day is done and when the next one is ready. Null unless
 * every day left is resting.
 */
export function restingWords(r: Pick<ResolvedDay, 'resting' | 'eligibleAt' | 'trainedToday'> | null | undefined, now: number): { trained: string; ready: string; title: string; line: string } | null {
  if (!r?.resting?.muscles.length || r.eligibleAt === undefined) return null;
  const words = [...new Set(r.resting.muscles.map((m) => muscleWord(m as Muscle) ?? m))];
  const trained = `${cap(wordList(words, 3))} trained ${whenWords(r.resting.trainedAt, now)}.`;
  return { trained, ready: `Ready ${readyWords(r.eligibleAt, now)}.`, title: r.trainedToday ? 'Done for today' : RECOVER.title, line: r.trainedToday ? `${trained} Your next workout keeps its place.` : `${trained} ${RECOVER.line}` };
}

/**
 * A day that is not one of the person's days: the day card's headline, in two parts that wrap
 * between them: "Rest day" and "Next: Wed, Day 1" ("Next: tomorrow, Day 1" when it is). A training
 * day whose workout is finished (PLAN 3.6g2) reads "Done for today" with the next training day, and
 * its button says "Train again today". Start stays on the card as a second choice: this never
 * blocks training.
 */
export function restDayWords(rest: RestDay | null | undefined, dayN: number, now: number): { title: string; next: string; start?: string } | null {
  if (!rest) return null;
  const said = rest.done ? { title: 'Done for today', start: 'Train again today' } : { title: 'Rest day' };
  if (rest.nextAt === undefined) return { ...said, next: `Day ${dayN} is next` };
  const days = Math.round((startOfDay(rest.nextAt) - startOfDay(now)) / DAY_MS);
  return { ...said, next: `Next: ${days === 1 ? 'tomorrow' : WEEKDAY[new Date(rest.nextAt).getDay()]!.slice(0, 3)}, Day ${dayN}` };
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
