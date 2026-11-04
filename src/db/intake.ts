// The intake funnel's storage (SPEC 14, PLAN 3.3). The answers live on the profile row (additive
// fields, no new store); the durable "intake done" flag is profile.intakeDoneAt, mirrored in
// localStorage so the first paint already knows. An existing user (a profile, a workout or a plan
// in use) never sees the funnel open by itself; Settings can always open it again.
import { equipmentPreset } from './gyms';
import { setGymUnit } from './equipment';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Gym, Profile } from './types';
import { GYM_TYPE_OF, sanitizeAnswers, type DistanceUnit, type IntakeAnswers, type MeasureUnit } from '../lib/intake/funnel';
import type { PlaceAnswer } from '../lib/intake/options';

export const INTAKE_DONE_KEY = 'anygym.intakeDone';
export const INTAKE_DRAFT_KEY = 'anygym.intakeDraft';

/** This phone already knows the intake is done (or the user existed before it). */
export function intakeDoneHere(): boolean {
  try {
    return localStorage.getItem(INTAKE_DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntakeDoneHere(): void {
  try {
    localStorage.setItem(INTAKE_DONE_KEY, '1');
  } catch {
    // Private mode: the profile row still says it.
  }
}

/** The one profile row (the oldest, if an old copy ever made two). */
export async function getProfile(db: AnyGymDB = defaultDb): Promise<Profile | undefined> {
  const all = await db.profile.toArray();
  return all.sort((a, b) => a.createdAt - b.createdAt)[0];
}

/**
 * True only for a brand new user: no profile row, no workout (logged or imported) and no plan in
 * use. Anyone else is an existing user, and the local flag is set so the check is not repeated.
 */
export async function needsIntake(db: AnyGymDB = defaultDb): Promise<boolean> {
  const fresh = await db.transaction('r', db.profile, db.sessions, db.planState, async () => {
    if ((await db.profile.count()) > 0) return false;
    if ((await db.sessions.count()) > 0) return false;
    return (await db.planState.count()) === 0;
  });
  if (!fresh) markIntakeDoneHere();
  return fresh;
}

const GYM_NAMES: Record<PlaceAnswer, string> = { full: 'My Gym', hotel: 'Hotel gym', home: 'Home', outdoors: 'Outdoors', mix: 'My Gym' };
const DEFAULT_GYM_NAME = 'My Gym';

/**
 * Saves the answers on the profile (merged into the existing row, never replacing other fields)
 * and sets the intake done. The weight unit goes to the active gym as Settings would set it. The
 * place and equipment set up the active gym only while no workout was ever logged there, so a gym
 * with history is never changed by the intake (its equipment is edited per gym).
 */
export async function saveIntake(input: IntakeAnswers, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Profile> {
  const answers = sanitizeAnswers(input);
  const profile = await db.transaction('rw', [db.profile, db.gyms, db.sessions, db.sets], async () => {
    const existing = await getProfile(db);
    const gyms = await db.gyms.orderBy('createdAt').toArray();
    const active: Gym | undefined = gyms.find((g) => g.isActive) ?? gyms[0];
    const unit = answers.units?.weight ?? existing?.defaultUnit ?? active?.unit ?? 'lb';
    const next: Profile = {
      ...(existing ?? { id: 'me', createdAt: now }),
      defaultUnit: unit,
      intake: answers,
      intakeDoneAt: now,
    };
    if (answers.name) next.name = answers.name;
    if (answers.goal) next.goal = answers.goal;
    if (answers.experience) next.level = answers.experience;
    if (answers.days) next.daysPerWeek = answers.days;
    if (answers.units) {
      next.distanceUnit = answers.units.distance;
      next.measureUnit = answers.units.measure;
    }
    await db.profile.put(next);

    if (active) {
      let gym = active;
      if (answers.units && gym.unit !== answers.units.weight) gym = await setGymUnit(gym.id, answers.units.weight, db);
      const used = (await db.sessions.where('gymId').equals(gym.id).count()) > 0;
      if (!used && answers.place) {
        const type = GYM_TYPE_OF[answers.place];
        const equipment = answers.equipment ?? equipmentPreset(type, gym.unit).equipment;
        const range = equipment.includes('dumbbells') ? (equipmentPreset(type, gym.unit).dumbbellRange ?? equipmentPreset('hotel', gym.unit).dumbbellRange) : null;
        await db.gyms.put({
          ...gym,
          type,
          name: gym.name === DEFAULT_GYM_NAME ? GYM_NAMES[answers.place] : gym.name,
          equipment: [...equipment],
          dumbbellRange: range,
        });
      }
    }
    return next;
  });
  markIntakeDoneHere();
  try {
    localStorage.removeItem(INTAKE_DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
  return profile;
}

/** The answers saved last time (Settings → Redo), cleaned. */
export async function savedAnswers(db: AnyGymDB = defaultDb): Promise<IntakeAnswers | undefined> {
  const p = await getProfile(db);
  return p?.intake ? sanitizeAnswers(p.intake) : undefined;
}

/**
 * Settings → My profile: distance and body measurement units, changeable any time (PLAN 3.3). The
 * intake's saved units follow, so answering the questions again starts from the same choice.
 */
export async function setProfileUnits(patch: { distanceUnit?: DistanceUnit; measureUnit?: MeasureUnit }, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Profile> {
  return db.transaction('rw', db.profile, db.gyms, async () => {
    const existing = await getProfile(db);
    const gyms = await db.gyms.orderBy('createdAt').toArray();
    const unit = (gyms.find((g) => g.isActive) ?? gyms[0])?.unit ?? 'lb';
    const next: Profile = { ...(existing ?? { id: 'me', createdAt: now, defaultUnit: unit }), ...patch };
    const units = existing?.intake?.units;
    if (units && existing?.intake) {
      next.intake = {
        ...existing.intake,
        units: { ...units, ...(patch.distanceUnit ? { distance: patch.distanceUnit } : {}), ...(patch.measureUnit ? { measure: patch.measureUnit } : {}) },
      };
    }
    await db.profile.put(next);
    return next;
  });
}
