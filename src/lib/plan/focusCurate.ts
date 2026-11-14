// PLAN 3.6f: gives the extra focus sets, in the person's own order. Pure: no database, catalog or screen.
import { FOCUS_MUSCLE_MAX, LIMIT_MUSCLES, countHardSets, focusBudget, type FocusDayExtra, type FocusMove, type FocusReport, type FocusResult, type FocusState } from './focus';
import type { FocusPickId } from '../intake/options';

/** Picks that are a part of a wider muscle: the muscle can be at the limit while the part is not. */
const NARROW = new Set<FocusPickId>(['upper_chest', 'lats', 'upper_back', 'posture']);
const countPick = (days: readonly (readonly FocusMove[])[], id: FocusPickId): number => days.flat().reduce((n, m) => n + (m.hard && m.picks.includes(id) ? m.sets : 0), 0);

/**
 * Receives the days as they are with no picks, and eligible, prescribed candidates. Replacement,
 * then set growth, then a small move at the end. Each tentative edit uses the caller's single
 * duration estimate. Compound lifts, loved moves and the minimum day size are protected. A new move
 * only joins a day that already trains its muscles, or whose neighbours in the rotation do not (the
 * 48 hour rule: focus never makes two days in a row hit the same muscle).
 *
 * RANKING IS A PROMISE. Picks are served in rank order, each with first call on the room that is
 * left, and a pick never gets more extra sets than any pick ranked above it got. The one exception is
 * a higher pick that cannot take more (a muscle of it is at the 20 set limit, or the app has no
 * exercise for it): it is reported as that, and the picks below it are not held back by it.
 */
export function curateFocus(input: {
  picks: readonly string[]; days: FocusMove[][]; candidates: FocusMove[][]; cap: number;
  minutes: (day: FocusMove[], index: number) => number; budgetMinutes?: number;
}): { days: FocusMove[][]; report: FocusReport } {
  const days = input.days.map((d) => d.map((m) => ({ ...m })));
  const budget = focusBudget(input.picks);
  const wanted = (m: FocusMove) => m.picks.some((p) => budget.targets.some((t) => t.id === p));
  const baseline = days.map((d) => d.map((m) => ({ ...m })));
  let spent = 0;
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
  // The picks already served, in rank order. Work for a later pick may never lift one of them above a pick ranked higher.
  const served: Array<{ id: FocusPickId; exempt: boolean }> = [];
  const ranked = (before: number[]) => {
    let top = Infinity;
    return served.every((p, k) => {
      const g = gained(p.id);
      const ok = g <= before[k]! || g <= top;
      if (!p.exempt) top = Math.min(top, g);
      return ok;
    });
  };
  const accepts = (i: number, change: () => void, undo: () => void): boolean => {
    const before = served.map((p) => gained(p.id));
    change();
    if (overLimit().length || postureOver() || !ranked(before) || input.minutes(days[i]!, i) > limits[i]!) { undo(); return false; }
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
  const hasMove = (id: FocusPickId) => [...days.flat(), ...input.candidates.flat()].some((m) => m.hard && m.picks.includes(id));
  const atLimit = (id: FocusPickId) => (LIMIT_MUSCLES[id] ?? []).some((m) => countHardSets(days, m) >= FOCUS_MUSCLE_MAX) || (id === 'posture' && countPick(days, id) >= FOCUS_MUSCLE_MAX);
  // No pick gets more than a pick above it got (unless that one could not take more).
  let ceiling = Infinity;
  for (const { id, sets: requested } of budget.targets) {
    if (id === 'mobility') {
      for (const [i, day] of days.entries()) {
        if (day.some((m) => m.picks.includes('mobility'))) continue;
        const c = input.candidates[i]?.find((m) => !m.hard && m.picks.includes('mobility'));
        if (c) accepts(i, () => day.push({ ...c }), () => { day.pop(); });
        if (days.flat().filter((m) => m.picks.includes('mobility')).length >= 2) break;
      }
      continue;
    }
    // A muscle of it is already at the limit: it has plenty, takes no extra and holds nobody back.
    // (A part of a muscle, like upper chest, can still take another move's place inside that muscle.)
    if (NARROW.has(id) ? countPick(days, id) >= FOCUS_MUSCLE_MAX : atLimit(id)) { served.push({ id, exempt: true }); continue; }
    const goal = Math.min(requested, ceiling);
    // Work already added for a higher choice counts here too, without a second charge.
    const room = () => Math.min(goal - gained(id), budget.total - spent);
    // Substitute a low priority accessory. Never sacrifice another ranked choice, a loved move or a big lift.
    // An option only big lifts train (upper back: rows; front shoulders: presses) takes one of those in its place.
    for (const [i, day] of days.entries()) {
      if (room() < 2) break;
      const candidate = fresh(i, id) ?? fresh(i, id, true);
      if (!candidate) continue;
      for (const at of spares(day)) {
        const old = day[at]!;
        const next = { ...candidate, sets: Math.min(old.sets, input.cap, room()) };
        if (next.sets < 2) continue;
        if (accepts(i, () => { day[at] = next; }, () => { day[at] = old; })) { spent += next.sets; break; }
      }
    }
    // Add one working set around the rotation, accessories before compounds, respecting experience.
    for (let guard = 0; room() > 0 && guard < 4; guard++) {
      let grew = false;
      for (const compound of [false, true]) for (const [i, day] of days.entries()) for (const m of day) {
        if (room() <= 0) break;
        if (!m.hard || m.compound !== compound || !m.picks.includes(id) || m.sets >= input.cap) continue;
        if (accepts(i, () => m.sets++, () => m.sets--)) { spent++; grew = true; }
      }
      if (!grew) break;
    }
    // Only then a short accessory finisher, within the shared budget and real duration.
    for (const [i, day] of days.entries()) {
      const n = Math.min(room(), input.cap);
      if (n < 2 || day.length >= 8) continue;
      const c = fresh(i, id);
      if (!c) continue;
      if (accepts(i, () => day.push({ ...c, sets: n }), () => { day.pop(); })) spent += n;
    }
    // Last, when a day has no time left: one set moves to a focused move from a move no pick asks for.
    // An accessory gives first (down to 2 sets), then a big lift with 4 or more (never the day's first, heaviest lift).
    for (const compound of [false, true]) for (const [i, day] of days.entries()) for (const m of day) {
      if (!m.hard || m.compound !== compound || !m.picks.includes(id)) continue;
      const lead = day.find((x) => x.hard && x.compound);
      const donors = day.filter((x) => x.hard && !x.keep && !wanted(x) && (x.compound ? x !== lead && x.sets >= 4 : x.sets > 2)).sort((a, b) => Number(a.compound) - Number(b.compound));
      for (const donor of donors) {
        if (room() <= 0 || m.sets >= input.cap) break;
        if (accepts(i, () => { donor.sets--; m.sets++; }, () => { donor.sets++; m.sets--; })) spent++;
      }
    }
    const exempt = !hasMove(id) || (gained(id) < requested && atLimit(id));
    served.push({ id, exempt });
    if (!exempt) ceiling = Math.min(ceiling, gained(id));
  }
  const priorities = budget.targets.map(({ id, sets: requested }): FocusResult => {
    if (id === 'mobility') {
      const minutes = days.flat().filter((m) => !m.hard && m.picks.includes(id)).reduce((n, m) => n + (m.seconds ?? 0) * m.sets / 60, 0);
      return { id, requested: 0, extra: 0, total: 0, minutes, shortfall: minutes < 2, state: minutes < 2 ? 'short' : 'extra' };
    }
    const total = countPick(days, id);
    const extra = gained(id);
    const limit = extra < requested && atLimit(id);
    const state: FocusState = !hasMove(id) ? 'no_move' : requested === 0 ? 'no_share' : limit ? 'plenty' : extra >= Math.max(1, requested - 1) ? 'extra' : 'short';
    const muscles = id === 'posture' ? [] : LIMIT_MUSCLES[id] ?? [];
    const parts = muscles.map((muscle) => ({ muscle, sets: countHardSets(days, muscle) })).filter((x) => x.sets > 0);
    return { id, requested, extra, total, shortfall: state === 'short', state, ...(muscles.length > 1 && parts.length ? { parts } : {}), ...(state === 'plenty' ? { atLimit: true as const } : {}), ...(state === 'no_move' ? { noMove: true as const } : {}) };
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
  return { days, report: { budget: budget.total, spent, priorities, days: days.map(() => []), dayExtra } };
}
