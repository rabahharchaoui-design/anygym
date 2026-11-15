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
export type FocusHeld = 'maxed' | 'budget' | 'rank' | 'room';
export type FocusResult = {
  id: FocusPickId; requested: number;
  /** Hard sets above what the same answers get with no picks. Never clamped: the real difference. */
  extra: number;
  /** Every hard set that trains it, each counted once. */
  total: number;
  shortfall: boolean; reason?: string;
  /** Mobility: the stretch minutes in one turn of the plan, and (truth pass) the most in any one session. */
  minutes?: number; session?: number;
  /** Absent only in reports saved before round 2 (focusStateOf reads those). */
  state?: FocusState;
  /** An area of several muscles: each muscle's own count, the measure the 20 set limit uses. */
  parts?: Array<{ muscle: string; sets: number }>;
  /** At the 20 set limit (from PLAN 3.6g2 also when it got its share on the way there). */
  atLimit?: true;
  noMove?: true;
  /** PLAN 3.6g: with `noMove`, the app has exercises for it and this gym has the equipment for none of them: said as that, never as "no exercises yet". */
  gear?: true;
  /** PLAN 3.6g: the sets it is still short of FOCUS_MUSCLE_MIN a week (for an area: its muscle with the fewest that has an exercise). Absent when it is there, has plenty or has no exercise. */
  under?: number;
  /**
   * A goal that rides on other muscles' work (posture, grip), when picks for those muscles are in the
   * list too (lib/plan/focusShare.ts): `shared` of its sets are the very sets shown under `coveredBy`.
   */
  coveredBy?: FocusPickId[];
  shared?: number;
  /** PLAN 3.6g2: of `extra`, the sets that came with the work of picks ranked higher (`on`). They were given to those picks, so the rank compares the rest. */
  rides?: { extra: number; on: FocusPickId[] };
  /**
   * PLAN 3.6g2: why a pick that is not at the limit got no more, read from the finished plan. Never a
   * guess: `maxed` every exercise for it is at its most sets and no day can take another one, whatever
   * the time (such a pick does not hold back the picks below); `budget` the 12 extra sets a week are
   * used; `rank` it has as much as `heldBy`, a pick ranked above it that could not take more;
   * `room` its days are full, also after the trades. Absent at FOCUS_MUSCLE_GOOD sets or more.
   */
  held?: FocusHeld;
  heldBy?: FocusPickId;
};
/** What one day adds for a choice, against the same day with no picks. Mobility: its stretch minutes. */
export type FocusDayExtra = { id: FocusPickId; extra: number; minutes?: number };
export type FocusReport = {
  budget: number; spent: number; priorities: FocusResult[]; days: string[][]; dayExtra?: FocusDayExtra[][];
  /** Per day: the pick its first lift trains (the highest ranked), or null. Focused moves go first while fresh. */
  dayLead?: Array<FocusPickId | null>;
};
/** The most hard sets a week a focused muscle gets (PLAN 3.6f): more is not better. */
export const FOCUS_MUSCLE_MAX = 20;
/** A focused muscle is meant to land at about this many hard sets a week or more (PLAN 3.6f: about 12 to 20). */
export const FOCUS_MUSCLE_MIN = 12;
/** PLAN 3.6g2: 12 is the floor, not the ceiling. While the weekly budget has sets left, a pick climbs on toward this many; only from here on is it never short of an answer for getting no more. */
export const FOCUS_MUSCLE_GOOD = 16;
/** A single pick with 75 minutes climbs a little further. */
export const FOCUS_MUSCLE_GOOD_LONG = 18;
/**
 * The least stretch time in one session that counts as a stretch block (truth pass, critic r3 3): a
 * minute at the end of a workout is not what a Mobility pick asked for, so under this the plan says
 * plainly that the sessions have no room for one, and the day cards say nothing about it.
 */
export const STRETCH_BLOCK_MIN = 5;
/** True when a Mobility pick really got a stretch block. A report saved before the truth pass has no `session`: its stretches were a minute a day. */
export const stretchBlock = (p: Pick<FocusResult, 'session'>): boolean => (p.session ?? 0) >= STRETCH_BLOCK_MIN;
/** The most extra sets any one pick is given (PLAN 3.6f: +4 at the most). */
export const FOCUS_SHARE_MAX = 4;
export const countHardSets = (days: readonly (readonly FocusMove[])[], muscle: string): number => days.flat().reduce((n, m) => n + (m.hard && m.muscles.includes(muscle) ? m.sets : 0), 0);

/** The state of a result; a report saved before round 2 has none, so it is read from its old marks. */
export function focusStateOf(p: FocusResult): FocusState {
  // Mobility is read from its minutes, whatever was saved: a plan saved with a minute a day is not "delivered".
  if (p.id === 'mobility') return stretchBlock(p) ? 'extra' : 'short';
  if (p.state) return p.state;
  if (p.noMove) return 'no_move';
  if (p.requested === 0) return 'no_share';
  if (p.atLimit) return 'plenty';
  return p.extra >= Math.max(1, p.requested - 1) ? 'extra' : 'short';
}

/** The picks whose share did not fit (the reveal says so, and offers a day or minutes only when that really fits them). */
export const focusUnplaced = (report: FocusReport | undefined): FocusResult[] => (report?.priorities ?? []).filter((p) => focusStateOf(p) === 'short');

export { curateFocus } from './focusCurate';
