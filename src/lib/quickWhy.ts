// Quick workout's why lines (PLAN 3.5b, 3.5d, 3.5g): what a card says about the muscles it trains and
// when they were last trained, from logged sets only. Pure. Moved out of quick.ts (code organization).
import { type Muscle, muscleWord } from './order';
import type { QuickDeps, QuickInput, QuickItem } from './quick';
import { cap } from './words';


/** "quads, chest and back": the first `max` words, then "and more". */
export function wordList(words: readonly string[], max = 3): string {
  const w = [...new Set(words)];
  if (w.length <= 1) return w[0] ?? '';
  if (w.length > max) return `${w.slice(0, max).join(', ')} and more`;
  return `${w.slice(0, -1).join(', ')} and ${w[w.length - 1]}`;
}

export const targetsOf = (deps: QuickDeps, id: string): readonly Muscle[] => deps.profile(id).targets;

export const DAY_MS = 86_400_000;
export const localDay = (t: number) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
/** Whole local days between a logged workout and now. */
export const daysSince = (at: number, now: number): number => Math.max(0, Math.round((localDay(now) - localDay(at)) / DAY_MS));

/**
 * The two muscle words a card is named for, from the exercises it really holds (3.5f round 3, B4: the
 * subtitle and the mini map both come from the items, and the first card is what the name promises).
 * The first exercise's main muscle leads; the other is the word with the most sets after it, each
 * exercise counted once under its main muscle (its first target), ties going to the earlier move.
 * `muscles`: every target muscle of the cards that falls under the named words.
 */
export function mainWords(items: readonly QuickItem[], deps: QuickDeps): { muscles: Muscle[]; words: string[] } {
  const sets = new Map<string, number>();
  const order: string[] = [];
  for (const it of items) {
    const m = targetsOf(deps, it.id)[0];
    if (!m) continue;
    const w = muscleWord(m);
    if (!order.includes(w)) order.push(w);
    sets.set(w, (sets.get(w) ?? 0) + it.sets);
  }
  const [lead, ...rest] = order;
  const words = lead ? [lead, ...rest.sort((a, b) => sets.get(b)! - sets.get(a)! || order.indexOf(a) - order.indexOf(b)).slice(0, 1)] : [];
  const muscles = [...new Set(items.flatMap((it) => targetsOf(deps, it.id)))].filter((m) => words.includes(muscleWord(m)));
  return { muscles, words };
}

/**
 * "Back and biceps rested 4 days" (3.5b round 2, tester bug 3): of the muscles the card really
 * trains, the two with the longest logged rest are named, and the number is the shorter rest of
 * those two. Only muscles with a logged date count; none (or under `least` days): null.
 */
export function restedLine(items: readonly QuickItem[], deps: QuickDeps, lastTrained: QuickInput['lastTrained'], now: number, least = 2): string | null {
  if (!lastTrained) return null;
  const byWord = new Map<string, number>();
  for (const it of items)
    for (const m of targetsOf(deps, it.id)) {
      const at = lastTrained[m];
      if (at === undefined || at > now) continue;
      const days = daysSince(at, now);
      const w = muscleWord(m);
      // A word covering two muscles (side and front delts: shoulders) is as rested as its least rested one.
      byWord.set(w, Math.min(byWord.get(w) ?? Infinity, days));
    }
  const named = [...byWord.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (!named.length) return null;
  const days = Math.min(...named.map(([, d]) => d));
  if (days < least) return null;
  return `${cap(wordList(named.map(([w]) => w)))} rested ${days} ${days === 1 ? 'day' : 'days'}`;
}

/**
 * PLAN 3.5g: a style card's why line, written from the muscles it trains most (mainWords), each with
 * its own rest days from logged sets: "Back rested 5 days, legs rested 4 days", "Back rested 5 days,
 * triceps trained yesterday". A muscle with no logged date is never named; none: null (the blurb).
 */
export function muscleRestLine(items: readonly QuickItem[], deps: QuickDeps, lastTrained: QuickInput['lastTrained'], now: number): string | null {
  if (!lastTrained) return null;
  const { muscles, words } = mainWords(items, deps);
  const parts: string[] = [];
  for (const w of words) {
    const ats = muscles.filter((m) => muscleWord(m) === w).map((m) => lastTrained[m]).filter((at): at is number => at !== undefined && at <= now);
    if (!ats.length) continue;
    // A word covering two muscles (side and front delts: shoulders) is as rested as its least rested one.
    const days = daysSince(Math.max(...ats), now);
    parts.push(days >= 2 ? `${w} rested ${days} days` : `${w} trained ${days === 1 ? 'yesterday' : 'today'}`);
  }
  return parts.length ? cap(parts.join(', ')) : null;
}

/** 3.5d (9): the muscles trained in the last 48 h (logged working sets only) stay out of the style cards. */
export const TIRED_MS = 48 * 60 * 60 * 1000;
export function trainedWithin(lastTrained: QuickInput['lastTrained'], now: number, ms: number): Muscle[] {
  return (Object.entries(lastTrained ?? {}) as Array<[Muscle, number]>).filter(([, at]) => at <= now && now - at < ms).map(([m]) => m);
}

/** "Leaves out chest and triceps (trained yesterday)": what the 48 h rule kept out of a card. */
export function leavesOut(tired: readonly Muscle[], input: Pick<QuickInput, 'lastTrained' | 'now'>): string {
  const now = input.now ?? Date.now();
  const at = (m: Muscle) => input.lastTrained?.[m] ?? 0;
  const words = [...new Set([...tired].sort((a, b) => at(b) - at(a)).map(muscleWord))].slice(0, 2);
  return `Leaves out ${wordList(words, 2)} (trained ${whenWords(at(tired.reduce((a, b) => (at(b) > at(a) ? b : a))), now)})`;
}

/** "today", "yesterday", "2 days ago": when the last of those workouts was (local days). */
export function whenWords(at: number, now: number): string {
  const day = (t: number) => {
    const d = new Date(t);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const n = Math.round((day(now) - day(at)) / 86_400_000);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}
