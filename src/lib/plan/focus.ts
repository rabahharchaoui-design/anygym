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
export type FocusResult = {
  id: FocusPickId; requested: number; extra: number; total: number; shortfall: boolean; reason?: string; minutes?: number;
  /** One of its muscles is at the weekly limit: nothing more would help, so nothing is missing. */
  atLimit?: true;
  /** No move the app is sure of trains it with this equipment and these answers: more days or minutes cannot help. */
  noMove?: true;
};
export type FocusReport = { budget: number; spent: number; priorities: FocusResult[]; days: string[][] };
/** The most hard sets a week a focused muscle gets (PLAN 3.6f): more is not better. */
export const FOCUS_MUSCLE_MAX = 20;
export const countHardSets = (days: readonly (readonly FocusMove[])[], muscle: string): number => days.flat().reduce((n, m) => n + (m.hard && m.muscles.includes(muscle) ? m.sets : 0), 0);
const countPick = (days: FocusMove[][], id: FocusPickId): number => days.flat().reduce((n, m) => n + (m.hard && m.picks.includes(id) ? m.sets : 0), 0);

/**
 * The picks whose extra sets did not fit (the reveal says so and offers a day or minutes). The budget
 * is "about" (PLAN 3.6f): one set short of the share is still a fit, none at all never is. At the limit is not a miss,
 * and a pick with no sure move is said on its own (more days or minutes cannot help it).
 */
export const focusUnplaced = (report: FocusReport | undefined): FocusResult[] =>
  (report?.priorities ?? []).filter((p) => !p.atLimit && !p.noMove && (p.id === 'mobility' ? p.shortfall : p.extra < Math.max(1, p.requested - 1) && p.requested > 0));

/**
 * Receives already fitted days and eligible, prescribed candidates. Replacement, then set growth,
 * then a small move at the end. Each tentative edit uses the caller's single duration estimate.
 * No later filling may undo this pass. Compound lifts, loved moves and the minimum day size are protected.
 * A new move only joins a day that already trains its muscles, or whose neighbours in the rotation
 * do not (the 48 hour rule: focus never makes two days in a row hit the same muscle).
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
  const capped = () => overLimit().length === 0;
  // A plan already past the limit comes down to it one set at a time: from the move with the most
  // sets (small moves before big lifts, later in the rotation first), and no move under 2 sets while another can give.
  for (let guard = 0; guard < 400; guard++) {
    const over = new Set(overLimit());
    if (!over.size) break;
    const hits = days.flat().filter((m) => m.hard && m.muscles.some((s) => over.has(s)));
    const pool = hits.filter((m) => m.sets > (hits.some((x) => x.sets > 2) ? 2 : 1));
    const most = Math.max(...pool.map((m) => m.sets));
    const move = pool.findLast((m) => m.sets === most && !m.compound) ?? pool.findLast((m) => m.sets === most);
    if (!move) break;
    move.sets--;
  }
  const accepts = (i: number, change: () => void, undo: () => void): boolean => {
    change();
    if (!capped() || input.minutes(days[i]!, i) > limits[i]!) { undo(); return false; }
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
    if (!requested) continue;
    // Work already added for another choice credits every verified target without a second charge.
    let added = Math.min(requested, Math.max(0, countPick(days, id) - countPick(baseline, id)));
    const credit = (n: number) => { spent += n; added += n; };
    // Substitute a low priority accessory. Never sacrifice another ranked choice, a loved move or a big lift.
    // An option only big lifts train (upper back: rows; front shoulders: presses) takes one of those in its place.
    for (const [i, day] of days.entries()) {
      if (added >= requested || spent >= budget.total) break;
      const candidate = fresh(i, id) ?? fresh(i, id, true);
      if (!candidate) continue;
      for (const at of spares(day)) {
        const old = day[at]!;
        const next = { ...candidate, sets: Math.min(old.sets, input.cap, requested - added, budget.total - spent) };
        if (next.sets < 2) continue;
        if (accepts(i, () => { day[at] = next; }, () => { day[at] = old; })) { credit(next.sets); break; }
      }
    }
    // Add one working set around the rotation, accessories before compounds, respecting experience.
    for (let guard = 0; added < requested && spent < budget.total && guard < 4; guard++) {
      let grew = false;
      for (const compound of [false, true]) for (const [i, day] of days.entries()) for (const m of day) {
        if (added >= requested || spent >= budget.total) break;
        if (!m.hard || m.compound !== compound || !m.picks.includes(id) || m.sets >= input.cap) continue;
        if (accepts(i, () => m.sets++, () => m.sets--)) { credit(1); grew = true; }
      }
      if (!grew) break;
    }
    // Only then a short accessory finisher, within the shared budget and real duration.
    for (const [i, day] of days.entries()) {
      const n = Math.min(requested - added, budget.total - spent, input.cap);
      if (n < 2 || day.length >= 8) continue;
      const c = fresh(i, id);
      if (!c) continue;
      if (accepts(i, () => day.push({ ...c, sets: n }), () => { day.pop(); })) credit(n);
    }
  }
  const priorities = budget.targets.map(({ id, sets: requested }): FocusResult => {
    if (id === 'mobility') {
      const minutes = days.flat().filter((m) => !m.hard && m.picks.includes(id)).reduce((n, m) => n + (m.seconds ?? 0) * m.sets / 60, 0);
      return { id, requested: 0, extra: 0, total: 0, minutes, shortfall: minutes < 2, ...(minutes < 2 ? { reason: 'No more verified mobility time fits inside your minutes.' } : {}) };
    }
    const total = countPick(days, id);
    // Count retained extra directly against the fitted baseline, never a stale item annotation.
    const extra = Math.min(requested, Math.max(0, total - countPick(baseline, id)));
    const full = extra < requested ? days.flat().filter((m) => m.hard && m.picks.includes(id)).flatMap((m) => m.muscles).find((s) => countHardSets(days, s) >= FOCUS_MUSCLE_MAX) : undefined;
    const atLimit = full !== undefined;
    const noMove = ![...days.flat(), ...input.candidates.flat()].some((m) => m.hard && m.picks.includes(id));
    const objective = id === 'posture';
    const shortfall = extra < requested || (!objective && total < 12);
    const reason = full ? `Your ${full} work is already at ${FOCUS_MUSCLE_MAX} sets, the most that helps.` : noMove ? 'No sure move for this with your equipment yet.' : requested === 0 ? 'The shared focus budget went to earlier choices.' : 'Equipment, experience, muscle limits and minutes limit the extra work.';
    return { id, requested, extra, total, shortfall, ...(shortfall ? { reason } : {}), ...(atLimit ? { atLimit } : {}), ...(noMove ? { noMove } : {}) };
  });
  const why = (p: FocusResult, total: number) => p.id === 'mobility' ? `Mobility: ${p.minutes} min of stretches` : p.id === 'posture'
    ? `${focusLabel(p.id)}: ${total} sets of back and rear shoulder work`
    : `${p.extra ? 'Extra ' : ''}${focusLabel(p.id).toLowerCase()} work: ${p.total} sets`;
  return { days, report: { budget: budget.total, spent, priorities, days: days.map((d) => priorities.filter((p) => (p.total > 0 || (p.minutes ?? 0) > 0) && d.some((m) => m.picks.includes(p.id))).map((p) => why(p, p.total))) } };
}
