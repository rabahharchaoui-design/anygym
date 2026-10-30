// How the user loads an exercise (PLAN 1.7): asked once for 'unknown' exercises.
import { preserveLegacyBars } from './history';
import { sameExerciseIds } from '../lib/picker';
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
    // A change from a machine answer (this gym) to a free weight (every gym) or back: the other
    // answer goes, so the new one is the one used (PLAN 1.7c "Loaded with… Change").
    const other: [string, string] = [exerciseId, key[1] === ANY_GYM ? gymId : ANY_GYM];
    const old = other[1] === key[1] ? undefined : await db.exerciseSettings.get(other);
    if (old?.loadType !== undefined) {
      const rest = { ...old };
      delete rest.loadType;
      await db.exerciseSettings.put(rest);
    }
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
 * In the same transaction (PLAN 1.7k, 2.0c), older sets of this exercise at this gym saved without
 * a barId get the bar their stored evidence resolves to (db/history.ts preserveLegacyBars, with
 * `exerciseBar`, the exercise's own bar by plan or name), one additive field each, so changing the
 * setting can never move them between histories later. Ambiguous ones get the unresolved mark.
 */
export async function saveBarChoice(exerciseId: string, gymId: string, barId: BarId, db: AnyGymDB = defaultDb, exerciseBar?: BarId): Promise<ExerciseSetting> {
  return db.transaction('rw', [db.exerciseSettings, db.sets, db.sessions, db.gyms], async () => {
    if (exerciseBar) {
      const gym = await db.gyms.get(gymId);
      // Same resolver and marks as a unit or bar change (PLAN 2.0c); aliases of the exercise too.
      if (gym) await preserveLegacyBars(db, gym, sameExerciseIds(exerciseId), exerciseBar);
    }
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

/**
 * Per exercise preferences from the exercise menu (PLAN 1.7c): rest after each set and the user's
 * own note. Kept on the every-gym record (ANY_GYM), so they follow the exercise everywhere. A
 * load type or bar choice on the same record is kept. Schema unchanged: neither field is indexed.
 */
async function savePreference(exerciseId: string, patch: Pick<ExerciseSetting, 'restSec' | 'note'>, db: AnyGymDB): Promise<ExerciseSetting> {
  return db.transaction('rw', db.exerciseSettings, async () => {
    const setting: ExerciseSetting = { ...(await db.exerciseSettings.get([exerciseId, ANY_GYM])), exerciseId, gymId: ANY_GYM, ...patch };
    if (setting.note !== undefined && !setting.note.trim()) delete setting.note;
    await db.exerciseSettings.put(setting);
    return setting;
  });
}

export const MIN_REST_SEC = 0;
export const MAX_REST_SEC = 600;

/** Saves the rest after each set, whole seconds from 0 to 10 minutes. */
export async function saveExerciseRest(exerciseId: string, restSec: number, db: AnyGymDB = defaultDb): Promise<ExerciseSetting> {
  if (!Number.isInteger(restSec) || restSec < MIN_REST_SEC || restSec > MAX_REST_SEC) throw new Error('Invalid rest');
  return savePreference(exerciseId, { restSec }, db);
}

/** Saves the user's note (trimmed; empty removes it). */
export async function saveExerciseNote(exerciseId: string, note: string, db: AnyGymDB = defaultDb): Promise<ExerciseSetting> {
  return savePreference(exerciseId, { note: note.trim().slice(0, 200) }, db);
}

/** The rest the user picked for this exercise, or undefined (the plan's or the default). */
export function pickRest(settings: ExerciseSetting[], exerciseId: string): number | undefined {
  return settings.find((s) => s.exerciseId === exerciseId && s.gymId === ANY_GYM)?.restSec;
}

/** The user's note for this exercise, or undefined. */
export function pickNote(settings: ExerciseSetting[], exerciseId: string): string | undefined {
  return settings.find((s) => s.exerciseId === exerciseId && s.gymId === ANY_GYM)?.note;
}
