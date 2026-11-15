// PLAN 3.6f and 3.6g: gives the extra focus sets, in the person's own order. Pure: no database, catalog or screen.
import { FOCUS_BUDGET_MAX, FOCUS_SHARE_MAX, LIMIT_MUSCLES, STRETCH_BLOCK_MIN, countHardSets, type FocusDayExtra, type FocusMove, type FocusReport, type FocusResult, type FocusState } from './focus';
import type { FocusPickId } from '../intake/options';
import { countPick, makeBoard, type CurateInput } from './focusBoard';
import { fill, serve, stretch } from './focusServe';
import { focusShare } from './focusShare';

/**
 * Receives the days as they are with no picks, and eligible, prescribed candidates. Each tentative
 * edit uses the caller's single duration estimate and stays inside the minutes the person chose
 * (lib/plan/focusBoard.ts holds the rules, lib/plan/focusServe.ts one pick's turn). Compound lifts,
 * loved moves and the minimum day size are protected. A new move only joins a day that already
 * trains its muscles, or whose neighbours in the rotation do not (the 48 hour rule: focus never
 * makes two days in a row hit the same muscle).
 *
 * RANK DECIDES COMPETITION (round 3). Picks are served in rank order, each with first call on all
 * the room that is left, and again in rank order until nothing more fits. So a pick only ever uses
 * room that every pick above it could not use. A higher pick that is held back for a reason of its
 * own (a muscle of it is at the 20 set limit, the app has no exercise for it, its muscles rest on
 * the only free days, its moves are at the set ceiling) never holds back the picks below it.
 *
 * PLAN 3.6g, in this order: every pick's share; then what is left of the weekly budget brings the
 * picks still under FOCUS_MUSCLE_MIN sets toward it; then (`fill`) a day still short of the minutes
 * chosen is built up with work no pick asks for.
 */
export function curateFocus(input: CurateInput): { days: FocusMove[][]; report: FocusReport } {
  const b = makeBoard(input);
  const { days, baseline, budget, state, gained, hasMove, atLimit } = b;
  const spentNow = b.spent;
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
  // Every pick to +2 before any pick goes past it, then to its whole share: with little room, three
  // picks get some rather than the first one all (PLAN 3.6g). Always from the top. The first pass is
  // the rank promise as it was: each pick with first call on all the room. A pick that could not
  // get to +2 there is held back for a reason of its own; past +2, a pick never goes above a pick
  // ranked higher that was not (the room it would use may be the room that one still needs).
  round((_, share) => Math.min(share, 2));
  for (const id of b.hardIds) if (!b.full(id) && gained(id) < Math.min(b.shareOf(id), 2)) b.stuck.add(id);
  const shareGoal = (id: FocusPickId, share: number, level = FOCUS_SHARE_MAX) => Math.max(Math.min(share, 2), Math.min(share, level, b.aboveShare(id)));
  round((id, share) => shareGoal(id, share, 3));
  round((id, share) => shareGoal(id, share));
  // What is left of the weekly budget (shares nobody could use, and the rest of FOCUS_BUDGET_MAX) is
  // offered again from the top to the picks still under FOCUS_MUSCLE_MIN sets a week: toward that
  // floor, one more set for each at a time. Like every set past a pick's own share, it never lifts a
  // pick above a pick ranked higher that could still use it.
  state.pool = FOCUS_BUDGET_MAX;
  for (let level = 1; level <= FOCUS_BUDGET_MAX && b.spent() < state.pool && b.hardIds.some((id) => b.need(id) > 0); level++) round((id, share) => Math.max(shareGoal(id, share), Math.min(b.above(id, true), gained(id) + b.need(id), level)), true);
  // Mobility again, after the ranked picks had their call: on a day still without its block, work no pick asks for makes the room.
  if (budget.targets.some((t) => t.id === 'mobility')) stretch(b, true);
  if (input.fill) fill(b);
  const priorities = budget.targets.map(({ id, sets: requested }): FocusResult => {
    if (id === 'mobility') {
      const perDay = days.map((d) => d.filter((m) => !m.hard && m.picks.includes(id)).reduce((n, m) => n + (m.seconds ?? 0) * m.sets / 60, 0));
      const minutes = perDay.reduce((n, x) => n + x, 0), session = Math.max(0, ...perDay);
      // The minutes are the real ones; under STRETCH_BLOCK_MIN in a session they are not presented as a stretch block.
      return { id, requested: 0, extra: 0, total: 0, minutes, session, shortfall: session < STRETCH_BLOCK_MIN, state: session < STRETCH_BLOCK_MIN ? 'short' : 'extra' };
    }
    const total = countPick(days, id);
    const extra = gained(id);
    const limit = extra < requested && atLimit(id);
    const state: FocusState = !hasMove(id) ? 'no_move' : requested === 0 && extra === 0 ? 'no_share' : limit ? 'plenty' : extra >= Math.max(1, requested - 1) ? 'extra' : 'short';
    const muscles = id === 'posture' ? [] : LIMIT_MUSCLES[id] ?? [];
    const parts = muscles.map((muscle) => ({ muscle, sets: countHardSets(days, muscle) })).filter((x) => x.sets > 0);
    const share = focusShare(id, budget.targets.map((t) => t.id), days);
    return { id, requested, extra, total, shortfall: state === 'short', state, ...(share ?? {}), ...(muscles.length > 1 && parts.length ? { parts } : {}), ...(state === 'plenty' ? { atLimit: true as const } : {}), ...((state === 'extra' || state === 'short') && b.need(id) > 0 ? { under: b.need(id) } : {}), ...(state === 'no_move' ? { noMove: true as const } : {}) };
  });
  // What each day adds, against the same day with no picks; only for picks that came out ahead.
  const onDay = (day: readonly FocusMove[], id: FocusPickId) => countPick([day], id);
  const dayExtra = days.map((d, i): FocusDayExtra[] => priorities.flatMap((p): FocusDayExtra[] => {
    if (p.id === 'mobility') {
      const minutes = d.filter((m) => !m.hard && m.picks.includes(p.id)).reduce((n, m) => n + (m.seconds ?? 0) * m.sets / 60, 0);
      return minutes > 0 ? [{ id: p.id, extra: 0, minutes }] : [];
    }
    const extra = onDay(d, p.id) - onDay(baseline[i]!, p.id);
    return p.extra > 0 && extra > 0 ? [{ id: p.id, extra }] : [];
  }));
  return { days, report: { budget: Math.max(budget.total, spentNow()), spent: spentNow(), priorities, days: days.map(() => []), dayExtra } };
}
