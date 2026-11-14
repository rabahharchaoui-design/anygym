// PLAN 3.6f: gives the extra focus sets, in the person's own order. Pure: no database, catalog or screen.
import { FOCUS_BUDGET_MAX, FOCUS_MUSCLE_MAX, FOCUS_MUSCLE_MIN, FOCUS_SHARE_MAX, LIMIT_MUSCLES, STRETCH_BLOCK_MIN, countHardSets, focusBudget, type FocusDayExtra, type FocusMove, type FocusReport, type FocusResult, type FocusState } from './focus';
import type { FocusPickId } from '../intake/options';
import { focusShare } from './focusShare';

/** Picks that are a part of a wider muscle: the muscle can be at the limit while the part is not. */
const NARROW = new Set<FocusPickId>(['upper_chest', 'lats', 'upper_back', 'posture']);
const countPick = (days: readonly (readonly FocusMove[])[], id: FocusPickId): number => days.flat().reduce((n, m) => n + (m.hard && m.picks.includes(id) ? m.sets : 0), 0);

/**
 * Receives the days as they are with no picks, and eligible, prescribed candidates. Replacement,
 * then set growth, then a small move at the end. Each tentative edit uses the caller's single
 * duration estimate and stays inside the minutes the person chose: a day shorter than the choice
 * has room, and that room is used before any pick is told there is none. Compound lifts, loved
 * moves and the minimum day size are protected. A new move only joins a day that already trains its
 * muscles, or whose neighbours in the rotation do not (the 48 hour rule: focus never makes two days
 * in a row hit the same muscle).
 *
 * RANK DECIDES COMPETITION (round 3). Picks are served in rank order, each with first call on all
 * the room that is left, and again in rank order until nothing more fits. So a pick only ever uses
 * room that every pick above it could not use. A higher pick that is held back for a reason of its
 * own (a muscle of it is at the 20 set limit, the app has no exercise for it, its muscles rest on
 * the only free days, its moves are at the set ceiling) never holds back the picks below it.
 */
export function curateFocus(input: {
  picks: readonly string[]; days: FocusMove[][]; candidates: FocusMove[][]; cap: number;
  minutes: (day: FocusMove[], index: number) => number; budgetMinutes?: number;
  /** The most moves a day may hold after focus adds to it (default 8). */
  maxMoves?: number;
  /** The shares to hand out (default: focusBudget of the picks). */
  shares?: ReturnType<typeof focusBudget>;
}): { days: FocusMove[][]; report: FocusReport } {
  const days = input.days.map((d) => d.map((m) => ({ ...m })));
  const budget = input.shares ?? focusBudget(input.picks);
  const maxMoves = input.maxMoves ?? 8;
  const wanted = (m: FocusMove) => m.picks.some((p) => budget.targets.some((t) => t.id === p));
  const baseline = days.map((d) => d.map((m) => ({ ...m })));
  /** Accepted edits, to see whether a turn changed anything. */
  let edits = 0;
  /** The extra sets that may be handed out in all: the shares first, the whole weekly budget in the last round. */
  let pool = budget.total;
  const focusedSets = (ds: readonly (readonly FocusMove[])[]) => ds.flat().reduce((n, m) => n + (m.hard && wanted(m) ? m.sets : 0), 0);
  /** The budget spent: the focused hard sets above the same days with no picks, each physical set once. Sets that only make up for ones the 20 set limit took away cost nothing. */
  const spentNow = () => Math.max(0, focusedSets(days) - focusedSets(baseline));
  const limits = days.map((d, i) => Math.max(input.minutes(d, i), input.budgetMinutes ?? Infinity));
  const focusedMuscles = new Set([...days.flat(), ...input.candidates.flat()].filter(wanted).flatMap((m) => m.muscles));
  const overLimit = () => [...focusedMuscles].filter((m) => countHardSets(days, m) > FOCUS_MUSCLE_MAX);
  // Posture is shown as one count of back and rear shoulder work, so that count keeps to the limit too.
  const postureOver = () => budget.targets.some((t) => t.id === 'posture') && countPick(days, 'posture') > FOCUS_MUSCLE_MAX;
  // A plan already past the limit comes down to it one set at a time: from the move with the most
  // sets (small moves before big lifts, later in the rotation first), and no move under 2 sets while another can give.
  for (let guard = 0; guard < 400; guard++) {
    const over = new Set(overLimit());
    const posture = postureOver();
    if (!over.size && !posture) break;
    const hits = days.flat().filter((m) => m.hard && (m.muscles.some((s) => over.has(s)) || (posture && m.picks.includes('posture'))));
    const pool = hits.filter((m) => m.sets > (hits.some((x) => x.sets > 2) ? 2 : 1));
    const most = Math.max(...pool.map((m) => m.sets));
    const move = pool.findLast((m) => m.sets === most && !m.compound) ?? pool.findLast((m) => m.sets === most);
    if (!move) break;
    move.sets--;
  }
  /** Sets above the same plan with no picks: the one meaning of "extra". */
  const gained = (id: FocusPickId) => Math.max(0, countPick(days, id) - countPick(baseline, id));
  const accepts = (i: number, change: () => void, undo: () => void): boolean => {
    change();
    if (overLimit().length || postureOver() || input.minutes(days[i]!, i) > limits[i]!) { undo(); return false; }
    edits++;
    return true;
  };
  const tires = (m: FocusMove) => (m.hard ? m.recovery ?? m.muscles : []);
  const trains = (i: number, muscle: string) => days[i]!.some((m) => tires(m).includes(muscle));
  const neighbours = (i: number) => [...new Set([(i + days.length - 1) % days.length, (i + 1) % days.length])].filter((j) => j !== i);
  const rested = (i: number, c: FocusMove) => tires(c).every((m) => trains(i, m) || !neighbours(i).some((j) => trains(j, m)));
  const fresh = (i: number, id: FocusPickId, big = false) => input.candidates[i]?.find((m) => m.hard && m.compound === big && m.picks.includes(id) && !days[i]!.some((x) => x.key === m.key) && rested(i, m));
  /** The accessories a day can spare, best first: those whose muscles other moves that day also train, then the rest; last in the day first. */
  const spares = (day: FocusMove[]): number[] => {
    const doubled = (m: FocusMove) => m.muscles.every((s) => day.some((x) => x !== m && x.hard && x.muscles.includes(s)));
    const free = day.map((_, at) => at).filter((at) => day[at]!.hard && !day[at]!.compound && !day[at]!.keep && !wanted(day[at]!)).reverse();
    return [...free.filter((at) => doubled(day[at]!)), ...free.filter((at) => !doubled(day[at]!))];
  };
  /**
   * The moves of a day that can give a set, first to give first: an accessory no pick asks for (down
   * to 2 sets), then a big lift no pick asks for: never the day's first, heaviest lift; the second
   * only from 4 sets; a later one down to 2 (the trim's own floors, lib/generator/trim.ts).
   */
  const donors = (day: FocusMove[]): FocusMove[] => {
    const big = day.filter((x) => x.hard && x.compound);
    const gives = (x: FocusMove) => x.hard && !x.keep && !wanted(x) && (x.compound ? x !== big[0] && x.sets >= (x === big[1] ? 4 : 3) : x.sets > 2);
    return day.filter(gives).sort((a, b) => Number(a.compound) - Number(b.compound));
  };
  const hasMove = (id: FocusPickId) => [...days.flat(), ...input.candidates.flat()].some((m) => m.hard && m.picks.includes(id));
  const atLimit = (id: FocusPickId) => (LIMIT_MUSCLES[id] ?? []).some((m) => countHardSets(days, m) >= FOCUS_MUSCLE_MAX) || (id === 'posture' && countPick(days, id) >= FOCUS_MUSCLE_MAX);
  const hardIds = budget.targets.filter((t) => t.id !== 'mobility').map((t) => t.id);
  /** It cannot take more: no exercise for it, or a muscle of it is at the limit (what the report calls "plenty"). */
  const full = (id: FocusPickId) => !hasMove(id) || atLimit(id) || countPick(days, id) >= FOCUS_MUSCLE_MAX;
  /**
   * What the picks ranked above have: sets past a pick's own share never lift it above one of them.
   * A higher pick that cannot take more does not count; in the last round (`floor`) neither does one
   * already at FOCUS_MUSCLE_MIN sets a week, which that round does not add to.
   */
  const above = (id: FocusPickId, floor = false) => Math.min(Infinity, ...hardIds.slice(0, hardIds.indexOf(id)).filter((h) => !full(h) && !(floor && countPick(days, h) >= FOCUS_MUSCLE_MIN)).map(gained));
  const mobility = () => {
    for (const [i, day] of days.entries()) {
      if (day.some((m) => m.picks.includes('mobility'))) continue;
      const c = input.candidates[i]?.find((m) => !m.hard && m.picks.includes('mobility'));
      if (c) accepts(i, () => day.push({ ...c }), () => { day.pop(); });
      if (days.flat().filter((m) => m.picks.includes('mobility')).length >= 2) break;
    }
  };
  /** One pick's turn: everything it can take of its share from the room that is left now. */
  const serve = (id: FocusPickId, requested: number) => {
    // A muscle of it is already at the limit: it has plenty and takes no extra.
    // (A part of a muscle, like upper chest, can still take another move's place inside that muscle.)
    if (NARROW.has(id) ? countPick(days, id) >= FOCUS_MUSCLE_MAX : atLimit(id)) return;
    // Work already added for another choice counts here too, without a second charge.
    const room = () => Math.min(requested - gained(id), pool - spentNow());
    // A new move is 2 sets at least, so a pick one set short of its share may take a 2 set move ("about" its share): never past FOCUS_SHARE_MAX, never above a pick ranked higher.
    const reach = () => (room() === 1 && gained(id) + 2 <= Math.min(FOCUS_SHARE_MAX, above(id)) && pool - spentNow() >= 2 ? 2 : room());
    // Substitute a low priority accessory. Never sacrifice another ranked choice, a loved move or a big lift.
    // An option only big lifts train (upper back: rows; front shoulders: presses) takes one of those in its place.
    for (const [i, day] of days.entries()) {
      if (reach() < 2) break;
      const candidate = fresh(i, id) ?? fresh(i, id, true);
      if (!candidate) continue;
      for (const at of spares(day)) {
        const old = day[at]!;
        const next = { ...candidate, sets: Math.min(old.sets, input.cap, reach()) };
        if (next.sets < 2) continue;
        if (accepts(i, () => { day[at] = next; }, () => { day[at] = old; })) break;
      }
    }
    // Add one working set around the rotation, accessories before compounds, respecting experience.
    for (let guard = 0; room() > 0 && guard < 4; guard++) {
      let grew = false;
      for (const compound of [false, true]) for (const [i, day] of days.entries()) for (const m of day) {
        if (room() <= 0) break;
        if (!m.hard || m.compound !== compound || !m.picks.includes(id) || m.sets >= input.cap) continue;
        if (accepts(i, () => m.sets++, () => m.sets--)) grew = true;
      }
      if (!grew) break;
    }
    // Only then a short accessory finisher, within the shared budget and the minutes chosen: as many
    // sets as fit (down to 2), on the days with the most time left first. On a day with no time left,
    // up to two sets from moves no pick asks for make the room for it.
    const slack = (i: number) => limits[i]! - input.minutes(days[i]!, i);
    for (const i of days.map((_, k) => k).sort((a, b) => slack(b) - slack(a) || a - b)) {
      const day = days[i]!;
      if (reach() < 2 || day.length >= maxMoves) continue;
      const c = fresh(i, id);
      if (!c) continue;
      const add = (n: number) => accepts(i, () => day.push({ ...c, sets: n }), () => { day.pop(); });
      let placed = 0;
      for (let n = Math.min(reach(), input.cap); n >= 2 && !placed; n--) if (add(n)) placed = n;
      const gave: FocusMove[] = [];
      for (const donor of placed ? [] : donors(day).slice(0, 2)) {
        donor.sets--; gave.push(donor);
        if (add(2)) { placed = 2; break; }
      }
      if (!placed) for (const d of gave) d.sets++;
    }
    // Last, when a day has no time left: one set moves to a focused move from a move no pick asks for.
    for (const compound of [false, true]) for (const [i, day] of days.entries()) for (const m of day) {
      if (!m.hard || m.compound !== compound || !m.picks.includes(id)) continue;
      for (const donor of donors(day)) {
        if (room() <= 0 || m.sets >= input.cap) break;
        accepts(i, () => { donor.sets--; m.sets++; }, () => { donor.sets++; m.sets--; });
      }
    }
  };
  // In rank order, and from the top again after every gain: a pick only takes room once every pick
  // above it has had its call on the plan as it stands now.
  let stretched = false;
  const round = (goal: (id: FocusPickId, share: number) => number) => {
    for (let guard = 0; guard < 80; guard++) {
      const before = edits;
      for (const { id, sets } of budget.targets) {
        if (id === 'mobility') { if (!stretched) mobility(); stretched = true; continue; }
        serve(id, goal(id, sets));
        if (edits > before) break;
      }
      if (edits === before) break;
    }
  };
  round((_, share) => share);
  // What is left of the weekly budget (shares nobody could use, and the rest of FOCUS_BUDGET_MAX) is
  // offered again from the top to the picks still under FOCUS_MUSCLE_MIN sets a week: toward that
  // floor, never past FOCUS_SHARE_MAX. Like every set past a pick's own share, it never lifts a pick
  // above a pick ranked higher (unless that one has plenty or no exercise).
  pool = FOCUS_BUDGET_MAX;
  round((id, share) => Math.max(share, Math.min(FOCUS_SHARE_MAX, above(id, true), gained(id) + FOCUS_MUSCLE_MIN - countPick(days, id))));
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
    return { id, requested, extra, total, shortfall: state === 'short', state, ...(share ?? {}), ...(muscles.length > 1 && parts.length ? { parts } : {}), ...(state === 'plenty' ? { atLimit: true as const } : {}), ...(state === 'no_move' ? { noMove: true as const } : {}) };
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
