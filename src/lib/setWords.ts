// One wording for sets everywhere (Session 2 gate B1). Words only: every number comes from
// load.ts (formatWeight, heldWeightOf, sameLoad), this file never does weight math.
//   one set:        "185 lb × 6", "30 lb each × 12", "+25 lb × 8", "12 reps", "45 s"
//   a session:      "4 sets × 5 at 185 lb", "3 sets × 12 at 30 lb each", "3 sets × 12 reps",
//                   "3 sets × 45 s", "3 sets × 8 at +25 lb"
//   sets that vary: "185 lb × 12, 12, 10" (same weight), else each set "185 lb × 8 · 195 lb × 6"
//   a target:       "190 lb × 8 to 12"
// Table cells stay numeric columns (cellWords: "185 × 6"), weight first like the rest.
import type { Load } from '../db/types';
import { formatAmount, formatWeight, heldWeightOf, sameLoad } from './load';

export type SetLike = { reps?: number; seconds?: number; load?: Load };
type Loaded = { reps?: number; seconds?: number; load: Load };

const isTimed = (s: SetLike): boolean => s.load?.kind === 'timed' || (s.reps === undefined && s.seconds !== undefined);

/** The weight words of a load: "185 lb", "30 lb each", "+25 lb"; null for timed or plain bodyweight. */
export function weightWords(load: Load): string | null {
  if (load.kind === 'timed') return null;
  if (load.kind === 'bodyweight') return load.added ? `+${formatWeight(load.added, load.unit)}` : null;
  if (load.kind === 'dumbbell_each') return `${formatWeight(heldWeightOf(load)!, load.unit)} each`;
  return formatWeight(load.total, load.unit);
}

const repsWords = (n: number | string, count: number): string => `${n} ${count === 1 ? 'rep' : 'reps'}`;

/** One set, weight first: "185 lb × 6", "30 lb each × 12", "+25 lb × 8", "12 reps", "45 s". */
export function formatSet(set: SetLike): string {
  if (isTimed(set)) return `${set.seconds ?? 0} s`;
  const reps = set.reps ?? 0;
  const w = set.load ? weightWords(set.load) : null;
  return w === null ? repsWords(reps, reps) : `${w} × ${reps}`;
}

/** A target, weight first: "190 lb × 8 to 12", "30 lb each × 10", "13 reps", "45 s". */
export function formatTarget(load: Load, reps: number | readonly [number, number] | null, seconds?: number): string | null {
  if (load.kind === 'timed') return `${seconds ?? 0} s`;
  if (reps === null) return null;
  const r = typeof reps === 'number' ? `${reps}` : `${reps[0]} to ${reps[1]}`;
  const w = weightWords(load);
  return w === null ? `${r} reps` : `${w} × ${r}`;
}

/** Every set the same load, reps and hold (at least two): a session that reads "4 sets × 5 at 185 lb". */
export function sameSets(sets: readonly Loaded[]): boolean {
  const first = sets[0];
  return sets.length > 1 && !!first && sets.every((s) => sameLoad(s.load, first.load) && s.reps === first.reps && s.seconds === first.seconds);
}

/**
 * A session of one exercise: "4 sets × 5 at 185 lb" when every set was the same; "185 lb × 12,
 * 12, 10" when only the reps differ; else every set, "185 lb × 8 · 195 lb × 6". One set: formatSet.
 */
export function formatSession(sets: readonly Loaded[]): string {
  if (!sets.length) return '';
  const first = sets[0]!;
  if (sets.length === 1) return formatSet(first);
  const sameWeight = sets.every((s) => sameLoad(s.load, first.load));
  const same = sameSets(sets);
  const n = sets.length;
  if (same) {
    if (isTimed(first)) return `${n} sets × ${first.seconds ?? 0} s`;
    const w = weightWords(first.load);
    return w === null ? `${n} sets × ${repsWords(first.reps ?? 0, first.reps ?? 0)}` : `${n} sets × ${first.reps ?? 0} at ${w}`;
  }
  if (sameWeight && !sets.some(isTimed)) {
    const w = weightWords(first.load);
    const reps = sets.map((s) => s.reps ?? 0).join(', ');
    return w === null ? `${reps} reps` : `${w} × ${reps}`;
  }
  if (sets.every(isTimed)) return sets.map((s) => `${s.seconds ?? 0} s`).join(' · ');
  return sets.map(formatSet).join(' · ');
}

/**
 * A numeric table cell (the LAST TIME column), weight first without the unit: "185 × 12",
 * "30 × 10", "+25 × 8", "12 reps", "45 s"; the unit only when it is not the column's.
 */
export function cellWords(s: Loaded, cellWeight: number | null, activeUnit?: Load['unit']): string {
  const unit = activeUnit && s.load.unit !== activeUnit ? ` ${s.load.unit}` : '';
  if (s.load.kind === 'timed') return `${s.seconds ?? 0} s`;
  const reps = s.reps ?? 0;
  if (s.load.kind === 'bodyweight') return s.load.added ? `+${formatAmount(s.load.added)}${unit} × ${reps}` : `${reps} reps`;
  return cellWeight === null ? `${reps}` : `${formatAmount(cellWeight)}${unit} × ${reps}`;
}
