// Progress toward a run's goal (SPEC 12.1 Distance and Time runs; PLAN 4.3). Pure. A free run has
// none. Words stay calm: what is left, then "Goal reached".
import type { DistanceUnit } from '../intake/answers';
import { formatElapsed } from '../timer';
import { formatDistanceLeft } from './format';
import type { RunGoal } from './live';

export type GoalProgress = {
  /** 0 to 1. */
  fraction: number;
  reached: boolean;
  /** "Goal 5 km", the quiet label. */
  label: string;
  /** "3.80 km to go", "12:40 to go", or "Goal reached". */
  line: string;
};

export const GOAL_REACHED = 'Goal reached';

export function goalProgress(goal: RunGoal | null, now: { distanceM: number; movingSec: number }, unit: DistanceUnit): GoalProgress | null {
  if (!goal) return null;
  const total = goal.kind === 'distance' ? goal.meters : goal.seconds;
  const done = goal.kind === 'distance' ? now.distanceM : now.movingSec;
  if (!(total > 0)) return null;
  // The same hair that formatDistance allows, so a goal of exactly 5 km is reached at "5.00".
  const reached = done >= total - 1e-6;
  const left = Math.max(0, total - done);
  // What is left is lifted to the next step shown, so it never reads 0 before the goal is reached.
  const line = reached ? GOAL_REACHED : goal.kind === 'distance' ? `${formatDistanceLeft(left, unit)} ${unit} to go` : `${formatElapsed(Math.ceil(left))} to go`;
  return { fraction: Math.min(1, Math.max(0, done / total)), reached, label: `Goal ${goal.label}`, line };
}
