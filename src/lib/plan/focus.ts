// A shared, bounded priority budget. No database, catalog or screen dependencies.
import { FOCUS_PARTS, FOCUS_PICKS, type FocusPickId } from '../intake/options';
import type { Muscle } from '../order';

export function normalizeFocusPicks(picks: readonly string[] = []): FocusPickId[] {
  const valid = new Set<string>(FOCUS_PICKS.map((p) => p.id));
  const unique = [...new Set(picks)].filter((p): p is FocusPickId => valid.has(p));
  if (unique.includes('balance')) return ['balance'];
  return unique.filter((p) => !Object.entries(FOCUS_PARTS).some(([parent, parts]) => parent !== p && unique.includes(parent as FocusPickId) && parts.some((part) => part.id === p)));
}

/** One shared muscle mapping for ordering, Quick and Up next. */
const MUSCLES: Partial<Record<FocusPickId, readonly Muscle[]>> = {
  chest: ['chest'], upper_chest: ['chest'], back: ['back'], lats: ['back'], upper_back: ['back'], lower_back: ['lower back'],
  shoulders: ['front delts', 'side delts', 'rear delts'], front_delts: ['front delts'], side_delts: ['side delts'], rear_delts: ['rear delts'],
  arms: ['biceps', 'triceps', 'forearms'], biceps: ['biceps'], triceps: ['triceps'], forearms: ['forearms'], grip: ['forearms'],
  core: ['abs'], abs: ['abs'], glutes: ['glutes'], legs: ['quads', 'hamstrings', 'calves'], quads: ['quads'], hamstrings: ['hamstrings'], calves: ['calves'],
  posture: ['back', 'rear delts'],
};
export const focusMuscles = (picks: readonly string[] = []): Muscle[] => [...new Set(normalizeFocusPicks(picks).flatMap((p) => MUSCLES[p] ?? []))];
/**
 * The muscles the 20 set limit counts for each choice, in the same words the moves carry. One muscle:
 * the plan shows that count. Several (an area): the plan shows each muscle's own count, so every
 * number shown is the number the limit is about.
 */
export const LIMIT_MUSCLES: Partial<Record<FocusPickId, readonly string[]>> = {
  ...MUSCLES, back: ['back', 'lower back'], core: ['abs', 'obliques'], obliques: ['obliques'],
};
/** The short name a sentence uses ("Lats", never "Lats and width": no stacked "and"s in a list). */
const SHORT: Partial<Record<FocusPickId, string>> = { lats: 'Lats', upper_back: 'Upper back', side_delts: 'Side shoulders', core: 'Core' };
export const focusName = (id: FocusPickId): string => SHORT[id] ?? focusLabel(id);
export const focusLabel = (id: FocusPickId): string => FOCUS_PICKS.find((p) => p.id === id)?.label ?? id;

/**
 * The weekly budget of extra hard sets (PLAN 3.6f). 1 or 2 picks: 4 each. 3 or 4: 3 each. 5 or more,
 * in the person's own order: the top two get 3, the rest share what is left of 12 (2 first, then 1;
 * past the eighth nothing is left, and the plan says so). Mobility is stretch time, never hard sets,
 * so it takes no share.
 */
export const FOCUS_BUDGET_MAX = 12;
export function focusBudget(picks: readonly string[]): { total: number; targets: Array<{ id: FocusPickId; sets: number }> } {
  const ids = normalizeFocusPicks(picks).filter((p) => p !== 'balance');
  const hard = ids.filter((p) => p !== 'mobility');
  const sets: number[] = hard.map((_, i) => (hard.length <= 2 ? 4 : hard.length <= 4 || i < 2 ? 3 : 0));
  let left = FOCUS_BUDGET_MAX - sets.reduce((n, x) => n + x, 0);
  if (hard.length > 4) for (let pass = 0; pass < 2; pass++) for (let i = 2; i < hard.length && left > 0; i++) { sets[i]!++; left--; }
  return { total: sets.reduce((n, x) => n + x, 0), targets: ids.map((id) => ({ id, sets: id === 'mobility' ? 0 : sets[hard.indexOf(id)]! })) };
}

/** Each physical set is charged once, even when it trains two requested areas. */
export type FocusMove = {
  seconds?: number;
  id: string; key: string; sets: number; hard: boolean; compound: boolean;
  muscles: readonly string[]; picks: readonly FocusPickId[];
  /** An exercise the person loves: never swapped out for a focus move. */
  keep?: boolean;
  /** The muscles the 48 hour rule tracks for this move (the scheduler's own words). Defaults to `muscles`. */
  recovery?: readonly string[];
};
/**
 * What happened to one choice:
 *   extra     it got its share of extra sets (one short of the share still counts: the budget is "about");
 *   plenty    one of its muscles is at the weekly limit: more would not help, so nothing is missing;
 *   short     less than its share fit in these days and minutes;
 *   no_move   the app has no exercise it is sure of for it: more days or minutes cannot help;
 *   no_share  past the weekly budget, it was given no share.
 */
export type FocusState = 'extra' | 'plenty' | 'short' | 'no_move' | 'no_share';
export type FocusResult = {
  id: FocusPickId; requested: number;
  /** Hard sets above what the same answers get with no picks. Never clamped: the real difference. */
  extra: number;
  /** Every hard set that trains it, each counted once. */
  total: number;
  shortfall: boolean; reason?: string; minutes?: number;
  /** Absent only in reports saved before round 2 (focusStateOf reads those). */
  state?: FocusState;
  /** An area of several muscles: each muscle's own count, the measure the 20 set limit uses. */
  parts?: Array<{ muscle: string; sets: number }>;
  atLimit?: true;
  noMove?: true;
};
/** What one day adds for a choice, against the same day with no picks. Mobility: its stretch minutes. */
export type FocusDayExtra = { id: FocusPickId; extra: number; minutes?: number };
export type FocusReport = { budget: number; spent: number; priorities: FocusResult[]; days: string[][]; dayExtra?: FocusDayExtra[][] };
/** The most hard sets a week a focused muscle gets (PLAN 3.6f): more is not better. */
export const FOCUS_MUSCLE_MAX = 20;
export const countHardSets = (days: readonly (readonly FocusMove[])[], muscle: string): number => days.flat().reduce((n, m) => n + (m.hard && m.muscles.includes(muscle) ? m.sets : 0), 0);

/** The state of a result; a report saved before round 2 has none, so it is read from its old marks. */
export function focusStateOf(p: FocusResult): FocusState {
  if (p.state) return p.state;
  if (p.id === 'mobility') return p.shortfall ? 'short' : 'extra';
  if (p.noMove) return 'no_move';
  if (p.requested === 0) return 'no_share';
  if (p.atLimit) return 'plenty';
  return p.extra >= Math.max(1, p.requested - 1) ? 'extra' : 'short';
}

/** The picks whose share did not fit (the reveal says so, and offers a day or minutes only when that really fits them). */
export const focusUnplaced = (report: FocusReport | undefined): FocusResult[] => (report?.priorities ?? []).filter((p) => focusStateOf(p) === 'short');

export { curateFocus } from './focusCurate';
