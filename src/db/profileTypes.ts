// Profile preferences and the active plan pointer. Optional additions need no new index.
import type { DistanceUnit, IntakeAnswers, MeasureUnit } from '../lib/intake/answers';
import type { Unit } from './types';

export type Profile = {
  id: string;
  name?: string;
  goal?: string;
  level?: string;
  daysPerWeek?: number;
  defaultUnit: Unit;
  createdAt: number;
  /** When the last backup was handed to the share sheet or saved (PLAN 1.8, additive). */
  lastBackupAt?: number;
  /** Ids of the finished workouts in the last successful backup (ids only), for "N workouts are only on this phone". */
  backedUpSessionIds?: string[];
  /** "Not now" on the backup reminder: hidden until then (PLAN 1.8, additive). */
  backupSnoozeUntil?: number;
  /** PLAN 3.3 (additive): when the intake funnel was finished. Set: the funnel never opens on its own again. */
  intakeDoneAt?: number;
  /** PLAN 3.3 (additive): every intake answer as given (lib/intake/funnel.ts); skipped ones are absent. */
  intake?: IntakeAnswers;
  /** PLAN 3.3 (additive): distance unit for runs (km or mi). */
  distanceUnit?: DistanceUnit;
  /** PLAN 3.3 (additive): unit for body measurements (cm or in). */
  measureUnit?: MeasureUnit;
  /**
   * PLAN 3.5a (additive, not indexed): learned soft dislikes from Quick workout. `soft`: left swipes
   * per exercise id (ranked lower later, never a ban); `never`: "Never show me this". History is never touched.
   */
  dislikes?: { soft?: Record<string, number>; never?: string[] };
  /**
   * PLAN 3.8 (additive, not indexed): the coach's settings. `autoLevelUp`: Settings → Coach → Auto
   * level up (SPEC 15, off by default). `autoIntroAt`: when its first time example sheet was shown.
   */
  coach?: { autoLevelUp?: boolean; autoIntroAt?: number };
  /** PLAN 3.5b (additive, not indexed): the Quick workout cards shown last time (plan, fresh or a style id), for the rotation. */
  /** PLAN 3.5j round 2: `prev` is the memory the cards of `shown` were chosen with and `at` when: a visit soon after sees the same cards. */
  quickIdeas?: { shown?: string[]; prev?: string[]; at?: number };
  /**
   * PLAN 3.5u (additive, not indexed): the first visit welcome on Today. `pending`: the intake was
   * just finished, show it once; `done`: finished or skipped. Absent (everyone from before 3.5u, and
   * a restored older backup): never shown.
   */
  welcomeTour?: 'pending' | 'done';
  weeklySchedule?: import('../lib/plan/schedule').WeeklySchedule;
};

/** Where the user is in their curated plan (PLAN 1.10). One row with id 'active'. */
export type PlanState = {
  id: 'active';
  planId: string;
  startedAt: number;
  /** weekly_table plans: 0 based week; stays on the last week after the table ends. 0 otherwise. */
  weekIndex: number;
  /** 0 based index of the day to do next. */
  nextDayIndex: number;
  /** Days finished in this pass through the plan (0 based), for the week strip checks. */
  doneDays: number[];
  /**
   * Days finished with exercises left in this pass (day index → share of planned sets done, 0 to
   * 1), drawn as a partial ring on the week strip. Cleared when the pass starts over.
   */
  partial?: Record<number, number>;
  pendingDayIndices?: number[];
};

