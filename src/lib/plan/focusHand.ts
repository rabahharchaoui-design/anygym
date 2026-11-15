// PLAN 3.6f, 3.6g, 3.6g2: the order in which the extra focus sets are handed out. Pure.
import { FOCUS_BUDGET_MAX, FOCUS_MUSCLE_GOOD, FOCUS_MUSCLE_GOOD_LONG, FOCUS_SHARE_MAX } from './focus';
import type { FocusPickId } from '../intake/options';
import type { Board } from './focusBoard';
import { fill, serve, stretch, stretchMore } from './focusServe';

/** From this many minutes a session the picks climb past the floor of 12 toward FOCUS_MUSCLE_GOOD. */
const CLIMB_MINUTES = 60;

/**
 * Hands out the extra sets on the board, then the stretch block's second call and the fill.
 * `topFirst`: the pick ranked first takes its +3 before anything else is given (the caller asks for
 * this when sharing the room first left it under +3).
 */
export function handOut(b: Board, topFirst: boolean): void {
  const { input, budget, state, gained } = b;
  // In rank order, and from the top again after every gain: a pick only takes room once every pick
  // above it has had its call on the plan as it stands now.
  const tried = new Map<FocusPickId, { edits: number; want: number; floor: boolean }>();
  const round = (goal: (id: FocusPickId, share: number) => number, floor = false) => {
    for (let guard = 0; guard < 120; guard++) {
      const before = state.edits;
      for (const { id, sets } of budget.targets) {
        if (id === 'mobility') continue;
        // A turn that found nothing is not tried again until the plan changes or the pick may ask for more (from 2 sets on, asking for more opens nothing new).
        const want = goal(id, sets) - gained(id), last = tried.get(id);
        if (want <= 0 || (last && last.edits === state.edits && last.floor === floor && (last.want === want || (last.want >= 2 && want >= 2)))) continue;
        serve(b, id, goal(id, sets), floor);
        if (state.edits > before) break;
        tried.set(id, { edits: state.edits, want, floor });
      }
      if (state.edits === before) break;
    }
  };
  // Mobility is stretch time and is not ranked: its block takes free time only, before the sets do
  // (sets can still trade for their room on a full day; a stretch block cannot).
  if (budget.targets.some((t) => t.id === 'mobility')) stretch(b);
  // PLAN 3.6g2, the strict rank. Every pick to +2 before any pick goes past it, then to its whole
  // share: with little room, three picks get some rather than the first one all (`topFirst`: after
  // the pick ranked first has its +3). Always from the top, and no pick is ever
  // served past the picks ranked above it that can still take sets (the board's `above`; its
  // `accepts` holds the same for every edit). A pick held back gets its room made on its own days
  // first (lib/plan/focusServe.ts); when that cannot be, the picks below get no more than it got.
  const top = b.hardIds.find(b.open);
  // Its +3 whatever its share: when the picks ranked above it have no exercise, it is the first pick in all but name.
  if (topFirst) round((id) => (id === top ? 3 : 0));
  const shareGoal = (id: FocusPickId, share: number, level = FOCUS_SHARE_MAX) => Math.min(share, level, b.above(id));
  for (const level of [2, 3, FOCUS_SHARE_MAX]) round((id, share) => shareGoal(id, share, level));
  // What is left of the weekly budget (shares nobody could use, and the rest of FOCUS_BUDGET_MAX) is
  // offered again from the top to the picks still under FOCUS_MUSCLE_MIN sets a week: toward that
  // floor, one more set for each at a time. A pick ranked above one that still needs sets goes up
  // with it, one set ahead at the most (`carried`): the lower pick is never held under the floor by
  // a pick that has enough, and the higher one stops where the lower one cannot follow.
  const carried = (id: FocusPickId) => Math.max(gained(id) + b.need(id), ...b.hardIds.slice(b.hardIds.indexOf(id) + 1).filter((q) => b.open(q) && b.need(q) > 0).map((q) => gained(q) + 1));
  state.pool = FOCUS_BUDGET_MAX;
  const climb = () => { for (let level = 1; level <= FOCUS_BUDGET_MAX && b.spent() < state.pool && b.hardIds.some((id) => b.need(id) > 0); level++) round((id, share) => Math.max(shareGoal(id, share), Math.min(b.above(id), carried(id), level)), true); };
  climb();
  // PLAN 3.6g2: 12 is the floor, not the ceiling. With 60 minutes or more, what is still left of the
  // budget goes on the same way toward FOCUS_MUSCLE_GOOD sets (a single pick with 75 minutes: a
  // little further). Shorter sessions stop at the floor: more would push out too much other work.
  if ((input.budgetMinutes ?? Infinity) >= CLIMB_MINUTES) {
    state.aim = b.hardIds.length === 1 && (input.budgetMinutes ?? 0) >= 75 ? FOCUS_MUSCLE_GOOD_LONG : FOCUS_MUSCLE_GOOD;
    climb();
  }
  // PLAN 3.6g2, more buys more: a single pick never ends with fewer sets than with a day or minutes fewer.
  if (b.hardIds.length === 1 && (input.least?.sets ?? 0) > state.aim) { state.aim = input.least!.sets!; climb(); }
  // Mobility again, after the ranked picks had their call: on a day still without its block, work no pick asks for makes the room.
  if (budget.targets.some((t) => t.id === 'mobility')) { stretch(b, true); stretchMore(b, input.least?.stretch ?? 0); }
  if (input.fill) fill(b);
}
