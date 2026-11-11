// The plan generator's rules (PLAN 3.5, SPEC 7.3, 15, 22). Plain data and small pure functions: the
// split per days per week, the slots of each day (movement patterns, most important first), what a
// goal and a level prescribe, and what a focus area means. The generator (generator.ts) reads them.
import type { Muscle } from './order';
import type { Pattern } from './swap';
import type { ExperienceId, FocusId, GoalId } from './intake/options';

// ---------------------------------------------------------------- goals

/** The five prescription families of SPEC 7.3. */
export type GoalFamily = 'muscle' | 'strength' | 'fat_loss' | 'health' | 'athletic';

/**
 * The intake has eight goals; SPEC 7.3 prescribes five. Tone up trains like muscle, stay healthy
 * like stay fit; a race and a comeback train like stay fit too (a race adds easy cardio, a comeback
 * keeps the sets low, see ALSO and setsFor).
 */
export const FAMILY_OF: Record<GoalId, GoalFamily> = {
  muscle: 'muscle',
  tone: 'muscle',
  strength: 'strength',
  fat_loss: 'fat_loss',
  health: 'health',
  race: 'health',
  comeback: 'health',
  athletic: 'athletic',
};

export type Range = [number, number];

/** SPEC 7.3 per family: reps for compounds and for everything else, and the accessory rest. */
export type Prescription = {
  compoundReps: Range;
  accessoryReps: Range;
  /** Rest after an accessory set (isolation, calves, abs). */
  accessoryRest: number;
  /** The least rest after a compound; SPEC 22 rule 6 (restFor) raises it for heavy lifts, never lowers it. */
  compoundRest: number;
};

export const PRESCRIPTION: Record<GoalFamily, Prescription> = {
  muscle: { compoundReps: [8, 12], accessoryReps: [10, 15], accessoryRest: 60, compoundRest: 90 },
  strength: { compoundReps: [4, 6], accessoryReps: [8, 10], accessoryRest: 90, compoundRest: 150 },
  fat_loss: { compoundReps: [10, 15], accessoryReps: [10, 15], accessoryRest: 45, compoundRest: 45 },
  health: { compoundReps: [8, 12], accessoryReps: [8, 12], accessoryRest: 75, compoundRest: 75 },
  athletic: { compoundReps: [5, 8], accessoryReps: [8, 12], accessoryRest: 75, compoundRest: 90 },
};

/** A hold (plank) in seconds: beginners hold less. */
export const HOLD: Range = [30, 45];
export const HOLD_NEW: Range = [20, 30];

/** SPEC 7.3 sets: new 2 to 3 (3 on compounds, 2 on the rest), under 2 years 3, 2+ years 3 to 4 (4 on compounds). */
export function setsFor(experience: ExperienceId | undefined, compound: boolean, comeback: boolean): number {
  const sets = experience === 'new' ? (compound ? 3 : 2) : experience === '3y' ? (compound ? 4 : 3) : 3;
  return comeback ? Math.min(sets, 3) : sets;
}

/** SPEC 7.3 as a ceiling: no move in a plan ever gets more sets than this (new 3, under 2 years 3, 2+ years 4, a comeback 3). */
export function maxSetsFor(experience: ExperienceId | undefined, comeback: boolean): number {
  return setsFor(experience, true, comeback);
}

/** SPEC 22 rule 8: new lifters (and anyone coming back) stop further from failure on everything. */
export const NEWER: ReadonlySet<ExperienceId> = new Set<ExperienceId>(['new', 'months', 'break']);

/** SPEC 22 rule 8 in plain words, on every item. */
export const EFFORT = {
  newer: 'Stop with 2 to 3 reps left',
  compound: 'Stop with 1 to 2 reps left',
  isolation: 'Go close to failure, 0 to 1 reps left',
} as const;

/** A finisher at the end of every day (SPEC 7.3: fat loss 10 min, athletic a conditioning finisher). */
export const FINISHER_MINUTES = 10;

// ---------------------------------------------------------------- splits (SPEC 7.3)

/** One place in a day: a pattern, and whether it should differ from the same pattern earlier in the week. */
export type Slot = { pattern: Pattern; variant?: true };

export type DayTemplate = { name: string; slots: Slot[] };

const s = (pattern: Pattern, variant = false): Slot => (variant ? { pattern, variant: true } : { pattern });

// Most important first: the big lifts lead, the trim drops from the end (SPEC 7.4).
const FULL_A: DayTemplate = { name: 'Full body A', slots: [s('squat'), s('horizontal push'), s('vertical pull'), s('lateral delt'), s('biceps'), s('hamstrings isolation'), s('core'), s('calves')] };
const FULL_B: DayTemplate = { name: 'Full body B', slots: [s('hinge'), s('vertical push'), s('horizontal pull'), s('quads isolation'), s('triceps'), s('rear delt'), s('core'), s('calves')] };
const FULL_C: DayTemplate = {
  name: 'Full body C',
  slots: [s('lunge'), s('horizontal push', true), s('horizontal pull', true), s('glutes'), s('chest isolation'), s('biceps', true), s('core', true), s('triceps', true)],
};
// Two days: each one covers legs, a push and a pull, so nothing waits a week.
const TWO_A: DayTemplate = { name: 'Full body A', slots: [s('squat'), s('horizontal push'), s('horizontal pull'), s('lateral delt'), s('biceps'), s('hamstrings isolation'), s('core'), s('calves')] };
const TWO_B: DayTemplate = { name: 'Full body B', slots: [s('hinge'), s('vertical push'), s('vertical pull'), s('lunge'), s('triceps'), s('rear delt'), s('core'), s('quads isolation')] };

const upper = (name: string, v: boolean): DayTemplate => ({
  name,
  slots: [s('horizontal push', v), s('horizontal pull', v), s('vertical push', v), s('vertical pull', v), s('lateral delt', v), s('biceps', v), s('triceps', v), s('chest isolation', v)],
});
const lower = (name: string, v: boolean): DayTemplate => ({
  name,
  slots: v
    ? [s('hinge', true), s('squat', true), s('glutes'), s('hamstrings isolation', true), s('quads isolation', true), s('calves', true), s('core', true), s('lunge', true)]
    : [s('squat'), s('hinge'), s('lunge'), s('quads isolation'), s('hamstrings isolation'), s('calves'), s('core'), s('glutes')],
});
const push = (name: string, v: boolean): DayTemplate => ({
  name,
  slots: [s('horizontal push', v), s('vertical push', v), s('horizontal push', true), s('lateral delt', v), s('chest isolation', v), s('triceps', v), s('triceps', true), s('core', v)],
});
const pull = (name: string, v: boolean): DayTemplate => ({
  name,
  slots: [s('vertical pull', v), s('horizontal pull', v), s('horizontal pull', true), s('rear delt', v), s('biceps', v), s('biceps', true), s('core', v), s('vertical pull', true)],
});
const legs = (name: string, v: boolean): DayTemplate => ({
  name,
  slots: [s('squat', v), s('hinge', v), s('lunge', v), s('quads isolation', v), s('hamstrings isolation', v), s('glutes', v), s('calves', v), s('core', v)],
});

export type SplitName = 'Full Body' | 'Upper Lower' | 'Upper Lower Push Pull Legs' | 'Push Pull Legs';

/** SPEC 7.3: 2 full body A/B · 3 full body A/B/C · 4 upper/lower · 5 upper/lower/push/pull/legs · 6 push/pull/legs ×2. */
export function splitFor(days: number): { name: SplitName; days: DayTemplate[] } {
  switch (days) {
    case 2:
      return { name: 'Full Body', days: [TWO_A, TWO_B] };
    case 4:
      return { name: 'Upper Lower', days: [upper('Upper A', false), lower('Lower A', false), upper('Upper B', true), lower('Lower B', true)] };
    case 5:
      return { name: 'Upper Lower Push Pull Legs', days: [upper('Upper', false), lower('Lower', false), push('Push', true), pull('Pull', true), legs('Legs', true)] };
    case 6:
      return { name: 'Push Pull Legs', days: [push('Push A', false), pull('Pull A', false), legs('Legs A', false), push('Push B', true), pull('Pull B', true), legs('Legs B', true)] };
    default:
      return { name: 'Full Body', days: [FULL_A, FULL_B, FULL_C] };
  }
}

/** How many moves a day starts with for the time picked; the trim (SPEC 7.4) takes it from there. */
export function movesFor(minutes: number | undefined): number {
  if (minutes === undefined) return 6;
  if (minutes <= 20) return 4;
  if (minutes <= 30) return 5;
  if (minutes <= 45) return 6;
  if (minutes <= 60) return 7;
  return 8;
}

/**
 * When nothing fits a pattern here, the move that does its job best instead (a hinge with no
 * barbell or dumbbells: a glute bridge). Never a guess across the body: legs stay legs, pushes pushes.
 */
export const FALLBACK: Readonly<Record<Pattern, readonly Pattern[]>> = {
  squat: ['lunge'],
  hinge: ['glutes', 'hamstrings isolation'],
  lunge: ['squat'],
  'horizontal push': ['vertical push'],
  'vertical push': ['horizontal push', 'lateral delt'],
  'horizontal pull': ['vertical pull'],
  'vertical pull': ['horizontal pull'],
  'chest isolation': ['horizontal push'],
  'lateral delt': [],
  'rear delt': ['horizontal pull'],
  biceps: [],
  triceps: [],
  'quads isolation': ['lunge', 'squat'],
  'hamstrings isolation': ['hinge', 'glutes'],
  glutes: ['hinge'],
  calves: [],
  core: [],
};

/** A day needs at least this many moves the gym can do, or the generator says so (never padding). */
export const MIN_MOVES = 3;

// ---------------------------------------------------------------- focus (SPEC 15)

/** Each focus area: the patterns that train it (isolation first), and its muscles for SPEC 22 rule 2. */
export const FOCUS_RULES: Record<Exclude<FocusId, 'balance'>, { groups: Pattern[][]; muscles: Muscle[]; word: string }> = {
  chest: { groups: [['chest isolation', 'horizontal push']], muscles: ['chest'], word: 'chest' },
  back: { groups: [['horizontal pull', 'vertical pull', 'rear delt']], muscles: ['back'], word: 'back' },
  shoulders: { groups: [['lateral delt', 'rear delt', 'vertical push']], muscles: ['front delts', 'side delts', 'rear delts'], word: 'shoulder' },
  // Arms: biceps and triceps each get theirs.
  arms: { groups: [['biceps'], ['triceps']], muscles: ['biceps', 'triceps'], word: 'arm' },
  core: { groups: [['core']], muscles: ['abs'], word: 'core' },
  glutes: { groups: [['glutes', 'hinge', 'lunge']], muscles: ['glutes'], word: 'glute' },
  legs: { groups: [['quads isolation', 'hamstrings isolation', 'lunge', 'squat']], muscles: ['quads', 'hamstrings'], word: 'leg' },
};

/** SPEC 15: a focus adds 2 to 4 weekly sets; the generator aims for 3 per group (2 each for arms). */
export const FOCUS_TARGET = 3;
export const FOCUS_TARGET_SPLIT = 2;
/** No item grows past this many sets for a focus. */
export const MAX_ITEM_SETS = 5;
