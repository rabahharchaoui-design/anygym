// The intake funnel's storage (SPEC 14, PLAN 3.3). The answers live on the profile row (additive
// fields, no new store); the durable "intake done" flag is profile.intakeDoneAt, mirrored in
// localStorage so the first paint already knows. An existing user (a profile, a workout or a plan
// in use) never sees the funnel open by itself; Settings can always open it again.
import { equipmentPreset } from './gyms';
import { setGymUnit } from './equipment';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { DumbbellRange, EquipmentId, Gym, GymType, Profile } from './types';
import { GYM_TYPE_OF, needsDumbbellRange, sanitizeAnswers, type DistanceUnit, type IntakeAnswers, type MeasureUnit, type UnitsAnswer } from '../lib/intake/funnel';
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

/** Typed, else the gym's own range at the same place (custom ones survive), else the SPEC 3 preset, else none. Never invented. */
function dumbbellRangeFor(gym: Gym, type: GymType, equipment: readonly EquipmentId[], answers: IntakeAnswers, samePlace: boolean): DumbbellRange | null {
  if (!equipment.includes('dumbbells')) return null;
  if (answers.dumbbellRange) return answers.dumbbellRange;
  if (samePlace && gym.dumbbellRange) return gym.dumbbellRange;
  return equipmentPreset(type, gym.unit).dumbbellRange;
}

const sameList = (a: readonly string[] = [], b: readonly string[] = []) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export type SaveIntakeOptions = {
  /**
   * The answers this run started from (a redo's hydrated answers, or what the reveal saved last).
   * Default: the answers saved on the profile. A gym only changes where the answers differ from it.
   */
  start?: IntakeAnswers;
};

/**
 * Saves the answers on the profile (merged into the existing row, never replacing other fields)
 * and sets the intake done. A gym is never changed by answers that merely repeat what was there:
 * the unit goes through setGymUnit (the Settings path) only when the user changed the toggle, and
 * place and equipment apply only when changed and only while no workout was ever logged at the
 * gym. On a first intake there is nothing to compare with, so the unused first gym is set up.
 */
export async function saveIntake(input: IntakeAnswers, db: AnyGymDB = defaultDb, now = Date.now(), opts: SaveIntakeOptions = {}): Promise<Profile> {
  const answers = sanitizeAnswers(input);
  delete answers.skipRestFrom;
  const profile = await db.transaction('rw', [db.profile, db.gyms, db.sessions, db.sets], async () => {
    const existing = await getProfile(db);
    const baseline = opts.start ?? (existing?.intake ? sanitizeAnswers(existing.intake) : undefined);
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
    // Skipped on purpose: the old name goes too (the passport never shows a discarded name).
    else if (answers.skipped?.includes('name')) delete next.name;
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
      const used = (await db.sessions.where('gymId').equals(gym.id).count()) > 0;
      const unitAsked = answers.units && (baseline?.units ? answers.units.weight !== baseline.units.weight : !used);
      if (answers.units && unitAsked && gym.unit !== answers.units.weight) gym = await setGymUnit(gym.id, answers.units.weight, db);
      const kitAsked = !baseline || baseline.place !== answers.place || !sameList(baseline.equipment, answers.equipment) || !sameJson(baseline.dumbbellRange, answers.dumbbellRange);
      if (!used && answers.place && kitAsked) {
        const type = GYM_TYPE_OF[answers.place];
        const equipment = answers.equipment ?? equipmentPreset(type, gym.unit).equipment;
        await db.gyms.put({
          ...gym,
          type,
          name: gym.name === DEFAULT_GYM_NAME ? GYM_NAMES[answers.place] : gym.name,
          equipment: [...equipment],
          dumbbellRange: dumbbellRangeFor(gym, type, equipment, answers, baseline?.place === answers.place),
        });
      }
    }
    return next;
  });
  markIntakeDoneHere();
  // The draft stays until the user leaves the reveal (clearIntakeDraft), so a reload comes back to it.
  return profile;
}

export function intakeDraftHere(): boolean {
  try {
    return localStorage.getItem(INTAKE_DRAFT_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * The draft is written to localStorage (sync, for the first paint) and always to IndexedDB kv, so it
 * survives where localStorage throws or lost a late write, as the workout drafts do. Never throws.
 */
export async function writeIntakeDraft(text: string, db: AnyGymDB = defaultDb): Promise<void> {
  try {
    localStorage.setItem(INTAKE_DRAFT_KEY, text);
  } catch {
    // Blocked or full: kv keeps it.
  }
  await db.kv.put({ key: INTAKE_DRAFT_KEY, value: text, at: Date.now() }).catch(() => undefined);
}

export async function readIntakeDraft(db: AnyGymDB = defaultDb): Promise<string | null> {
  try {
    const v = localStorage.getItem(INTAKE_DRAFT_KEY);
    if (v !== null) return v;
  } catch {
    // Blocked: kv has it.
  }
  const row = await db.kv.get(INTAKE_DRAFT_KEY).catch(() => undefined);
  return row?.value ?? null;
}

export async function clearIntakeDraft(db: AnyGymDB = defaultDb): Promise<void> {
  try {
    localStorage.removeItem(INTAKE_DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
  await db.kv.delete(INTAKE_DRAFT_KEY).catch(() => undefined);
}

/**
 * A fresh user who left mid funnel or on the reveal (a reload, an app kill) goes back to it, never
 * to Today with no plan chosen. Only while nothing has started: with a plan or a workout the draft
 * is old news and is cleared, so it can never pull a real user back into the funnel.
 */
export async function intakeToResume(db: AnyGymDB = defaultDb): Promise<boolean> {
  if ((await readIntakeDraft(db)) === null) return false;
  const started = await db.transaction('r', db.sessions, db.planState, async () => (await db.sessions.count()) > 0 || (await db.planState.count()) > 0);
  if (started) await clearIntakeDraft(db);
  return !started;
}

/**
 * What a redo starts from (Settings → Answer the questions again): the saved answers, with what can
 * have changed since read from where it lives now: the weight unit and dumbbell range from the
 * active gym, the other units from the profile, the body from this phone's preference (`current`).
 */
export async function redoAnswers(current: Pick<UnitsAnswer, 'distance' | 'measure' | 'body'>, db: AnyGymDB = defaultDb): Promise<IntakeAnswers> {
  const p = await getProfile(db);
  const gyms = await db.gyms.orderBy('createdAt').toArray();
  const gym = gyms.find((g) => g.isActive) ?? gyms[0];
  const saved = p?.intake ? sanitizeAnswers(p.intake) : {};
  const answers: IntakeAnswers = {
    ...saved,
    units: {
      weight: gym?.unit ?? p?.defaultUnit ?? 'lb',
      distance: p?.distanceUnit ?? saved.units?.distance ?? current.distance,
      measure: p?.measureUnit ?? saved.units?.measure ?? current.measure,
      ...(current.body ? { body: current.body } : {}),
    },
  };
  delete answers.dumbbellRange;
  if (needsDumbbellRange(answers) && gym?.dumbbellRange) answers.dumbbellRange = gym.dumbbellRange;
  return answers;
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
