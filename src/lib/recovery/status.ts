// PLAN Q1 (SPEC 20.3): which targets are fresh, which are recent (with the real fact from the log)
// and which get a Recommended tag. Pure: targets come in as their primary groups, the log as
// lastTrainedGroups' result. No history: no claim at all.
import { daysSince } from '../quickWhy';
import { type RecoveryGroup, windowMs } from './groups';
import type { GroupTraining } from './trained';

/** At most this many Recommended tags in one menu. */
export const MAX_RECOMMENDED = 2;

/** A target as recovery sees it: an id and the groups it mainly trains. */
export type RecoveryTarget<Id extends string = string> = { id: Id; groups: readonly RecoveryGroup[] };

/**
 * 'unknown': nothing in the log trained any group, so nothing is said. 'fresh': every primary group
 * is outside its window. 'recent': at least one is inside it (dimmed, never blocked).
 */
export type RecoveryState = 'unknown' | 'fresh' | 'recent';

export type TargetRecovery<Id extends string = string> = {
  id: Id;
  state: RecoveryState;
  recommended: boolean;
  /** Recent only: "Trained today", "Trained yesterday", "Trained 2 days ago". */
  fact: string | null;
  /** With history: ms since its least rested group was trained (Infinity: none of its groups in the log). */
  restedMs: number | null;
};

export const hasHistory = (trained: GroupTraining): boolean => Object.values(trained).some((t) => t !== undefined);

/** Outside its window: never trained in the log, or trained at least the window ago. */
export const isRested = (g: RecoveryGroup, trained: GroupTraining, now: number): boolean => {
  const at = trained[g];
  return at === undefined || now - at >= windowMs(g);
};

/** The plain fact for a workout at `at`, counted in the phone's local days. */
export function trainedFact(at: number, now: number): string {
  const days = daysSince(at, now);
  if (days === 0) return 'Trained today';
  if (days === 1) return 'Trained yesterday';
  return `Trained ${days} days ago`;
}

function stateOf<Id extends string>(t: RecoveryTarget<Id>, trained: GroupTraining, now: number): TargetRecovery<Id> {
  const restedMs = Math.min(...t.groups.map((g) => (trained[g] === undefined ? Infinity : now - trained[g]!)));
  const inside = t.groups.filter((g) => !isRested(g, trained, now));
  if (!inside.length) return { id: t.id, state: 'fresh', recommended: false, fact: null, restedMs };
  const latest = Math.max(...inside.map((g) => trained[g]!));
  return { id: t.id, state: 'recent', recommended: false, fact: trainedFact(latest, now), restedMs };
}

/**
 * Each target's recovery, in the order given. With history, the fresh targets rested longest get the
 * Recommended tag (at most MAX_RECOMMENDED; ties keep the order given). No history: all 'unknown'.
 */
export function targetRecovery<Id extends string>(targets: readonly RecoveryTarget<Id>[], trained: GroupTraining, now: number): TargetRecovery<Id>[] {
  if (!hasHistory(trained)) return targets.map((t) => ({ id: t.id, state: 'unknown', recommended: false, fact: null, restedMs: null }));
  const out = targets.map((t) => stateOf(t, trained, now));
  const fresh = out.map((r, i) => ({ r, i })).filter(({ r }) => r.state === 'fresh');
  fresh.sort((a, b) => (a.r.restedMs === b.r.restedMs ? 0 : b.r.restedMs! - a.r.restedMs!) || a.i - b.i);
  for (const { r } of fresh.slice(0, MAX_RECOMMENDED)) r.recommended = true;
  return out;
}
