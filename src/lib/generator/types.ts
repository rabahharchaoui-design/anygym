// The generator's inputs, its dependencies, the shipped JSON shape, and the working model.
import type { CardioFavoriteId, CardioId, ExperienceId, FocusId, GoalId, PlaceAnswer, StyleId } from '../intake/options';
import type { CardioMove } from '../cardio';
import type { Muscle, Profile } from '../order';
import type { GymKit } from '../picker';
import type { Candidate, Pattern, Requires, SwapData } from '../swap';
import type { GoalFamily, Range } from '../generatorRules';

/** Bump when the rules change what comes out: frozen plans and saved plans name the version that made them. */
export const GENERATOR_VERSION = 2;

export type GeneratorInput = {
  /** Main first, Also second (SPEC 14 step 1). None: stay fit. */
  goals: readonly GoalId[];
  experience?: ExperienceId;
  /** 2 to 6; anything else is 3. */
  days?: number;
  /** The time picked; 75 means 75+ (no upper end). */
  minutes?: number;
  focus?: readonly FocusId[];
  easyOn?: readonly string[];
  /** Exercise ids (plan or catalog ids). */
  love?: readonly string[];
  never?: readonly string[];
  style?: StyleId;
  cardio?: CardioId;
  cardioFavorites?: readonly CardioFavoriteId[];
  gym: GymKit;
  place?: PlaceAnswer;
  /** Frozen curated plans: their own id, name, summary and gym type. */
  meta?: { id: string; name: string; summary: string; gymType: string };
  /**
   * PLAN 3.5a: learned soft dislikes (Quick workout left swipes), by exercise id: a higher count ranks
   * the exercise lower among what fits, never out (never a ban).
   */
  soft?: Readonly<Record<string, number>>;
  /** PLAN 3.5a: muscles this workout must not train (Quick workout "Hit what's fresh"). */
  avoidMuscles?: readonly Muscle[];
  /** PLAN 3.5a round 2: a slot takes only its own pattern (a small moves day never falls back to a row). */
  noFallback?: true;
};

export type GeneratorDeps = {
  data: SwapData;
  /** The ordering profile of an exercise id (data/order.ts profileFor). */
  profile: (id: string) => Profile;
  /** The plain name of an exercise id. */
  name: (id: string) => string;
  /** PLAN 3.5a: only these may be picked (Quick workout: a sure demo). Missing: anything that fits. */
  usable?: (id: string) => boolean;
  /**
   * PLAN 3.5j: sure cardio moves (G approved them on this phone), best first, with the machine each
   * needs. A day may open with one as its warm up. Missing or empty: no cardio move, never a guess.
   */
  cardio?: () => readonly CardioMove[];
};

// ---------------------------------------------------------------- the shipped JSON shape

export type RawItem = { exercise: string; id: string; reps?: Range; seconds?: Range; eachSide?: true; note?: string };
export type RawSingle = { type: 'single'; sets: number; restSec: number; warmup?: true } & RawItem;
export type RawPair = { type: 'superset'; sets: number; restSec: number; items: RawItem[] };
export type RawFinisher = { name: string; minutes: number; requires: Requires };
export type RawDay = { n: number; name: string; blocks: Array<RawSingle | RawPair>; finisher?: RawFinisher };
export type RawPlan = {
  id: string;
  name: string;
  summary: string;
  gymType: string;
  goal: GoalFamily;
  level: 'beginner' | 'intermediate';
  daysPerWeek: number;
  source: string;
  generator: number;
  progressionMode: 'double';
  days: RawDay[];
};

/** What the generator did with the answers, so the reveal says only what is true. */
export type Applied = {
  main: GoalId;
  also: GoalId | null;
  /** The Also goal changed the plan. */
  alsoUsed: boolean;
  /** Extra weekly sets per focus area that stayed after the time trim (2 to 4 counts). */
  focus: Array<{ id: FocusId; sets: number }>;
  /** Focus areas asked for that nothing here could add to (or the time trim took away). */
  focusMissed: FocusId[];
  /** Loved exercises in the plan, and those that did not fit. */
  loved: string[];
  lovedMissed: string[];
  /** Never list entries the ladders know (all left out). */
  never: number;
  /** "Go easy on" joints applied. */
  easyOn: string[];
  /** Patterns a day wanted that nothing at this gym does (after fallbacks). */
  gaps: Pattern[];
  finisher: string | null;
  /** PLAN 3.5j: the sure cardio move each day opens with (missing: none). */
  warmUp?: string;
  /** Per day, the workout header's estimate. */
  minutes: number[];
  /** Some day is still over the time picked after the trim. */
  over: boolean;
  /** PLAN 3.5j: a strength plan kept its long rests, so a short time fits fewer than 5 lifts a day. */
  restKept?: boolean;
};

export type GeneratorResult =
  | { ok: true; plan: RawPlan; applied: Applied }
  | { ok: false; reason: string; dayName: string; moves: number; gaps: Pattern[] };

// ---------------------------------------------------------------- working model

export type Item = {
  id: string;
  key: string;
  candidate: Candidate;
  profile: Profile;
  pattern: Pattern;
  sets: number;
  /** Sets added for a focus area (all of them for a move the focus added). */
  extra: number;
  focus?: FocusId;
  reps?: Range;
  seconds?: Range;
  rest: number;
  note?: string;
};

export type Day = { name: string; items: Item[]; units: Item[][]; finisher?: RawFinisher; warmUp?: string };

export type Ctx = {
  input: GeneratorInput;
  deps: GeneratorDeps;
  main: GoalId;
  also: GoalId | null;
  family: GoalFamily;
  loveKeys: Set<string>;
  neverKeys: Set<string>;
  softOf: Map<string, number>;
  weekUsed: Map<Pattern, Set<string>>;
};
