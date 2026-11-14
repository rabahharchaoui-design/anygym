// PLAN 3.6f: what Today and the finish screen say about the schedule, in plain words. Every fact
// (muscles, times, days) comes from lib/plan/schedule.ts; this file only words it. Pure.
import { muscleWord, type Muscle } from '../order';
import { whenWords, wordList } from '../quickWhy';
import { startOfDay, DAY_MS } from '../coach/time';
import { cap } from '../words';
import type { ResolvedDay } from './schedule';

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
