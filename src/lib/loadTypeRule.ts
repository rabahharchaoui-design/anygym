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
import type { Load } from '../db/types';

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
