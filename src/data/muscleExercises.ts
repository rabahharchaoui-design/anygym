// Exercises for a tapped muscle (PLAN 2.2c) over the committed catalog, plan map and overrides:
// the same files the muscle map draws from, so what lights up and what is listed agree.
import overrides from '../../data/muscle-overrides.json';
import type { Region } from '../lib/bodyArt';
import type { DemoImages } from '../lib/exerciseInfo';
import { exercisesForRegion, type MuscleExercise } from '../lib/muscleExercises';
import type { MuscleOverrides } from '../lib/muscles';
import { infoForCatalog } from './exerciseInfo';
import { CATALOG } from './muscles';

export interface MuscleExerciseRow extends MuscleExercise {
  /** The exercise's own start photo; null when it has no sure demo (never another exercise's). */
  thumb: { webp: string; jpg: string } | null;
}

const thumbOf = (demo: DemoImages | null) => (demo ? { webp: demo.webp[0], jpg: demo.jpg[0] } : null);

export function exercisesForMuscle(region: Region, planIds?: ReadonlySet<string>): MuscleExerciseRow[] {
  return exercisesForRegion(region, CATALOG, overrides as MuscleOverrides, planIds).map((e) => ({ ...e, thumb: thumbOf(infoForCatalog(e.id).demo) }));
}

const counts = new Map<Region, number>();
/** How many catalog exercises work this muscle as primary (cached: the catalog is static). */
export function exerciseCount(region: Region): number {
  let n = counts.get(region);
  if (n === undefined) {
    n = exercisesForRegion(region, CATALOG, overrides as MuscleOverrides).length;
    counts.set(region, n);
  }
  return n;
}
