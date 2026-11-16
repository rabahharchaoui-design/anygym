// PLAN 3.6f and 3.6g: gives the extra focus sets, in the person's own order. Pure: no database, catalog or screen.
import { FOCUS_MUSCLE_GOOD, FOCUS_MUSCLE_MIN, LIMIT_MUSCLES, STRETCH_BLOCK_MIN, countHardSets, type FocusDayExtra, type FocusMove, type FocusReport, type FocusResult, type FocusHeld, type FocusState } from './focus';
import type { FocusPickId } from '../intake/options';
import { countPick, makeBoard, type Board, type CurateInput } from './focusBoard';
import { handOut } from './focusHand';
import { focusShare } from './focusShare';

/**
 * Receives the days as they are with no picks, and eligible, prescribed candidates. Each tentative
 * edit uses the caller's single duration estimate and stays inside the minutes the person chose
 * (lib/plan/focusBoard.ts holds the rules, lib/plan/focusServe.ts one pick's turn). Compound lifts,
 * loved moves and the minimum day size are protected. A new move only joins a day that already
 * trains its muscles, or whose neighbours in the rotation do not (the 48 hour rule: focus never
 * makes two days in a row hit the same muscle).
 *
 * THE STRICT RANK (PLAN 3.6g2). Picks are served in rank order (lib/plan/focusHand.ts), and a pick
 * never gets more extra sets of its own than a pick ranked above it that can still take sets: no
 * exception for room. A higher pick with no room gets it made on its own days first (work no pick
 * asks for gives its place or its sets, inside a muscle at the limit the other work for that
 * muscle does); when that cannot be, the picks below get no more than it got, and each says why.
 * Only a pick that can take nothing whatever the time does not hold back the ones below: no
 * exercise for it, at the 20 set limit, or every exercise for it at its most sets.
 *
 * In this order: every pick's share; then what is left of the weekly budget of 12 brings the picks
 * still under FOCUS_MUSCLE_MIN sets toward it, and from 60 minutes a session on toward
 * FOCUS_MUSCLE_GOOD; then (`fill`) a day still short of the minutes chosen is built up with work
 * no pick asks for.
 */
export function curateFocus(input: CurateInput): { days: FocusMove[][]; report: FocusReport } {
  let b = makeBoard(input);
  /** The pick ranked first that can take sets is under +3 and under FOCUS_MUSCLE_GOOD sets: the #1 promise is not met. */
  const topShort = (x: Board) => { const t = x.hardIds.find(x.open); return t !== undefined && x.gained(t) < 3 && countPick(x.days, t) < FOCUS_MUSCLE_GOOD ? t : undefined; };
  handOut(b, false);
  // PLAN 3.6g2: the #1 pick always gets at least +3 when that can be. Sharing the room first left it
  // under: the plan is handed out again with its +3 before anything else, and kept when that gives it more.
  const top = topShort(b);
  if (top) { const again = makeBoard(input); handOut(again, true); if (again.gained(top) > b.gained(top)) b = again; }
  const { days, baseline, budget, state, gained, hasMove } = b;
  const spentNow = b.spent;
  /** The extra sets of a pick that came with the work of picks ranked higher, and which picks those are. */
  const ridesOf = (id: FocusPickId, extra: number) => {
    const n = extra - b.own(id), higher = b.hardIds.slice(0, b.hardIds.indexOf(id));
    const on = higher.filter((q) => days.flat().some((m) => m.hard && m.picks.includes(id) && m.picks.includes(q)));
    return n > 0 && on.length ? { rides: { extra: n, on } } : {};
  };
  /** Why a pick that can hold more got no more (FocusResult.held), read from the plan as it now stands. */
  const heldOf = (id: FocusPickId): { held?: FocusHeld; heldBy?: FocusPickId } => {
    if (!hasMove(id) || b.full(id)) return {};
    if (b.closed(id)) return { held: 'maxed' };
    // The pick ranked first had the whole plan for its +3 and could not place it: its days are full.
    if (id === topShort(b)) return { held: 'room' };
    // Past the weekly budget it was given no share.
    if (b.shareOf(id) === 0 && gained(id) === 0) return { held: 'budget' };
    // It has its share and is at the sets a week these sessions aim for: nothing was held back.
    if (gained(id) >= b.shareOf(id) && b.need(id) === 0) return {};
    // The budget only ever stops a pick that has its share (the shares are the budget's first call).
    if (gained(id) >= b.shareOf(id) && b.spent() >= state.pool) return { held: 'budget' };
    const by = b.hardIds.slice(0, b.hardIds.indexOf(id)).filter(b.open).find((h) => gained(h) <= gained(id));
    return by ? { held: 'rank', heldBy: by } : { held: 'room' };
  };
  const priorities = budget.targets.map(({ id, sets: requested }): FocusResult => {
    if (id === 'mobility') {
      const perDay = days.map((d) => d.filter((m) => !m.hard && m.picks.includes(id)).reduce((n, m) => n + (m.seconds ?? 0) * m.sets / 60, 0));
      const minutes = perDay.reduce((n, x) => n + x, 0), session = Math.max(0, ...perDay);
      // The minutes are the real ones; under STRETCH_BLOCK_MIN in a session they are not presented as a stretch block.
      return { id, requested: 0, extra: 0, total: 0, minutes, session, shortfall: session < STRETCH_BLOCK_MIN, state: session < STRETCH_BLOCK_MIN ? 'short' : 'extra' };
    }
    const total = countPick(days, id);
    const extra = gained(id);
    // At the limit with less than its share, or with none at all: it has plenty (said before "no share": nothing is missing).
    const limit = (extra < requested || extra === 0) && b.full(id);
    const state: FocusState = !hasMove(id) ? 'no_move' : limit ? 'plenty' : requested === 0 && extra === 0 ? 'no_share' : extra >= Math.max(1, requested - 1) ? 'extra' : 'short';
    const muscles = id === 'posture' ? [] : LIMIT_MUSCLES[id] ?? [];
    const parts = muscles.map((muscle) => ({ muscle, sets: countHardSets(days, muscle) })).filter((x) => x.sets > 0);
    const share = focusShare(id, budget.targets.map((t) => t.id), days);
    return { id, requested, extra, total, shortfall: state === 'short', state, ...(share ?? {}), ...(muscles.length > 1 && parts.length ? { parts } : {}), ...(b.full(id) && state !== 'no_move' ? { atLimit: true as const } : {}), ...ridesOf(id, extra), ...heldOf(id), ...((state === 'extra' || state === 'short') && b.need(id, FOCUS_MUSCLE_MIN) > 0 ? { under: b.need(id, FOCUS_MUSCLE_MIN) } : {}), ...(state === 'no_move' ? { noMove: true as const } : {}) };
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
