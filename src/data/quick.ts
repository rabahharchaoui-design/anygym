// Quick workout over the committed data (PLAN 3.5a): the generator's deps, only sure demos, and the
// muscle map of a whole workout. src/lib/quick.ts stays pure.
import type { QuickDeps } from '../lib/quick';
import { mergeMuscleMaps, type MuscleMapData } from '../lib/muscles';
import { GENERATOR_DEPS } from './generator';
import { demoFor, infoForExercise } from './exerciseInfo';
import { profileFor } from './order';

export const QUICK_DEPS: QuickDeps = {
  ...GENERATOR_DEPS,
  // SPEC 4.3: only an exercise with a sure demo (exact or variant) is ever offered.
  usable: (id) => demoFor(id) !== null,
  profileOf: (id, name) => profileFor(id, name),
};

/** The sure muscles of every exercise of a workout, as one map (null: none sure). */
export const workoutMuscles = (ids: readonly string[]): MuscleMapData | null => mergeMuscleMaps(ids.map((id) => infoForExercise(id).muscles));
