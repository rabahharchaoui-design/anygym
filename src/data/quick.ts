// Quick workout over the committed data (PLAN 3.5a): the generator's deps, only sure demos, and the
// muscle map of a whole workout. src/lib/quick.ts stays pure.
import type { QuickDeps } from '../lib/quick';
import type { Muscle } from '../lib/order';
import { mergeMuscleMaps, type MuscleMapData } from '../lib/muscles';
import { GENERATOR_DEPS } from './generator';
import { demoFor, infoForExercise } from './exerciseInfo';
import { profileFor } from './order';

/**
 * Round 2 (B4): the map regions each muscle word covers, as a person reads it: "back" is the whole
 * back (upper and lower), side delts light the front deltoid shape (SPEC 4.5 has no side region).
 */
export const MUSCLE_MAP_REGIONS: Record<Muscle, readonly string[]> = {
  quads: ['quadriceps'],
  glutes: ['gluteal'],
  hamstrings: ['hamstring'],
  'lower back': ['lower-back'],
  adductors: ['adductor'],
  abductors: ['gluteal'],
  calves: ['calves'],
  chest: ['chest'],
  'front delts': ['front-deltoids'],
  'side delts': ['front-deltoids'],
  'rear delts': ['back-deltoids'],
  back: ['upper-back', 'lower-back'],
  traps: ['trapezius'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  abs: ['abs', 'obliques'],
};

export const QUICK_DEPS: QuickDeps = {
  ...GENERATOR_DEPS,
  // SPEC 4.3: only an exercise with a sure demo (exact or variant) is ever offered.
  usable: (id) => demoFor(id) !== null,
  profileOf: (id, name) => profileFor(id, name),
  litRegions: (id) => Object.keys(infoForExercise(id).muscles?.shading ?? {}),
  muscleRegions: (m) => MUSCLE_MAP_REGIONS[m],
  // PLAN 3.5b: the diversity rule counts the catalog's sure primary muscles only (never secondary).
  primaryOf: (id) => [...new Set((infoForExercise(id).muscles?.primary ?? []).flatMap((t) => t.regions))],
};

/** The sure muscles of every exercise of a workout, as one map (null: none sure). */
export const workoutMuscles = (ids: readonly string[]): MuscleMapData | null => mergeMuscleMaps(ids.map((id) => infoForExercise(id).muscles));
