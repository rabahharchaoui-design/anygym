import type { DistanceUnit, IntakeAnswers, MeasureUnit } from '../lib/intake/funnel';
import type { DayTrim } from '../lib/timeBudget';
// Stored record shapes (SPEC 2, 3, 5.3, 5.5, 12.11). Every id is a string.

export type Unit = 'lb' | 'kg';
export type GymType = 'full' | 'hotel' | 'home' | 'none';

/** SPEC 3 equipment picker items, in picker order. */
export const EQUIPMENT_IDS = [
  'barbell_rack',
  'flat_bench',
  'adjustable_bench',
  'dumbbells',
  'kettlebells',
  'cable_station',
  'smith_machine',
  'leg_press',
  'leg_extension',
  'leg_curl',
  'chest_press_machine',
  'pec_deck',
  'lat_pulldown',
  'seated_row',
  'shoulder_press_machine',
  'calf_raise_machine',
  'hip_adductor_abductor',
  'hyperextension_bench',
  'pull_up_bar',
  'dip_station',
  'resistance_bands',
  'ez_curl_bar',
  'treadmill',
  'bike',
  'stair_climber',
  'rower',
  'jump_rope',
  // PLAN 3.5j (G's Guam hotel gym): added last so every saved list keeps its order.
  'elliptical',
  'yoga_mat',
] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];

/** Dumbbell range in the gym's unit. */
export type DumbbellRange = { min: number; max: number; step: number };

/** Bar weights in the gym's unit. `null` = unknown until the user answers the first use prompt. */
export type Bars = {
  olympic: number | null;
  womens: number | null;
  ez_curl: number | null;
  trap: number | null;
  /** 0 means "count plates only". */
  smith: number | null;
};
export type BarId = keyof Bars;

/**
 * Per machine weight answers, keyed by machine id (e.g. 'leg_press').
 * A missing key or `value: null` means unknown; never guess.
 */
export type EquipmentWeight = {
  /** 'bar_weight': Smith, EZ curl or trap bar weight (mirrored into `bars`). */
  kind: 'plates_only' | 'starting_resistance' | 'stack_step' | 'bar_weight';
  value: number | null;
};

export type PlateToggle = { weight: number; enabled: boolean };
export type Collars = 'none' | 'competition';
export type PlateColors = 'black' | 'color';

export type Gym = {
  id: string;
  name: string;
  type: GymType;
  unit: Unit;
  equipment: EquipmentId[];
  /** null when the gym has no dumbbells. */
  dumbbellRange: DumbbellRange | null;
  bars: Bars;
  /** Default stack step for stack machines and cables (SPEC 5.3: 5 lb / 2.5 kg). Per machine 'stack_step' entries override it. */
  stackStep: number;
  equipmentWeights: Record<string, EquipmentWeight>;
  plateInventory: PlateToggle[];
  collars: Collars;
  plateColors: PlateColors;
  isActive: boolean;
  createdAt: number;
  /** PLAN 3.9 (additive, not indexed): the town, typed by the user ("Tokyo"). Missing: none given. */
  city?: string;
  /** PLAN 3.9 (additive, not indexed): when this gym was last made the active one, for "recent gyms". */
  lastUsedAt?: number;
  /** PLAN 3.6 (additive, not indexed): the last "How much time today?" pick at this gym (SPEC 7.4). */
  timeBudgetMin?: number;
};

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
};

/** PLAN 3.5a: the targets Quick workout built for one exercise (a range or a number, like a plan's). */
export type QuickTarget = {
  sets: number;
  reps?: [number, number] | number;
  seconds?: [number, number] | number;
  restSec: number;
  /** PLAN 3.5b: done back to back with others: its group, its place in it, the group's size (2: a superset, 3+: a circuit). */
  pair?: { group: number; index: number; size: number };
};

export type Plan = {
  id: string;
  name: string;
  source: 'curated' | 'generated';
  createdAt: number;
  /**
   * PLAN 3.5 (additive, no index): a generated plan's whole definition, in the shipped plan JSON shape
   * (lib/generator.ts RawPlan). Never changed after it is saved: a rebuild saves a new plan, so a
   * past workout always finds the plan it was started from.
   */
  definition?: Record<string, unknown>;
};

export type PlanDay = {
  id: string;
  planId: string;
  order: number;
  name: string;
};

export type Session = {
  id: string;
  gymId: string;
  planId?: string;
  dayId?: string;
  startedAt: number;
  endedAt?: number;
  timeBudgetMin?: number;
  imported: boolean;
  /** Imported workouts (SPEC 9.3): the file order. startedAt then holds the same number, never a date. */
  importSeq?: number;
  /** Imported workouts: content hash of the file session, so importing a file twice adds nothing. Not indexed. */
  importHash?: string;
  /** Imported workouts: the file's note for that session. */
  note?: string;
  /** Exercises in the workout, in order: added by hand (quick workout) or the plan day's (PLAN 1.10). Not indexed. */
  exerciseIds?: string[];
  /** weekly_table plans: the 0 based week this day was started in, so a reload shows the same targets. */
  weekIndex?: number;
  /**
   * PLAN 2.2d round 2: rows added (+) or removed (−) per exercise, as the workout ended (Finish), so
   * the finish lines, the finished count and the plan's 60% rule use the rows the lifter really had.
   * Additive, not indexed; missing = the plan's sets.
   */
  rowAdjust?: Record<string, number>;
  /** PLAN 3.4a (additive, not indexed): the rest Up next suggested for an exercise it added (SPEC 22 rule 6), by exercise id. */
  suggestedRest?: Record<string, number>;
  /**
   * PLAN 3.4: what this workout does instead of the plan, one record per changed slot. Additive, not
   * indexed; missing = the plan as written. Sets always keep the exercise really performed.
   */
  swaps?: SessionSwap[];
  /**
   * PLAN 3.6 (SPEC 7.4, additive, not indexed): what the time budget left out of the plan day for this
   * workout only (lib/timeBudget.ts DayTrim), with the minutes picked in timeBudgetMin. Missing = the
   * day as planned. The plan and its JSON are never changed; logged sets are never touched.
   */
  trim?: DayTrim;
  /**
   * PLAN 3.5a (additive, not indexed): a built Quick workout's targets per exercise id (sets, reps or
   * hold, rest), so the list shows exactly what the deck showed. Missing: the quick defaults.
   */
  targets?: Record<string, QuickTarget>;
  /** PLAN 3.5b (additive, not indexed): the Quick workout card this started from (fresh or a style id), for the rotation. */
  quickStyle?: string;
};

/**
 * One changed slot of a workout (PLAN 3.4, SPEC 7.2). `slot` is the exercise the slot started with;
 * `current` is the one being done now. `kept` are earlier members with logged sets: they stay as their
 * own rows, under their own id, and their sets count toward the slot's total.
 */
export type SessionSwap = {
  slot: string;
  current: string;
  kept?: string[];
  /** Picked by the engine because the gym lacks the gear. */
  auto?: boolean;
  /** From the user's "Always use this" for this plan. */
  always?: boolean;
  /** Why, in plain words: "no cable here". */
  reason?: string;
  /** Nothing this gym can do fits: `current` is the slot itself and the row can be skipped. */
  noFit?: boolean;
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
};

/** Gym id used for answers that hold at every gym (free weights). IndexedDB keys cannot be null. */
export const ANY_GYM = '';

/**
 * How an exercise is loaded, answered once by the user (PLAN 1.7). Free weight answers hold at
 * every gym (gymId ANY_GYM); stack and plate machine answers are per gym.
 */
export type ExerciseSetting = {
  exerciseId: string;
  gymId: string;
  /** How it is loaded. Missing on a record that only holds a bar choice. */
  loadType?: Load['kind'];
  /** Barbell exercises: the bar picked at this gym (PLAN 1.10d). Missing = the name rule. */
  barId?: BarId;
  /** Rest after each set in seconds, set by the user from the exercise menu (PLAN 1.7c). Stored on the every-gym record. */
  restSec?: number;
  /**
   * Rest timer Off for this exercise (PLAN 2.2d, Hevy research item 2): logging a set starts no
   * countdown, so a superset pair goes back to back. Additive, not indexed; restSec is kept for
   * when it is turned back on. Stored on the every-gym record.
   */
  restOff?: boolean;
  /** The user's own note for this exercise (PLAN 1.7c). Stored on the every-gym record. */
  note?: string;
  /**
   * "Always use this" (PLAN 3.4): plan id → the exercise done in this exercise's place in that plan.
   * Additive, not indexed; the plan's JSON never changes. Stored on the every-gym record.
   */
  alwaysUse?: Record<string, string>;
};

/**
 * SPEC 5.5. Stored in the unit it was entered in; never converted on save. `barId` (PLAN 1.7c,
 * additive, barbell only): which bar it was lifted on, so Smith machine sets never mix with free
 * bar history. Older records without it count as the exercise's default bar. `collars` (PLAN 1.7f,
 * additive, barbell and plate machine): the total collar weight in the load's unit; older records
 * recover it with collarsOf in load.ts.
 */
export type Load = {
  kind: 'barbell' | 'dumbbell_each' | 'single' | 'stack' | 'plate_machine' | 'bodyweight' | 'timed';
  unit: Unit;
  total: number;
  barWeight?: number;
  barId?: BarId;
  /**
   * PLAN 2.0c (additive, barbell only): an older set without a barId whose bar could not be told
   * from its stored evidence when its gym's bars or unit changed. It stays out of every equipment
   * comparison (history, LAST TIME, targets, records) until a bar is picked for it explicitly.
   */
  legacyBarUnresolved?: true;
  perSide?: number[];
  collars?: number;
  stackValue?: number;
  added?: number;
};

/** Next free set order of a workout (PLAN 1.10c): one past the highest order ever used, never lowered. */
export type OrderCounter = { sessionId: string; next: number };

export type SetKind = 'warmup' | 'work' | 'drop';

/**
 * A Log set write that committed (PLAN 1.7h), stored in the set's own transaction: `id` is the set
 * id (the pending row's id), `rev` the draft version that was submitted.
 */
export type Submission = {
  id: string;
  sessionId: string;
  exerciseId: string;
  rev: number;
  /**
   * PLAN 2.0l (additive, not indexed): the fingerprint of what this write saved (lib/submission.ts),
   * so a second write under the same id and revision with other values is told apart. Receipts
   * from before 2.0l have none.
   */
  fp?: string;
};

/**
 * A Log set write that started and has not committed (PLAN 1.7i, schema v8): the submitted row's
 * id, its draft key, the version submitted and the row's complete values (a lib/drafts.ts Draft).
 */
/**
 * A failed (or still running) change to a logged set (PLAN 2.0c): an Edit set save or a set type
 * change, with the values it writes. Journaled before the write like a Log set, so a failure that
 * outlives a restart still blocks Finish until it is retried or given up (db/mutations.ts).
 */
export type MutationIntent =
  | { kind: 'edit'; setId: string; change: { reps?: number; seconds?: number; load: Load } }
  | { kind: 'type'; setId: string; setKind: SetKind; failure: boolean };

/**
 * A pending write (PLAN 1.7i): a Log set (its draft), or with `mutation` (PLAN 2.0c, additive,
 * not indexed) a change to a logged set; its draft is then just `{ id, load: null }`.
 */
export type JournalEntry = {
  id: string;
  sessionId: string;
  exerciseId: string;
  key: string;
  rev: number;
  draft: Record<string, unknown>;
  at: number;
  mutation?: MutationIntent;
  /**
   * PLAN 2.0k (additive, not indexed): the held copies (ids `mem:...`) of the same set and kind this
   * change supersedes, registered before it, stored with the entry in the journal write's own
   * transaction so every apply and Retry writes their receipts, also after a failed apply or a restart.
   */
  covers?: string[];
};
// PLAN 2.0e: a change's id is `mut:<kind>:<setId>:<rev>`, one per operation, `rev` allocated in the
// journal write's own transaction; `mut:<kind>:<setId>` (before 2.0e) reads as revision 0.

/**
 * A deleted set while its Undo can still happen (PLAN 1.7h): the record as it was deleted, when
 * the Undo window ends, and `undo` once an Undo was accepted but not yet written back.
 */
export type Tombstone = {
  id: string;
  sessionId: string;
  set: WorkoutSet;
  expiresAt: number;
  undo?: boolean;
  /**
   * This deletion's own identity (PLAN 2.0e, additive, not indexed): a new one each time the set is
   * deleted. A restore that read an older tombstone only lands while this still matches.
   */
  token?: string;
};

export type WorkoutSet = {
  id: string;
  sessionId: string;
  exerciseId: string;
  order: number;
  kind: SetKind;
  reps?: number;
  seconds?: number;
  load?: Load;
  rpe?: number;
  note?: string;
  uncertain: boolean;
  /** Set type F (PLAN 1.7c): a work set taken to failure. Not indexed. */
  failure?: boolean;
  /** Imported sets (PLAN 3.2, additive, not indexed): the file's name and its catalog match. Older imports have none. */
  importMap?: ImportMapping;
  /**
   * PLAN 3.9 (additive, not indexed): the gym this set was lifted at, written only when its workout
   * moved to another gym after it was logged. Missing: its workout's gym (every older set).
   */
  gymId?: string;
};

/**
 * How an imported exercise was matched (PLAN 3.2, SPEC 4.3): the file's own name, the catalog id
 * and match kind it was written with (none: no catalog exercise, never a guess), and whether the
 * app matched it by name or the user picked it on the review screen.
 */
export type ImportMapping = { fileName: string; catalogId: string | null; match: 'exact' | 'variant' | 'none'; by: 'name' | 'you' };

/** [lat, lng, t (ms), accuracy (m)] */
export type RunPoint = [number, number, number, number];

export type Run = {
  id: string;
  startedAt: number;
  endedAt?: number;
  type: string;
  goal?: string;
  movingSec: number;
  elapsedSec: number;
  distanceM: number;
  points: RunPoint[];
  gaps: Array<[number, number]>;
  splits: number[];
  city?: string;
  country?: string;
  ghostOfRunId?: string;
  intervalPreset?: string;
};
