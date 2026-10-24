// How the user loads an exercise (PLAN 1.7): asked once for 'unknown' exercises.
import { db as defaultDb, type AnyGymDB } from './schema';
import { ANY_GYM, type ExerciseSetting, type Load } from './types';

/** Machines differ per gym (SPEC 6); free weights are the same everywhere. */
export function isPerGym(loadType: Load['kind']): boolean {
  return loadType === 'stack' || loadType === 'plate_machine';
}

/** Saves the answer: per gym for machines, for every gym otherwise. Replaces an earlier answer with the same key. */
export async function saveLoadType(
  exerciseId: string,
  gymId: string,
  loadType: Load['kind'],
  db: AnyGymDB = defaultDb,
): Promise<ExerciseSetting> {
  const setting: ExerciseSetting = { exerciseId, gymId: isPerGym(loadType) ? gymId : ANY_GYM, loadType };
  await db.transaction('rw', db.exerciseSettings, async () => {
    await db.exerciseSettings.put(setting);
  });
  return setting;
}

/** The saved answer for this gym, else the every-gym answer, else undefined (ask). */
export function pickLoadType(settings: ExerciseSetting[], exerciseId: string, gymId: string): Load['kind'] | undefined {
  const own = settings.find((s) => s.exerciseId === exerciseId && s.gymId === gymId && gymId !== ANY_GYM);
  return (own ?? settings.find((s) => s.exerciseId === exerciseId && s.gymId === ANY_GYM))?.loadType;
}

export async function loadTypeFor(exerciseId: string, gymId: string, db: AnyGymDB = defaultDb): Promise<Load['kind'] | undefined> {
  return pickLoadType(await db.exerciseSettings.where('exerciseId').equals(exerciseId).toArray(), exerciseId, gymId);
}
