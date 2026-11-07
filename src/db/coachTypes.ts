// Stored coach rows (schema v10, PLAN 3.8). The engine's own shapes are in lib/coach/types.ts.
import type { CoachTarget, Effort } from '../lib/coach/types';

/** One lift (lib/coach liftKey): the coach's target and what it learned. Internal numbers are never shown. */
export type CoachLiftRow = {
  key: string;
  exerciseId: string;
  target?: CoachTarget;
  /** What the engine knew when it last changed this lift (SPEC 15: stored per lift). */
  learned?: { estimate: number | null; rate: number | null; scale: number; at: number };
  updatedAt: number;
};

/** A Today coach card the user answered: 'dismissed' (Not now) or 'used' (its action ran). */
export type CoachCardRow = { id: string; state: 'dismissed' | 'used'; at: number };

/** The Easy / Good / Hard tap after the last set of an exercise in one workout. */
export type EffortRow = { sessionId: string; exerciseId: string; effort: Effort; at: number };
