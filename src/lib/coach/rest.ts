// Rest timer defaults by goal and exercise (SPEC 15). Used only when neither the user nor the plan
// gave a rest: the user's own pick always wins, then a rest the plan states.
import type { LiftClass } from './types';

/** Seconds of rest after a set: big lifts, then small exercises, per intake goal (SPEC 14 ids). */
export const REST_BY_GOAL: Readonly<Record<string, { compound: number; isolation: number }>> = {
  strength: { compound: 180, isolation: 90 },
  muscle: { compound: 120, isolation: 75 },
  athletic: { compound: 120, isolation: 75 },
  comeback: { compound: 120, isolation: 75 },
  health: { compound: 90, isolation: 60 },
  tone: { compound: 75, isolation: 60 },
  fat_loss: { compound: 75, isolation: 45 },
  race: { compound: 75, isolation: 45 },
};

/** The coach's rest for this goal and lift, or null when either is not known (the 90 s default stays). */
export function coachRest(goal: string | undefined, cls: LiftClass | null): number | null {
  const r = goal ? REST_BY_GOAL[goal] : undefined;
  if (!r || !cls) return null;
  return cls === 'isolation' ? r.isolation : r.compound;
}
