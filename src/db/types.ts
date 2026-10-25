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
  /** "Not now" on the backup reminder: hidden until then (PLAN 1.8, additive). */
  backupSnoozeUntil?: number;
};

export type Plan = {
  id: string;
  name: string;
  source: 'curated' | 'generated';
  createdAt: number;
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
  /** The user's own note for this exercise (PLAN 1.7c). Stored on the every-gym record. */
  note?: string;
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
export type Submission = { id: string; sessionId: string; exerciseId: string; rev: number };

/**
 * A deleted set while its Undo can still happen (PLAN 1.7h): the record as it was deleted, when
 * the Undo window ends, and `undo` once an Undo was accepted but not yet written back.
 */
export type Tombstone = { id: string; sessionId: string; set: WorkoutSet; expiresAt: number; undo?: boolean };

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
};

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
