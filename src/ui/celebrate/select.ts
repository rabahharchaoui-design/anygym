// The tier rules (PLAN 3.6b), pure and fully tested: which moment gets the whole screen, which
// become cards, and what stays a chip. No React, no storage, no clock.
//   - While active (a set in progress, a run under way) nothing interrupts: every moment is SMALL.
//   - On the summary screen at most ONE moment is BIG: the biggest of those rare enough to ask for
//     it. Every other moment is MEDIUM, the ones that lost the full screen first.
//   - A BIG already shown for this summary (a reload, Finish → Undo → Finish) is never shown again:
//     it leads the MEDIUM cards instead, so the screen reads the same.
//   - Reduced motion changes how a tier moves (stagingFor), never which words it says.
import type { Moment, MomentKind, Place, Selection, Staging } from './types';

/** Rarest first: between kinds this order decides; within a kind the larger weight does. */
export const KIND_ORDER: readonly MomentKind[] = ['first_workout', 'level_up', 'city_stamp', 'run_record', 'lift_record', 'badge', 'xp'];

const kindRank = (m: Moment): number => KIND_ORDER.indexOf(m.kind);

/** `a` is strictly bigger than `b`, past floating noise (equal gains stay a tie). */
const heavier = (a: number, b: number): boolean => (a === Number.POSITIVE_INFINITY ? b !== a : a - b > 1e-9);

/** Biggest first: the rarer kind, then the larger weight; a tie keeps the order they happened in. */
export function rankMoments(moments: readonly Moment[]): Moment[] {
  return moments
    .map((m, i) => ({ m, i }))
    .sort((a, b) => kindRank(a.m) - kindRank(b.m) || (heavier(b.m.weight, a.m.weight) ? 1 : heavier(a.m.weight, b.m.weight) ? -1 : a.i - b.i))
    .map((x) => x.m);
}

/** One moment per id (the first one given wins). */
const distinct = (moments: readonly Moment[]): Moment[] => moments.filter((m, i) => moments.findIndex((x) => x.id === m.id) === i);

/**
 * Sorts moments into tiers for one place. `bigSpent`: this summary already had its full screen
 * moment (or cannot show one), so nothing is BIG.
 */
export function selectCelebrations(candidates: readonly Moment[], place: Place, opts: { bigSpent?: boolean } = {}): Selection {
  const all = distinct(candidates);
  if (place === 'active') return { big: null, medium: [], small: all };
  const rare = rankMoments(all.filter((m) => m.big));
  const rest = rankMoments(all.filter((m) => !m.big));
  const big = opts.bigSpent ? null : (rare[0] ?? null);
  return { big, medium: [...rare.filter((m) => m !== big), ...rest], small: [] };
}

/** The tier a moment got in a selection, or null when it is not in it. */
export function tierOf(selection: Selection, id: string): 'big' | 'medium' | 'small' | null {
  if (selection.big?.id === id) return 'big';
  if (selection.medium.some((m) => m.id === id)) return 'medium';
  return selection.small.some((m) => m.id === id) ? 'small' : null;
}

/** How the tiers move: everything on, or (reduced motion) a calm fade with the same words. */
export function stagingFor(reduce: boolean | null | undefined): Staging {
  return reduce ? { particles: false, countUp: false, travel: false } : { particles: true, countUp: true, travel: true };
}
