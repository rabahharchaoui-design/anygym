// How the user loads an exercise (PLAN 1.7): asked once for 'unknown' exercises.
import { db as defaultDb, type AnyGymDB } from './schema';
import { ANY_GYM, type BarId, type ExerciseSetting, type Load } from './types';

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
  const key: [string, string] = [exerciseId, isPerGym(loadType) ? gymId : ANY_GYM];
  return db.transaction('rw', db.exerciseSettings, async () => {
    // A bar choice saved on the same record is kept.
    const setting: ExerciseSetting = { ...(await db.exerciseSettings.get(key)), exerciseId, gymId: key[1], loadType };
    await db.exerciseSettings.put(setting);
    return setting;
  });
}

/** The saved answer for this gym, else the every-gym answer, else undefined (ask). */
export function pickLoadType(settings: ExerciseSetting[], exerciseId: string, gymId: string): Load['kind'] | undefined {
  const typed = settings.filter((s) => s.exerciseId === exerciseId && s.loadType !== undefined);
  const own = typed.find((s) => s.gymId === gymId && gymId !== ANY_GYM);
  return (own ?? typed.find((s) => s.gymId === ANY_GYM))?.loadType;
}

/**
 * Saves which bar a barbell exercise uses at this gym (PLAN 1.10d), on the exercise's record for
 * this gym; its load type answer, if any, is kept. Schema unchanged: barId is not indexed.
 */
export async function saveBarChoice(exerciseId: string, gymId: string, barId: BarId, db: AnyGymDB = defaultDb): Promise<ExerciseSetting> {
  return db.transaction('rw', db.exerciseSettings, async () => {
    const setting: ExerciseSetting = { ...(await db.exerciseSettings.get([exerciseId, gymId])), exerciseId, gymId, barId };
    await db.exerciseSettings.put(setting);
    return setting;
  });
}

/** The bar picked for this exercise at this gym, or undefined (the name rule decides). */
export function pickBar(settings: ExerciseSetting[], exerciseId: string, gymId: string): BarId | undefined {
  return settings.find((s) => s.exerciseId === exerciseId && s.gymId === gymId)?.barId;
}

export async function loadTypeFor(exerciseId: string, gymId: string, db: AnyGymDB = defaultDb): Promise<Load['kind'] | undefined> {
  return pickLoadType(await db.exerciseSettings.where('exerciseId').equals(exerciseId).toArray(), exerciseId, gymId);
}
