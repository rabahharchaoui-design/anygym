// PLAN 3.6f and 3.6g: the working state of one focus curation (the days as they change, what was
// spent, what a day can spare) and the rules every edit must pass. Pure: no database, catalog or screen.
import { FOCUS_MUSCLE_MAX, FOCUS_MUSCLE_MIN, LIMIT_MUSCLES, countHardSets, focusBudget, type FocusMove } from './focus';
import type { FocusPickId } from '../intake/options';

export type CurateInput = {
  picks: readonly string[]; days: FocusMove[][]; candidates: FocusMove[][]; cap: number;
  minutes: (day: FocusMove[], index: number) => number; budgetMinutes?: number;
  /** The most lifts a day may hold after focus adds to it (default 8). */
  maxMoves?: number;
  /** The shares to hand out (default: focusBudget of the picks). */
  shares?: ReturnType<typeof focusBudget>;
  /** PLAN 3.6g: the days are built up to the minutes chosen with work no pick asks for, after the picks had their call. */
  fill?: boolean;
};

/** Picks that are a part of a wider muscle: the muscle can be at the limit while the part is not. */
export const NARROW = new Set<FocusPickId>(['upper_chest', 'lats', 'upper_back', 'posture']);
/** The muscles the 12 set floor looks at, when they are not the limit's (Back: its lats and upper back; the lower back is its own pick). */
const FLOOR: Partial<Record<FocusPickId, readonly string[]>> = { back: ['back'] };
export const countPick = (days: readonly (readonly FocusMove[])[], id: FocusPickId): number => days.flat().reduce((n, m) => n + (m.hard && m.picks.includes(id) ? m.sets : 0), 0);

export type Board = ReturnType<typeof makeBoard>;

export function makeBoard(input: CurateInput) {
  const days = input.days.map((d) => d.map((m) => ({ ...m })));
  const budget = input.shares ?? focusBudget(input.picks);
  const maxMoves = input.maxMoves ?? 8;
  const wanted = (m: FocusMove) => m.picks.some((p) => budget.targets.some((t) => t.id === p));
  const baseline = days.map((d) => d.map((m) => ({ ...m })));
  /** `edits`: accepted edits, to see whether a turn changed anything. `pool`: the extra sets that may be handed out in all. */
  const state = { edits: 0, pool: budget.total };
  const focusedSets = (ds: readonly (readonly FocusMove[])[]) => ds.flat().reduce((n, m) => n + (m.hard && wanted(m) ? m.sets : 0), 0);
  /** The budget spent: the focused hard sets above the same days with no picks, each physical set once. Sets that only make up for ones the 20 set limit took away cost nothing. */
  const spent = () => Math.max(0, focusedSets(days) - focusedSets(baseline));
  const limits = days.map((d, i) => Math.max(input.minutes(d, i), input.budgetMinutes ?? Infinity));
  const slack = (i: number) => limits[i]! - input.minutes(days[i]!, i);
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
  /** An edit stays only inside the 20 set limit and the minutes chosen (the caller's one time estimate). */
  const accepts = (i: number, change: () => void, undo: () => void): boolean => {
    change();
    if (overLimit().length || postureOver() || input.minutes(days[i]!, i) > limits[i]!) { undo(); return false; }
    state.edits++;
    return true;
  };
  const tires = (m: FocusMove) => (m.hard ? m.recovery ?? m.muscles : []);
  const trains = (i: number, muscle: string) => days[i]!.some((m) => tires(m).includes(muscle));
  const neighbours = (i: number) => [...new Set([(i + days.length - 1) % days.length, (i + 1) % days.length])].filter((j) => j !== i);
  /** The 48 hour rule: a new move only joins a day that already trains its muscles, or whose neighbours in the rotation do not. */
  const rested = (i: number, c: FocusMove) => tires(c).every((m) => trains(i, m) || !neighbours(i).some((j) => trains(j, m)));
  const lifts = (day: readonly FocusMove[]) => day.filter((m) => m.hard).length;
  const parts = (id: FocusPickId): readonly string[] => FLOOR[id] ?? LIMIT_MUSCLES[id] ?? [];
  /** How little work the weakest muscle of the pick that this move trains has: extra goes there first (side and rear shoulders before more presses). */
  const weak = (id: FocusPickId, m: FocusMove): number => Math.min(Infinity, ...m.muscles.filter((x) => parts(id).includes(x)).map((x) => countHardSets(days, x)));
  /** A move for the pick this day does not have yet, small (or big), the one for its weakest muscle first. */
  const fresh = (i: number, id: FocusPickId, big = false): FocusMove | undefined => {
    const ok = (input.candidates[i] ?? []).filter((m) => m.hard && m.compound === big && m.picks.includes(id) && !days[i]!.some((x) => x.key === m.key) && rested(i, m));
    return ok.reduce<FocusMove | undefined>((best, m) => (!best || weak(id, m) < weak(id, best) ? m : best), undefined);
  };
  /** The accessories a day can spare, best first: those whose muscles other moves that day also train, then the rest; last in the day first. Never a loved move, a big lift or work a pick asks for. */
  const spares = (day: FocusMove[]): number[] => {
    const doubled = (m: FocusMove) => m.muscles.every((s) => day.some((x) => x !== m && x.hard && x.muscles.includes(s)));
    const free = day.map((_, at) => at).filter((at) => day[at]!.hard && !day[at]!.compound && !day[at]!.keep && !wanted(day[at]!)).reverse();
    return [...free.filter((at) => doubled(day[at]!)), ...free.filter((at) => !doubled(day[at]!))];
  };
  /**
   * The moves of a day that can give a set, first to give first: an accessory no pick asks for (down
   * to 2 sets), then a big lift no pick asks for: the second only from 4 sets, a later one down to 2
   * (the trim's own floors, lib/generator/trim.ts), and last the day's first, heaviest lift, only its
   * fourth set (PLAN 3.6g: moves with 4 or more sets give; the trim takes that set first too).
   */
  const donors = (day: FocusMove[]): FocusMove[] => {
    const big = day.filter((x) => x.hard && x.compound);
    const rank = (x: FocusMove) => (!x.compound ? 0 : x === big[0] ? 2 : 1);
    const gives = (x: FocusMove) => x.hard && !x.keep && !wanted(x) && (x.compound ? x.sets >= (x === big[0] || x === big[1] ? 4 : 3) : x.sets > 2);
    return day.filter(gives).sort((a, b) => rank(a) - rank(b));
  };
  const hasMove = (id: FocusPickId) => [...days.flat(), ...input.candidates.flat()].some((m) => m.hard && m.picks.includes(id));
  const atLimit = (id: FocusPickId) => (LIMIT_MUSCLES[id] ?? []).some((m) => countHardSets(days, m) >= FOCUS_MUSCLE_MAX) || (id === 'posture' && countPick(days, id) >= FOCUS_MUSCLE_MAX);
  const hardIds = budget.targets.filter((t) => t.id !== 'mobility').map((t) => t.id);
  /** It cannot take more: no exercise for it, or a muscle of it is at the limit (what the report calls "plenty"). */
  const full = (id: FocusPickId) => !hasMove(id) || atLimit(id) || countPick(days, id) >= FOCUS_MUSCLE_MAX;
  /**
   * PLAN 3.6g: the sets a pick is short of FOCUS_MUSCLE_MIN a week. One muscle (or a part of one, or
   * posture): the sets shown for it. An area of several muscles: its weakest muscle that has an exercise.
   */
  const need = (id: FocusPickId): number => {
    if (!hasMove(id)) return 0;
    const ps = parts(id);
    if (ps.length < 2 || NARROW.has(id)) return Math.max(0, FOCUS_MUSCLE_MIN - countPick(days, id));
    const served = ps.filter((p) => [...days.flat(), ...input.candidates.flat()].some((m) => m.hard && m.picks.includes(id) && m.muscles.includes(p)));
    return Math.max(0, ...served.map((p) => FOCUS_MUSCLE_MIN - countHardSets(days, p)));
  };
  /** Picks that could not get to +2 when only the picks above them had been served: held back for a reason of their own, they do not hold back the picks below. */
  const stuck = new Set<FocusPickId>();
  const shareOf = (id: FocusPickId) => budget.targets.find((t) => t.id === id)?.sets ?? 0;
  const higher = (id: FocusPickId) => hardIds.slice(0, hardIds.indexOf(id)).filter((h) => !full(h));
  /**
   * What the picks ranked above have: sets past a pick's own share never lift it above one of them.
   * A higher pick that cannot take more does not count; in the floor round neither does one that has
   * its whole share and FOCUS_MUSCLE_MIN sets a week, which that round does not add to.
   */
  const above = (id: FocusPickId, floor = false) => Math.min(Infinity, ...higher(id).filter((h) => !(floor && need(h) === 0 && gained(h) >= shareOf(h))).map(gained));
  /** The same inside the shares, past +2: there a higher pick held back from the start (`stuck`) does not count either. */
  const aboveShare = (id: FocusPickId) => Math.min(Infinity, ...higher(id).filter((h) => !stuck.has(h)).map(gained));
  return { input, days, baseline, budget, maxMoves, state, wanted, spent, limits, slack, focusedMuscles, gained, accepts, rested, lifts, weak, fresh, spares, donors, hasMove, atLimit, hardIds, full, need, above, aboveShare, stuck, shareOf };
}
