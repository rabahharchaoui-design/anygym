// A coach decision on the exercise screen (SPEC 15): when the coach has a target for a lift, it
// wins over SPEC 6's Next, with the coach's one line reason. Without one, SPEC 6 stays as it is.
import type { Load, Unit } from '../../db/types';
import type { Progression, RepRange, RepTarget, SetTarget } from '../progression';
import type { CoachTarget, PlannedChange } from './types';

/**
 * Whether a stored target still applies: same unit and load kind as today, and either within its
 * week (`until`) or not used yet (no workout of the lift since it was set).
 */
export function targetActive(t: CoachTarget | undefined, lastWorkout: number | undefined, now: number, unit: Unit, loadKind: Load['kind']): t is CoachTarget {
  if (!t || t.unit !== unit || t.loadKind !== loadKind) return false;
  if (t.until !== undefined) return now < t.until;
  return lastWorkout === undefined || lastWorkout < t.setAt;
}

/** The target a planned change stores. */
export function targetOf(c: PlannedChange, at: number): CoachTarget {
  const t: CoachTarget = { value: c.to, unit: c.unit, loadKind: c.loadKind, reason: c.reason, source: c.source, setAt: at };
  if (c.until !== undefined) t.until = c.until;
  if (c.fewerSets) t.fewerSets = true;
  if (c.reps) t.reps = c.reps;
  return t;
}

/**
 * SPEC 6's progression with the coach's target on top: every row at the target's load (made by
 * load.ts loadAt at today's gym, `load`), the reps at the low or high end of the range (a weekly
 * table's prescription wins), and Next says the coach's reason.
 */
export function withTarget(p: Progression, t: CoachTarget, load: Load, range: RepRange | null, prescription?: { sets: number; reps: RepTarget }): Progression {
  const fixed = prescription && typeof prescription.reps === 'number' ? prescription.reps : undefined;
  const rowReps = fixed ?? (range ? (t.reps === 'high' ? range[1] : range[0]) : undefined);
  const rows = p.perSet.length || prescription?.sets || p.lastTime?.sets.length || 0;
  const target = (): SetTarget => ({ load, ...(rowReps !== undefined ? { reps: rowReps } : {}) });
  const perSet = p.perSet.length ? p.perSet.map((r) => ({ ...r, target: target() })) : Array.from({ length: rows }, () => ({ target: target() }));
  return {
    lastTime: p.lastTime,
    next: { load, reps: prescription?.reps ?? range ?? rowReps ?? p.next.reps, reason: t.reason, kind: 'coach', ...(t.source === 'hold' ? { held: true as const } : {}) },
    perSet,
  };
}
