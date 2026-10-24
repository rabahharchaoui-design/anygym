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
  importSeq?: number;
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
  loadType: Load['kind'];
};

/** SPEC 5.5. Stored in the unit it was entered in; never converted on save. */
export type Load = {
  kind: 'barbell' | 'dumbbell_each' | 'single' | 'stack' | 'plate_machine' | 'bodyweight' | 'timed';
  unit: Unit;
  total: number;
  barWeight?: number;
  perSide?: number[];
  stackValue?: number;
  added?: number;
};

export type SetKind = 'warmup' | 'work' | 'drop';

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
