// Exercises for a tapped muscle (PLAN 2.2c) over the committed catalog, plan map and overrides:
// the same files the muscle map draws from, so what lights up and what is listed agree.
import overrides from '../../data/muscle-overrides.json';
import type { Region } from '../lib/bodyArt';
import type { DemoImages } from '../lib/exerciseInfo';
import { exercisesForRegion, tileKindOf, type MuscleExercise, type TileKind } from '../lib/muscleExercises';
import type { MuscleOverrides } from '../lib/muscles';
import { infoForCatalog } from './exerciseInfo';
import { CATALOG } from './muscles';

export interface MuscleExerciseRow extends MuscleExercise {
  /** The exercise's own start photo; null when it has no sure demo (never another exercise's). */
  thumb: { webp: string; jpg: string } | null;
  /** The drawing shown when there is no photo: the catalog's equipment (tileKindOf). */
  tile: TileKind;
}

const EQUIPMENT = new Map((CATALOG as ReadonlyArray<{ id: string; equipment?: string | null }>).map((e) => [e.id, e.equipment]));

const thumbOf = (demo: DemoImages | null) => (demo ? { webp: demo.webp[0], jpg: demo.jpg[0] } : null);

export function exercisesForMuscle(region: Region, planIds?: ReadonlySet<string>): MuscleExerciseRow[] {
  return exercisesForRegion(region, CATALOG, overrides as MuscleOverrides, planIds).map((e) => ({ ...e, thumb: thumbOf(infoForCatalog(e.id).demo), tile: tileKindOf(EQUIPMENT.get(e.id)) }));
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
