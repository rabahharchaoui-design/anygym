// Learn from outcomes (SPEC 15): what happened the first time a raised weight was lifted. A raise
// followed by missed reps halves the lift's next raise; one done with reps to spare (Easy) grows it
// a little. Worked out again from the stored raises and the logged workouts every time, so it can
// never drift from what really happened; the result is also kept on the lift's row (db/coach.ts).
import { weightChange } from '../load';
import { lastPicked, missedCount } from './sets';
import type { ChangeRecord, Lift } from './types';

export type Outcome = 'miss' | 'good' | 'easy';

export const MISS_FACTOR = 0.5;
export const EASY_FACTOR = 1.25;
export const SCALE_MIN = 0.25;
export const SCALE_MAX = 2;

/** Raises the coach made for weight (not lighter weeks): the ones it learns from. */
const isRaise = (c: Pick<ChangeRecord, 'source' | 'undoneAt'>) => (c.source === 'level_up' || c.source === 'auto') && c.undoneAt === undefined;

/** The first workout of the lift at the raised weight after the raise, and how it went; null when it has not happened. */
export function judgeRaise(change: Pick<ChangeRecord, 'appliedAt' | 'to' | 'unit'>, lift: Pick<Lift, 'sessions'>): Outcome | null {
  const after = [...lift.sessions].filter((s) => s.date > change.appliedAt).sort((a, b) => a.date - b.date);
  for (const s of after) {
    const at = lastPicked(s);
    if (!at || at.unit !== change.unit) continue;
    if (Math.abs(weightChange(change.to, at.value)) > 0.01) continue;
    if (missedCount(s.sets, s.range) > 0) return 'miss';
    return s.effort === 'easy' ? 'easy' : 'good';
  }
  return null;
}

/** The factor one outcome applies to the lift's next raises. */
export const factorOf = (o: Outcome): number => (o === 'miss' ? MISS_FACTOR : o === 'easy' ? EASY_FACTOR : 1);

export const clampScale = (x: number): number => Math.min(SCALE_MAX, Math.max(SCALE_MIN, x));

/**
 * What the lift learned (Codex 3.8 #3): its stored scale (every outcome already resolved and kept on
 * the lift row, however old), times the factor of each raise judged now but not stored yet; within
 * 0.25 to 2. Resolved raises are never judged again, so a miss that left the session window still counts.
 */
export function learnedScale(lift: Pick<Lift, 'key' | 'sessions' | 'scale'>, changes: readonly ChangeRecord[]): number {
  let scale = lift.scale ?? 1;
  const mine = changes.filter((c) => c.key === lift.key && isRaise(c) && c.outcome === undefined).sort((a, b) => a.appliedAt - b.appliedAt);
  for (const c of mine) {
    const o = judgeRaise(c, lift);
    if (o) scale *= factorOf(o);
  }
  return clampScale(scale);
}

/** Raises whose outcome can be judged now and is not stored yet: to resolve once (db/coach.ts resolveOutcomes). */
export function newOutcomes(lifts: readonly Pick<Lift, 'key' | 'sessions'>[], changes: readonly ChangeRecord[]): Array<{ id: string; key: string; outcome: Outcome }> {
  const out: Array<{ id: string; key: string; outcome: Outcome }> = [];
  const byKey = new Map(lifts.map((l) => [l.key, l]));
  for (const c of [...changes].sort((a, b) => a.appliedAt - b.appliedAt)) {
    if (!isRaise(c) || c.outcome !== undefined) continue;
    const lift = byKey.get(c.key);
    const o = lift ? judgeRaise(c, lift) : null;
    if (o) out.push({ id: c.id, key: c.key, outcome: o });
  }
  return out;
}
