// Progression engine (SPEC 6): "Last time" and "Next" for one exercise. Pure: no Dexie, no React.
// It only decides which rule applies; every weight comes from load.ts (SPEC 5.4).
//
// SHAPE
//   progress(input) → {
//     lastTime: the newest session's working sets, or null (never done here)
//     next:     { load, reps, seconds?, reason, kind } — the target for today
//     perSet:   one row per set for the set table (PLAN 1.7c: SET · LAST TIME · WEIGHT · REPS)
//   }
//   `next.load` is a Load this gym can make exactly, or null with an honest reason (never a guess).
//   `next.reps` is the prescription, else the rep range, else the reps to beat; null when there
//   is nothing to go on (first quick workout: the card keeps its default) or for timed holds.
//
// RULES (SPEC 6), working sets of the same load kind only (warmups, drops and sets logged with
// another kind of weight are ignored):
//   2 every working set hit the top of the range at the same load → one step up (load.ts stepUp);
//     bodyweight: +1 rep a set, and after 3 sessions in a row at the top, a nudge to add weight.
//     No step up here (top of the rack, full sleeve) → same load, +1 rep a set.
//   3 a working set below the bottom of the range in each of the last two sessions → ~10% lighter,
//     rounded to a loadable weight, "Reset and build back up". Not for bodyweight or timed.
//   4 else same load, beat the reps: +1 rep on the first set that missed the top.
//   5 no history (the caller keys it: machines per gym, free weights shared) → load null,
//     "First time: pick a weight you could lift 2 more reps with".
//   6 a prescription sets the reps (and the number of rows); the load still follows 2 to 4.
//   7 history in another unit → converted and rounded to the nearest loadable weight here,
//     reason "≈ 27.5 kg, last time 60 lb".
// No rep range (quick workout, no plan yet): rules 2 and 3 cannot apply, so it is rule 4 with
// the last session's reps as the target ("Aim for 10, 10 or better"); a range is never invented.
// Timed holds: no load progression, only "Beat your time". No estimated 1RM, ever.
import type { Load, SetKind, Unit } from '../db/types';
import { IMPORTED_LABEL, isImportOrder } from './import/importOrder';
import {
  convertForGym,
  formatAmount,
  formatWeight,
  heldWeightOf,
  loadAt,
  nearestLoadable,
  pickedWeight,
  resetWeight,
  sameLoad,
  stepUp,
  timedLoad,
  type LoadSetup,
} from './load';

export type RepRange = [number, number];
export type RepTarget = number | RepRange;

export type PastSet = { kind: SetKind; reps?: number; seconds?: number; load: Load };
/** One earlier workout with this exercise. `date` is its start time. */
export type PastSession = { date: number; gymId: string; unit: Unit; sets: PastSet[] };

export type ProgressionInput = {
  exerciseId: string;
  loadKind: Load['kind'];
  /** The active gym's unit. */
  unit: Unit;
  /** What this exercise can load at the active gym (load.ts LoadSetup without the unit). */
  gym: Omit<LoadSetup, 'unit'>;
  repRange: RepRange | null;
  /** Newest first. */
  history: PastSession[];
  prescription?: { sets: number; reps: RepTarget };
};

export type SetLine = { reps?: number; seconds?: number; load: Load };

export type NextKind = 'increase' | 'reset' | 'beat_reps' | 'first_time' | 'converted';

export type Next = {
  load: Load | null;
  reps: RepTarget | null;
  /** Timed only: the hold to beat. */
  seconds?: number;
  reason: string;
  kind: NextKind;
};

export type SetTarget = { load: Load | null; reps?: number; seconds?: number };

export type Progression = {
  lastTime: { date: number; sets: SetLine[] } | null;
  next: Next;
  perSet: Array<{ lastTime?: SetLine; target: SetTarget }>;
};

export const FIRST_TIME = 'First time: pick a weight you could lift 2 more reps with';
export const FIRST_TIME_BODYWEIGHT = 'First time: stop when you could do 2 more reps';
export const FIRST_TIME_TIMED = 'First time: hold while your form stays good';
export const RESET = 'Reset and build back up';

const line = (s: PastSet): SetLine => {
  const out: SetLine = { load: s.load };
  if (s.reps !== undefined) out.reps = s.reps;
  if (s.seconds !== undefined) out.seconds = s.seconds;
  return out;
};

const repsOf = (s: SetLine): number => s.reps ?? 0;
const allTop = (sets: SetLine[], [, hi]: RepRange) => sets.every((s) => repsOf(s) >= hi);
const anyBelow = (sets: SetLine[], [lo]: RepRange) => sets.some((s) => repsOf(s) < lo);
const clampTo = (n: number, r: RepTarget | undefined): number =>
  r === undefined ? n : typeof r === 'number' ? r : Math.min(r[1], Math.max(r[0], n));

/**
 * The heaviest working load: the one "same load" refers to. Sets may be in different units
 * (imported history), so each is compared in one unit through load.ts; the load keeps its own unit.
 */
function heaviest(sets: SetLine[]): Load {
  const unit = sets[0]!.load.unit;
  const w = (l: Load) => convertForGym(pickedWeight(l) ?? 0, l.unit, unit);
  return sets.reduce((a, b) => (w(b.load) > w(a.load) ? b : a)).load;
}

export function progress(input: ProgressionInput): Progression {
  const { loadKind, unit, prescription } = input;
  const setup: LoadSetup = { ...input.gym, unit };
  const sessions = input.history
    .map((s) => ({ date: s.date, sets: s.sets.filter((x) => x.kind === 'work' && x.load.kind === loadKind).map(line) }))
    .filter((s) => s.sets.length > 0);
  const range: RepRange | null = input.repRange ?? (Array.isArray(prescription?.reps) ? prescription.reps : null);
  const rows = prescription?.sets;

  const last = sessions[0];
  if (!last) return firstTime(loadKind, range, prescription);
  const lastTime = { date: last.date, sets: last.sets };
  const lastAt = (i: number): SetLine | undefined => last.sets[i];
  const count = rows ?? last.sets.length;
  const fill = <T>(make: (i: number) => T): T[] => Array.from({ length: count }, (_, i) => make(i));

  if (loadKind === 'timed') {
    const best = Math.max(...last.sets.map((s) => s.seconds ?? 0));
    const load = timedLoad(unit);
    return {
      lastTime,
      next: { load, reps: null, seconds: best, reason: 'Beat your time', kind: 'beat_reps' },
      perSet: fill((i) => ({ lastTime: lastAt(i), target: { load, seconds: lastAt(i)?.seconds ?? best } })),
    };
  }

  const ref = heaviest(last.sets);
  const converted = ref.unit !== unit;
  const picked = pickedWeight(ref)!;
  const here = converted ? convertForGym(picked, ref.unit, unit) : picked;
  const added = !converted && ref.kind === 'stack' ? (ref.added ?? 0) : 0;
  const base = !converted && loadAt(loadKind, here, setup, added) ? here : nearestLoadable(loadKind, here, setup);

  const sameAll = last.sets.every((s) => sameLoad(s.load, ref));
  const lastReps = last.sets.map(repsOf);
  const plusOne = (i: number) => (lastReps[i] ?? lastReps[lastReps.length - 1]!) + 1;
  // Rule 4: +1 on the first set that missed the top (with no range: the reps to beat as they were).
  const missed = range ? lastReps.findIndex((r) => r < range[1]) : -1;
  const beat = (i: number) => {
    const r = lastReps[i] ?? lastReps[lastReps.length - 1]!;
    return i === missed ? r + 1 : r;
  };

  let kind: NextKind;
  let value: number | null = base;
  let repsFor: (i: number) => number;
  let reason: string;
  let nextReps: RepTarget | null = prescription?.reps ?? range;

  if (range && sameAll && allTop(last.sets, range)) {
    if (loadKind === 'bodyweight') {
      kind = 'increase';
      repsFor = plusOne;
      const miss = sessions.findIndex((s) => !(s.sets.every((x) => sameLoad(x.load, ref)) && allTop(s.sets, range)));
      const streak = miss === -1 ? sessions.length : miss;
      reason = streak >= 3 ? '3 sessions at the top: try adding weight' : `All sets hit ${range[1]}. Add 1 rep a set`;
      if (!prescription) nextReps = plusOne(0);
    } else {
      const up = value === null ? null : stepUp(loadKind, value, setup);
      if (up === null && value !== null) {
        kind = 'beat_reps';
        repsFor = plusOne;
        reason = 'Heaviest weight here. Add a rep to each set';
      } else {
        kind = 'increase';
        value = up;
        repsFor = () => range[0];
        reason = `All sets hit ${range[1]}. Time to go up`;
      }
    }
  } else if (range && loadKind !== 'bodyweight' && sessions[1] && anyBelow(last.sets, range) && anyBelow(sessions[1].sets, range)) {
    kind = 'reset';
    value = value === null ? null : resetWeight(loadKind, value, setup);
    repsFor = () => range[1];
    reason = RESET;
  } else {
    kind = 'beat_reps';
    repsFor = beat;
    reason = '';
  }

  const targetReps = (i: number) => clampTo(repsFor(i), prescription?.reps);
  if (kind === 'beat_reps' && !reason) reason = `Aim for ${fill(targetReps).join(', ')} or better`;
  if (nextReps === null) nextReps = targetReps(0);

  const load = value === null ? null : loadAt(loadKind, value, setup, added);
  if (load && converted && loadKind !== 'bodyweight') {
    kind = 'converted';
    reason = `≈ ${formatWeight(pickedWeight(load)!, unit)}, last time ${formatWeight(picked, ref.unit)}`;
  }
  if (!load) reason = noLoadReason(loadKind, setup);

  return {
    lastTime,
    next: { load, reps: nextReps, reason, kind },
    perSet: fill((i) => ({ lastTime: lastAt(i), target: { load, reps: targetReps(i) } })),
  };
}

function firstTime(loadKind: Load['kind'], range: RepRange | null, prescription: ProgressionInput['prescription']): Progression {
  const reps = prescription?.reps ?? range;
  const reason = loadKind === 'bodyweight' ? FIRST_TIME_BODYWEIGHT : loadKind === 'timed' ? FIRST_TIME_TIMED : FIRST_TIME;
  const rowReps = reps === null ? undefined : typeof reps === 'number' ? reps : reps[0];
  const perSet = Array.from({ length: prescription?.sets ?? 0 }, () => ({ target: { load: null, reps: rowReps } as SetTarget }));
  return { lastTime: null, next: { load: null, reps: loadKind === 'timed' ? null : reps, reason, kind: 'first_time' }, perSet };
}

/** Why there is no weight to suggest, in one plain sentence. */
function noLoadReason(kind: Load['kind'], s: LoadSetup): string {
  if (kind === 'barbell' && s.base === null) return 'Set the bar weight to see your next weight';
  if (kind === 'plate_machine' && s.base === null) return 'Set the starting weight to see your next weight';
  return 'No matching weight here: pick the closest you have';
}

// ---------------------------------------------------------------- words for the set card

const repsText = (r: RepTarget): string => (typeof r === 'number' ? `${r}` : `${r[0]} to ${r[1]}`);

/** "10 to 12 × 190 lb", "10 × 30 lb each", "13 reps", "8 reps + 25 lb", "45 s". null without a load. */
export function formatNext(next: Next): string | null {
  const { load } = next;
  if (!load) return null;
  if (load.kind === 'timed') return `${next.seconds ?? 0} s`;
  if (next.reps === null) return null;
  const r = repsText(next.reps);
  if (load.kind === 'bodyweight') return load.added ? `${r} reps + ${formatWeight(load.added, load.unit)}` : `${r} reps`;
  if (load.kind === 'dumbbell_each') return `${r} × ${formatWeight(heldWeightOf(load)!, load.unit)} each`;
  return `${r} × ${formatWeight(load.total, load.unit)}`;
}

/**
 * Last time's sets, compact: "12 × 185 · 12 × 185 · 10 × 185 lb" (one unit at the end),
 * "10 × 30 · 10 × 30 lb each", "12 · 12 · 10 reps", "45 s · 40 s". Mixed units or added
 * bodyweight spell every set out.
 */
export function formatSets(sets: SetLine[]): string {
  const first = sets[0]!.load;
  const same = sets.every((s) => s.load.kind === first.kind && s.load.unit === first.unit && !s.load.added);
  if (first.kind === 'timed') return sets.map((s) => `${s.seconds ?? 0} s`).join(' · ');
  if (!same) return sets.map(setText).join(' · ');
  if (first.kind === 'bodyweight') return `${sets.map(repsOf).join(' · ')} reps`;
  const unit = first.kind === 'dumbbell_each' ? `${first.unit} each` : first.unit;
  return `${sets.map((s) => `${repsOf(s)} × ${formatAmount(pickedOrTotal(s.load))}`).join(' · ')} ${unit}`;
}

const pickedOrTotal = (load: Load): number => (load.kind === 'dumbbell_each' ? heldWeightOf(load)! : load.total);

function setText(s: SetLine): string {
  const { load } = s;
  if (load.kind === 'bodyweight') return load.added ? `${repsOf(s)} + ${formatWeight(load.added, load.unit)}` : `${repsOf(s)} reps`;
  return `${repsOf(s)} × ${formatWeight(pickedOrTotal(load), load.unit)}${load.kind === 'dumbbell_each' ? ' each' : ''}`;
}

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);

/** "today", "yesterday", "Tue" within the week, else "Oct 12". Local time. "Imported" for imported history (no date). */
export function formatWhen(date: number, now: number): string {
  if (isImportOrder(date)) return IMPORTED_LABEL;
  const days = Math.round((startOfDay(now) - startOfDay(date)) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
