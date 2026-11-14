// How overlapping picks share sets (PLAN 3.6f round 3, critic 5). The one place this is decided. Pure.
// A physical set is charged to the budget once (focusCurate.ts) and is shown as its own number once:
//   - A muscle pick (Back, Lats, Biceps) always shows the sets that train that muscle.
//   - A goal that rides on other muscles' work (Posture: back and rear shoulders; Grip: forearms)
//     shows its own number only for sets no muscle pick in the list already shows. When every set of
//     it is shown under such picks, its row says so in words ("Covered by your back work: 20 sets")
//     and carries no number or extra of its own.
import type { FocusPickId } from '../intake/options';
import type { FocusMove } from './focus';

/** Goals that have no muscle of their own: they ride on the work of others. */
export const RIDERS: ReadonlySet<FocusPickId> = new Set<FocusPickId>(['posture', 'grip']);

export type FocusShare = { coveredBy: FocusPickId[]; shared: number };

/**
 * For the rider `id` among `ranked` (the picks in rank order): how many of its hard sets are also
 * shown under a muscle pick of the list, and which picks those are (rank order). Null for a muscle
 * pick, or when nothing is shared.
 */
export function focusShare(id: FocusPickId, ranked: readonly FocusPickId[], days: readonly (readonly FocusMove[])[]): FocusShare | null {
  if (!RIDERS.has(id)) return null;
  const owners = ranked.filter((p) => p !== id && p !== 'mobility' && !RIDERS.has(p));
  const moves = days.flat().filter((m) => m.hard && m.picks.includes(id) && owners.some((o) => m.picks.includes(o)));
  const shared = moves.reduce((n, m) => n + m.sets, 0);
  if (!shared) return null;
  return { coveredBy: owners.filter((o) => moves.some((m) => m.picks.includes(o))), shared };
}
