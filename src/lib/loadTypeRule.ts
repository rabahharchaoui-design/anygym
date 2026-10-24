// Plan exercise list (PLAN 1.7): which load input an exercise name implies. Pure, no imports at
// runtime, so scripts/build-plan-exercises.ts can run it with plain Node.
//
// THE RULE (a loadType only when the name makes it certain, otherwise 'unknown'):
//   1. contains "Barbell"                         → barbell
//   2. "Single Arm", "One Arm" (space or hyphen) or "Unilateral" together with "Dumbbell",
//      "Kettlebell" or "Goblet"                   → single (one weight held; total = the weight)
//   3. contains "Dumbbell"                        → dumbbell_each
//   4. contains "Cable"                           → stack
//   5. contains "Stretch", "Plank" or "Hold"      → timed
//   6. contains "Pull Up", "Chin Up", "Push Up" or "Dip", and no weight word
//      (Weighted, Barbell, Dumbbell, Plate, Machine, Cable, Kettlebell, Band) → bodyweight
//   7. anything else                              → unknown (the user is asked once)
// Machine vs plate loaded is NEVER guessed: "Machine" alone stays unknown.
// Words match whole words, case insensitive, first rule wins.
//
// PLAN ITEMS (planItemLoadType): the plan's own unit beats the name rule.
//   1. a finisher, or a hold with seconds and no reps            → timed
//   2. explicit reps where the name rule says timed (Six Week day 3 "Plank", 3 × 10 reps):
//      reps are never turned into seconds. No weight word         → bodyweight (reps)
//      with a weight word, or reps and seconds both given          → unknown (asked once)
//   3. anything else                                               → the name rule
//
// BAR (barForName): "EZ" → ez_curl, "Trap" or "Hex" → trap, "Smith" → smith, else olympic.
// EZ, trap and Smith weights are never guessed: they come from the first use prompt (SPEC 5.3).
import type { BarId, Load } from '../db/types';

export type ExerciseLoadType = Load['kind'] | 'unknown';

export type PlanExercise = { id: string; name: string; loadType: ExerciseLoadType };

const has = (name: string, words: string[]) =>
  words.some((w) => new RegExp(`\\b${w.replace(/ /g, '\\s+')}\\b`, 'i').test(name));

const ONE_ARM = /\b(?:(?:single|one)[\s-]+arm|unilateral)\b/i;

const WEIGHT_WORDS = ['Weighted', 'Barbell', 'Dumbbell', 'Plate', 'Machine', 'Cable', 'Kettlebell', 'Band'];

export function loadTypeFromName(name: string): ExerciseLoadType {
  if (has(name, ['Barbell'])) return 'barbell';
  if (ONE_ARM.test(name) && has(name, ['Dumbbell', 'Kettlebell', 'Goblet'])) return 'single';
  if (has(name, ['Dumbbell'])) return 'dumbbell_each';
  if (has(name, ['Cable'])) return 'stack';
  if (has(name, ['Stretch', 'Plank', 'Hold'])) return 'timed';
  if (has(name, ['Pull Up', 'Chin Up', 'Push Up', 'Dip']) && !has(name, WEIGHT_WORDS)) return 'bodyweight';
  return 'unknown';
}

/** A plan item's amount: reps, a hold in seconds, or the day's cardio finisher. */
export type PlanAmount = { reps?: unknown; seconds?: unknown; finisher?: boolean };

/** Which input a plan item uses: the plan's unit wins over the name (see PLAN ITEMS above). */
export function planItemLoadType(name: string, amount: PlanAmount, fromName: ExerciseLoadType = loadTypeFromName(name)): ExerciseLoadType {
  const hasReps = amount.reps !== undefined;
  const hasSeconds = amount.seconds !== undefined;
  if (amount.finisher || (hasSeconds && !hasReps)) return 'timed';
  if (hasReps && fromName === 'timed') return hasSeconds || has(name, WEIGHT_WORDS) ? 'unknown' : 'bodyweight';
  return fromName;
}

/** Which bar a barbell exercise uses, from its name (see BAR above). */
export function barForName(name: string): BarId {
  if (has(name, ['EZ'])) return 'ez_curl';
  if (has(name, ['Trap', 'Hex'])) return 'trap';
  if (has(name, ['Smith'])) return 'smith';
  return 'olympic';
}

/** Stable id from a name: "Barbell Back Squat" → "barbell-back-squat". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Every `exercise` string anywhere in the plan files, unique by id, sorted by name. */
export function buildPlanExercises(plans: unknown[]): PlanExercise[] {
  const names = new Map<string, string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'exercise' && typeof value === 'string' && value.trim()) {
        const name = value.trim();
        const id = slugify(name);
        if (id && !names.has(id)) names.set(id, name);
      } else walk(value);
    }
  };
  plans.forEach(walk);
  return [...names]
    .map(([id, name]) => ({ id, name, loadType: loadTypeFromName(name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
