// The coach's shapes (SPEC 15, PLAN 3.8). Pure data: no Dexie, no React.
import type { Load, Unit } from '../../db/types';
import type { LoadSetup } from '../load';
import type { RepRange } from '../progression';
import type { Pattern } from '../swap';

/** The optional tap after the last set of an exercise (SPEC 15): Easy 3+ reps left, Good 1 to 2, Hard 0. */
export type Effort = 'easy' | 'good' | 'hard';
export const EFFORTS: readonly Effort[] = ['easy', 'good', 'hard'];
export const EFFORT_WORDS: Record<Effort, string> = { easy: 'Easy', good: 'Good', hard: 'Hard' };
/** What each tap means, in plain words (SPEC 13.1). */
export const EFFORT_HINT: Record<Effort, string> = { easy: '3+ reps left', good: '1 to 2 left', hard: 'Nothing left' };

/** How a lift progresses (SPEC 15): big leg lifts, upper body compounds, small (isolation) exercises. */
export type LiftClass = 'lower' | 'upper' | 'isolation';

/** One working set the coach reads: reps and the load as stored. */
export type CoachSet = { reps: number; load: Load };

/** One finished, dated workout of a lift: its working sets in order, the reps it asked for, the tap. */
export type LiftSession = {
  sessionId: string;
  /** The workout's start time. */
  date: number;
  sets: CoachSet[];
  /** The rep range that workout asked for (plan day, built Quick workout, quick default); null: not known. */
  range: RepRange | null;
  effort?: Effort;
};

/** Where a coach target came from. 'hold' (PLAN 3.5g): Not now on the Level up card keeps last week's weight. */
export type TargetSource = 'level_up' | 'auto' | 'deload' | 'welcome_back' | 'plateau' | 'hold';

/**
 * A coach decision for one lift (stored per lift): the weight to use next, in the unit it was made
 * for, and why. It wins over SPEC 6's Next until it is used (a workout of the lift after `setAt`)
 * or, with `until`, until then (a lighter week).
 */
export type CoachTarget = {
  /** The picked weight (load.ts pickedWeight): bar total, one dumbbell, the pin, the added weight. */
  value: number;
  unit: Unit;
  loadKind: Load['kind'];
  reason: string;
  source: TargetSource;
  setAt: number;
  until?: number;
  /** A lighter week: one set fewer on each plan day exercise it covers. */
  fewerSets?: boolean;
  /** Which end of the rep range the rows start at: a raise starts low, a reset aims high. */
  reps?: 'low' | 'high';
};

/** One lift as the coach sees it. `key` is liftKey(); sessions are newest first. */
export type Lift = {
  key: string;
  exerciseId: string;
  name: string;
  loadKind: Load['kind'];
  pattern: Pattern | null;
  /** What this lift can load at the active gym; null when it cannot be loaded here. */
  setup: LoadSetup | null;
  sessions: LiftSession[];
  target?: CoachTarget;
  /**
   * What earlier raises taught this lift, stored durably (db coachLifts learned.scale, Codex 3.8 #3):
   * the product of every resolved outcome's factor. Raises not resolved yet are judged on top.
   */
  scale?: number;
  /** A close variation this gym can do, for a plateau (only for a slot of the plan in use). */
  variation?: { id: string; name: string; slot: string; planId: string };
};

/** A change the coach proposes or made: one lift, old → new, and the one line why. */
export type PlannedChange = {
  key: string;
  exerciseId: string;
  name: string;
  loadKind: Load['kind'];
  unit: Unit;
  from: number;
  /** What the lifter really used (pin + added weight), for showing old → new. Absent: `from`. */
  fromTotal?: number;
  to: number;
  reason: string;
  source: TargetSource;
  until?: number;
  fewerSets?: boolean;
  reps?: 'low' | 'high';
};

/** A change as stored (coachChanges), with what it replaced so Undo can put it back. */
export type ChangeRecord = PlannedChange & {
  id: string;
  /** The card it came from (`levelup:2026-11-02`), so the card knows it was used. */
  cardId: string;
  weekKey: string;
  appliedAt: number;
  undoneAt?: number;
  prevTarget?: CoachTarget | null;
  /** Codex 3.8 #3: how the first workout at the raised weight went, judged once and stored. */
  outcome?: 'miss' | 'good' | 'easy';
};

/** A lift that held its weight this week, and why, in one line. */
export type Hold = { key: string; exerciseId: string; name: string; reason: string };
