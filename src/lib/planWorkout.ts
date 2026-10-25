// A plan day as a workout (PLAN 1.10, SPEC 8.2, 20.1). Pure: no Dexie, no React.
// One entry per exercise in day order, with everything the card and the 1.7c set table need:
// target sets, reps or hold, rest, note, and the pair it belongs to. Also decides which card is
// current after a set is logged (pairs alternate: A1, B1, rest, A2, B2, rest...).
import type { RepRange } from './progression';
import { slugify } from './loadTypeRule';
import { amountText, blockRest, itemLine, itemTarget, planRest, setsText, type Plan, type PlanReps, type PlanSeconds } from './plans';
import type { ExerciseLoadType } from './loadTypeRule';

export type WorkoutEntry = {
  exerciseId: string;
  name: string;
  note?: string;
  eachSide?: boolean;
  /** Index of the block in the day; entries of one pair share it. */
  block: number;
  kind: 'single' | 'pair';
  warmup: boolean;
  /** Position inside a pair (0, 1) and the pair's size; 0 and 1 for a single. */
  pairIndex: number;
  pairSize: number;
  sets: number;
  reps?: PlanReps;
  seconds?: PlanSeconds;
  restSec: number;
  /** The rest the plan itself states (the only rest the day list may show), or undefined. */
  statedRest?: number;
  /** "4 sets × 8 to 12" */
  setsText: string;
  /** "4 sets × 8 to 12 · 90 s rest" */
  line: string;
  /** "8 to 12 reps", "45 sec" (the amount on the set line), '' if the plan gives none. */
  amount: string;
  /** The sets are rounds of a timed interval: "Round 1 of 10". */
  rounds?: true;
  /** The day's cardio finisher (last row, timed, no rest). */
  finisher?: true;
  /** weekly_table: the week's prescription for the progression engine (SPEC 6 rule 6). */
  prescription?: { sets: number; reps: number };
};

/** Every exercise of a plan day for the given week, in order. */
export function dayWorkout(plan: Plan, dayIndex: number, weekIndex = 0): WorkoutEntry[] {
  const day = plan.days[dayIndex];
  if (!day) return [];
  const out: WorkoutEntry[] = [];
  day.blocks.forEach((b, bi) => {
    b.items.forEach((it, ii) => {
      const t = itemTarget(b, it, weekIndex);
      const e: WorkoutEntry = {
        exerciseId: it.exerciseId,
        name: it.name,
        block: bi,
        kind: b.kind,
        warmup: b.warmup === true,
        pairIndex: ii,
        pairSize: b.items.length,
        sets: t.sets,
        restSec: blockRest(b),
        setsText: setsText(t),
        line: itemLine(b, it, weekIndex),
        amount: amountText(t, it.eachSide),
      };
      if (it.note) e.note = it.note;
      if (it.eachSide) e.eachSide = true;
      const stated = planRest(b);
      if (stated !== undefined) e.statedRest = stated;
      if (t.reps !== undefined) e.reps = t.reps;
      if (t.seconds !== undefined) e.seconds = t.seconds;
      if (t.rounds) e.rounds = true;
      if (plan.progressionMode === 'weekly_table' && typeof t.reps === 'number') e.prescription = { sets: t.sets, reps: t.reps };
      out.push(e);
    });
  });
  const f = day.finisher;
  if (f) {
    const time = f.minutes ? `${f.minutes} min` : '';
    const e: WorkoutEntry = {
      exerciseId: finisherId(f.name),
      name: f.name,
      block: day.blocks.length,
      kind: 'single',
      warmup: false,
      pairIndex: 0,
      pairSize: 1,
      sets: 1,
      restSec: 0,
      setsText: time,
      line: time,
      amount: time,
      finisher: true,
    };
    if (f.minutes) e.seconds = f.minutes * 60;
    out.push(e);
  }
  return out;
}

/** Id for a finisher's sets: "finisher-stair-climbing" (not a plan exercise; its own history). */
export const finisherId = (name: string): string => `finisher-${slugify(name)}`;

/** The rep range for double progression: the plan's range, or [n, n] for a fixed count. */
export function repRangeOf(e: Pick<WorkoutEntry, 'reps'>): RepRange | null {
  if (e.reps === undefined) return null;
  return typeof e.reps === 'number' ? [e.reps, e.reps] : e.reps;
}

/** Target hold for the timer: the low end of the plan's hold. */
export function targetSecondsOf(e: Pick<WorkoutEntry, 'seconds'>): number | undefined {
  return e.seconds === undefined ? undefined : typeof e.seconds === 'number' ? e.seconds : e.seconds[0];
}

/** "Set 1 of 4 · 8 to 12 reps", "Round 2 of 10 · 30 sec"; past the plan's sets just "Set 5". */
export function setLine(e: Pick<WorkoutEntry, 'sets' | 'amount' | 'rounds'>, setNumber: number): string {
  const word = e.rounds ? 'Round' : 'Set';
  if (setNumber > e.sets) return `${word} ${setNumber}`;
  return e.amount ? `${word} ${setNumber} of ${e.sets} · ${e.amount}` : `${word} ${setNumber} of ${e.sets}`;
}

export type DoneCounts = Readonly<Record<string, number>>;

const open = (e: WorkoutEntry, done: DoneCounts) => (done[e.exerciseId] ?? 0) < e.sets;

/** The first exercise with sets left, in day order; null when every set is done. */
export function firstOpen(entries: WorkoutEntry[], done: DoneCounts): string | null {
  return entries.find((e) => open(e, done))?.exerciseId ?? null;
}

/**
 * Which card is current after a set of `logged` (done already counts it):
 *   single: stays until its sets are done, then the next exercise with sets left (after it first,
 *           then from the top), else stays.
 *   pair:   the next exercise in the pair still behind on this round, else back to the first one in
 *           the pair with sets left (the next round), else on past the pair like a single.
 */
export function nextCurrent(entries: WorkoutEntry[], done: DoneCounts, logged: string): string {
  const i = entries.findIndex((e) => e.exerciseId === logged);
  if (i === -1) return logged;
  const e = entries[i]!;
  if (e.kind === 'pair') {
    const pair = entries.filter((x) => x.block === e.block);
    const mine = done[logged] ?? 0;
    const behind = pair.find((x) => x.pairIndex > e.pairIndex && (done[x.exerciseId] ?? 0) < mine && open(x, done));
    if (behind) return behind.exerciseId;
    const again = pair.find((x) => open(x, done));
    if (again) return again.exerciseId;
  } else if (open(e, done)) {
    return logged;
  }
  const after = entries.slice(i + 1).find((x) => open(x, done));
  return after?.exerciseId ?? firstOpen(entries, done) ?? logged;
}

/**
 * Rest after a set of `logged`, in seconds (0 = no rest): the block's rest, except inside a pair
 * when the next exercise of the same round is up (do them back to back), and after the very last
 * set of the day. null for an exercise that is not in the plan day (added by hand).
 */
export function restAfter(entries: WorkoutEntry[], done: DoneCounts, logged: string): number | null {
  const e = entries.find((x) => x.exerciseId === logged);
  if (!e) return null;
  if (firstOpen(entries, done) === null) return 0;
  const next = entries.find((x) => x.exerciseId === nextCurrent(entries, done, logged));
  if (e.kind === 'pair' && next && next.block === e.block && next.pairIndex > e.pairIndex) return 0;
  return e.restSec;
}

// ---------------------------------------------------------------- quick workout (SPEC 20.3)

/**
 * Sensible defaults for an exercise added by hand (SPEC 20.3), until the intake (SPEC 14) knows
 * the user's goal: 3 sets of 8 to 12 reps, 90 s rest (DEFAULT_PLAN_REST_SEC). Timed holds: 3 sets,
 * no hold length is invented (the first one is timed).
 */
export const QUICK_DEFAULT = { sets: 3, reps: [8, 12] as RepRange, restSec: 90 } as const;

/** A day list entry for an exercise added by hand to a quick workout. */
export function quickEntry(exerciseId: string, name: string, loadType: ExerciseLoadType | undefined, block: number): WorkoutEntry {
  const timed = loadType === 'timed';
  const t = timed ? { sets: QUICK_DEFAULT.sets } : { sets: QUICK_DEFAULT.sets, reps: QUICK_DEFAULT.reps };
  const e: WorkoutEntry = {
    exerciseId,
    name,
    block,
    kind: 'single',
    warmup: false,
    pairIndex: 0,
    pairSize: 1,
    sets: t.sets,
    restSec: QUICK_DEFAULT.restSec,
    setsText: setsText(t),
    line: setsText(t),
    amount: amountText(t),
  };
  if (!timed) e.reps = QUICK_DEFAULT.reps;
  return e;
}

/**
 * The workout's entries in the session's own order (Reorder, Remove): plan entries for the
 * exercises still in the workout, in exerciseIds order; exercises without a plan entry use `make`.
 */
export function orderEntries(planEntries: WorkoutEntry[], exerciseIds: string[], make: (id: string, index: number) => WorkoutEntry): WorkoutEntry[] {
  const byId = new Map(planEntries.map((e) => [e.exerciseId, e]));
  return exerciseIds.map((id, i) => byId.get(id) ?? make(id, planEntries.length + i));
}

/**
 * Moves an exercise one place up or down (dir −1 / +1). A pair moves as one unit and is never
 * split: moving next to a pair jumps over the whole pair. Returns the new order, or null when
 * it cannot move (already first or last, or the exercise is in a pair).
 */
export function moveInOrder(ids: string[], id: string, dir: -1 | 1, entryOf: (id: string) => Pick<WorkoutEntry, 'kind' | 'block'> | undefined): string[] | null {
  const e = entryOf(id);
  if (!ids.includes(id) || e?.kind === 'pair') return null;
  // Units: runs of one pair, or single exercises.
  const units: string[][] = [];
  for (const x of ids) {
    const ex = entryOf(x);
    const last = units[units.length - 1];
    const prev = last ? entryOf(last[0]!) : undefined;
    if (ex?.kind === 'pair' && last && prev?.kind === 'pair' && prev.block === ex.block) last.push(x);
    else units.push([x]);
  }
  const at = units.findIndex((u) => u.includes(id));
  const to = at + dir;
  if (to < 0 || to >= units.length) return null;
  [units[at], units[to]] = [units[to]!, units[at]!];
  return units.flat();
}

/**
 * The exercise to do next (the highlighted row, SPEC 20.1): carry on from the last one logged
 * (its next set, its pair partner, or the next exercise after it), else the first with sets left.
 * null when every set is done.
 */
export function upNext(entries: WorkoutEntry[], done: DoneCounts, lastLogged?: string): string | null {
  const after = lastLogged && entries.some((e) => e.exerciseId === lastLogged) ? nextCurrent(entries, done, lastLogged) : null;
  const e = after ? entries.find((x) => x.exerciseId === after) : undefined;
  if (e && open(e, done)) return e.exerciseId;
  return firstOpen(entries, done);
}

/** How much of a plan day a finished workout covered (Today's week strip, the finish screen). */
export type DayProgress = { done: number; total: number; share: number; complete: boolean };

/**
 * The day's lifts are its exercises that are not warm ups or the cardio finisher. `done` counts
 * those with every planned set logged (1 of 4 is not done); `share` is sets logged over sets
 * planned (0 to 1); `complete` (the full tick on Today) only when every lift is done, the same
 * rule as the finish screen.
 */
export function dayProgress(entries: readonly WorkoutEntry[], setsOf: (exerciseId: string) => number): DayProgress {
  const lifts = entries.filter((e) => !e.warmup && !e.finisher);
  const planned = lifts.reduce((a, e) => a + Math.max(1, e.sets), 0);
  const logged = lifts.reduce((a, e) => a + Math.min(Math.max(1, e.sets), setsOf(e.exerciseId)), 0);
  const done = lifts.filter((e) => setsOf(e.exerciseId) >= Math.max(1, e.sets)).length;
  return { done, total: lifts.length, share: planned ? logged / planned : 0, complete: lifts.length > 0 && done === lifts.length };
}
