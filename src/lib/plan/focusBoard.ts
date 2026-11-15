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
  fill?: boolean;  /**
   * PLAN 3.6g2, more buys more: what the same picks get with one day fewer and with the next shorter
   * session. `stretch`: the stretch minutes; the blocks are made longer until the plan has at least
   * these. `sets`: with a single pick, its hard sets; it is brought to at least these (several picks
   * share one budget of 12 under a strict rank, where that cannot be promised).
   */
  least?: { stretch?: number; sets?: number };
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
  /** `edits`: accepted edits, to see whether a turn changed anything. `pool`: the extra sets that may be handed out in all. `aim`: the sets a week the picks are brought toward now (12, then 16). */
  const state = { edits: 0, pool: budget.total, aim: FOCUS_MUSCLE_MIN as number };
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
  const hardIds = budget.targets.filter((t) => t.id !== 'mobility').map((t) => t.id);
  /** Sets above the same plan with no picks: the one meaning of "extra". */
  const gained = (id: FocusPickId) => Math.max(0, countPick(days, id) - countPick(baseline, id));
  /** The hard sets of a pick that are not also a higher ranked pick's (a squat set given to Glutes is not given to Quads a second time). */
  const countOwn = (ds: readonly (readonly FocusMove[])[], id: FocusPickId): number => {
    const higher = hardIds.slice(0, hardIds.indexOf(id));
    return ds.flat().reduce((n, m) => n + (m.hard && m.picks.includes(id) && !m.picks.some((q) => higher.includes(q)) ? m.sets : 0), 0);
  };
  /** The extra sets given to the pick itself: `gained` without the sets that came with a higher ranked pick's work. */
  const own = (id: FocusPickId) => Math.min(gained(id), Math.max(0, countOwn(days, id) - countOwn(baseline, id)));
  /** How far each pick's own extra stands above a pick ranked higher that can still take sets (PLAN 3.6g2: the strict rank). */
  const excess = (): number[] => {
    let bound = Infinity;
    return hardIds.map((id) => {
      const over = Math.max(0, own(id) - bound);
      if (open(id)) bound = Math.min(bound, gained(id));
      return over;
    });
  };
  /**
   * An edit stays only inside the 20 set limit and the minutes chosen (the caller's one time estimate),
   * and (PLAN 3.6g2) never lifts a pick further above a pick ranked higher: whatever path a set takes
   * (a move two picks share, a partner that grows along), the rank holds after every edit.
   */
  const accepts = (i: number, change: () => void, undo: () => void): boolean => {
    const was = excess();
    change();
    if (overLimit().length || postureOver() || input.minutes(days[i]!, i) > limits[i]! || excess().some((x, k) => x > was[k]!)) { undo(); return false; }
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
  const donors = (day: FocusMove[], first?: (m: FocusMove) => boolean): FocusMove[] => {
    const big = day.filter((x) => x.hard && x.compound);
    const rank = (x: FocusMove) => (!x.compound ? 0 : x === big[0] ? 2 : 1);
    const gives = (x: FocusMove) => x.hard && !x.keep && !wanted(x) && (x.compound ? x.sets >= (x === big[0] || x === big[1] ? 4 : 3) : x.sets > 2);
    return day.filter(gives).sort((a, b) => Number(!!first?.(b)) - Number(!!first?.(a)) || rank(a) - rank(b));
  };
  /**
   * PLAN 3.6g2: a part of a wider muscle (lats in the back, upper chest in the chest) whose muscle is
   * at the 20 set limit gets its room inside that muscle: these are the muscles that are too full for
   * a 2 set move of the pick. Work for them that no pick asks for gives its sets, or its place, first.
   */
  const tight = (id: FocusPickId): readonly string[] => (NARROW.has(id) ? (LIMIT_MUSCLES[id] ?? []).filter((m) => countHardSets(days, m) + 2 > FOCUS_MUSCLE_MAX) : []);
  /** The moves of a day that train one of `muscles` and may give their place to a pick's move: no pick asks for them, not loved, never the day's first big lift. Last in the day first. */
  const rivals = (day: FocusMove[], muscles: readonly string[]): number[] => {
    const lead = day.find((x) => x.hard && x.compound);
    return day.map((_, at) => at).filter((at) => { const m = day[at]!; return m.hard && !m.keep && !wanted(m) && m !== lead && m.muscles.some((x) => muscles.includes(x)); }).reverse();
  };
  const hasMove = (id: FocusPickId) => [...days.flat(), ...input.candidates.flat()].some((m) => m.hard && m.picks.includes(id));
  const atLimit = (id: FocusPickId) => (LIMIT_MUSCLES[id] ?? []).some((m) => countHardSets(days, m) >= FOCUS_MUSCLE_MAX) || (id === 'posture' && countPick(days, id) >= FOCUS_MUSCLE_MAX);
  /** It cannot take more: no exercise for it, or a muscle of it is at the limit (what the report calls "plenty"). A part of a wider muscle (lats in the back) only when the part itself is: until then it takes the place of other work inside that muscle. */
  const full = (id: FocusPickId) => !hasMove(id) || (NARROW.has(id) ? countPick(days, id) >= FOCUS_MUSCLE_MAX : atLimit(id));
  /**
   * PLAN 3.6g: the sets a pick is short of `aim` a week (FOCUS_MUSCLE_MIN, then FOCUS_MUSCLE_GOOD). One muscle (or a part of one, or
   * posture): the sets shown for it. An area of several muscles: its weakest muscle that has an exercise.
   */
  const need = (id: FocusPickId, aim = state.aim): number => {
    if (!hasMove(id)) return 0;
    const ps = parts(id);
    if (ps.length < 2 || NARROW.has(id)) return Math.max(0, aim - countPick(days, id));
    const served = ps.filter((p) => [...days.flat(), ...input.candidates.flat()].some((m) => m.hard && m.picks.includes(id) && m.muscles.includes(p)));
    return Math.max(0, ...served.map((p) => aim - countHardSets(days, p)));
  };
  /**
   * PLAN 3.6g2: nothing more can be added for it here whatever the time: every move of it in the plan
   * is at the most sets, and no day can take another exercise for it (none is left that fits the gym,
   * the answers and the 48 hour rule). Such a pick is said as that and does not hold back the picks below.
   */
  const shareOf = (id: FocusPickId) => budget.targets.find((t) => t.id === id)?.sets ?? 0;
  const closed = (id: FocusPickId) => hasMove(id) && !days.some((d, i) => d.some((m) => m.hard && m.picks.includes(id) && m.sets < input.cap) || !!fresh(i, id) || !!fresh(i, id, true));
  /** It can still take sets: it has an exercise, is under the limit and is not `closed`. Only these count for the rank. */
  const open = (id: FocusPickId) => !full(id) && !closed(id);
  /**
   * PLAN 3.6g2, the strict rank: the fewest extra sets of the picks ranked above that can still take
   * sets. No pick is ever served past it; there is no exception for room (the room is made on the
   * higher pick's days first, lib/plan/focusServe.ts, or the lower pick gets no more).
   */
  const above = (id: FocusPickId) => Math.min(Infinity, ...hardIds.slice(0, hardIds.indexOf(id)).filter(open).map(gained));
  return { input, days, baseline, budget, maxMoves, state, wanted, spent, limits, slack, focusedMuscles, gained, accepts, rested, lifts, weak, fresh, spares, donors, hasMove, atLimit, hardIds, full, need, above, closed, open, own, tight, rivals, shareOf };
}
