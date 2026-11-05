// The gyms list (PLAN 3.9, SPEC 3 and 19): add, rename, equipment, delete with Undo. Every write is
// one transaction. A new gym starts with its preset's equipment and the SPEC 5.3 defaults only; the
// first use prompts stay. Saved data is never rewritten: a gym with workouts cannot be deleted.
import { makeGym } from './gyms';
import { db as defaultDb, type AnyGymDB } from './schema';
import { EQUIPMENT_IDS, type DumbbellRange, type EquipmentId, type ExerciseSetting, type Gym, type Unit } from './types';
import { cleanGymName, presetById, type GymPresetId } from '../lib/gymPresets';
import { validDumbbellRange } from '../lib/load';

export type NewGym = { preset: GymPresetId; name: string; city?: string; unit: Unit };

/** Adds a gym (not active yet: switching is its own step, so it can be previewed). */
export async function addGym(input: NewGym, db: AnyGymDB = defaultDb, now = Date.now()): Promise<Gym> {
  const preset = presetById(input.preset);
  const name = cleanGymName(input.name) || preset.label;
  const city = input.city ? cleanGymName(input.city) : '';
  const gym = makeGym({ name, type: preset.type, unit: input.unit, ...(city ? { city } : {}) }, now);
  await db.transaction('rw', db.gyms, () => db.gyms.add(gym));
  return gym;
}

/** A new name and city. An empty name keeps the old one; an empty city removes it. */
export async function setGymDetails(gymId: string, patch: { name?: string; city?: string }, db: AnyGymDB = defaultDb): Promise<Gym> {
  return db.transaction('rw', db.gyms, async () => {
    const gym = await db.gyms.get(gymId);
    if (!gym) throw new Error('Gym not found');
    const next: Gym = { ...gym };
    if (patch.name !== undefined) next.name = cleanGymName(patch.name) || gym.name;
    if (patch.city !== undefined) {
      const city = cleanGymName(patch.city);
      if (city) next.city = city;
      else delete next.city;
    }
    await db.gyms.put(next);
    return next;
  });
}

/**
 * What the gym has (the SPEC 3 picker). The dumbbell range is kept with the dumbbells: `range`
 * undefined keeps the saved one, null clears it. Without dumbbells there is no range.
 */
export async function setGymEquipment(gymId: string, equipment: readonly EquipmentId[], range?: DumbbellRange | null, db: AnyGymDB = defaultDb): Promise<Gym> {
  const on = new Set(equipment);
  const list = EQUIPMENT_IDS.filter((id) => on.has(id));
  if (range && !validDumbbellRange(range)) throw new Error('Invalid dumbbell range');
  return db.transaction('rw', db.gyms, async () => {
    const gym = await db.gyms.get(gymId);
    if (!gym) throw new Error('Gym not found');
    const kept = range === undefined ? gym.dumbbellRange : range;
    const next: Gym = { ...gym, equipment: list, dumbbellRange: on.has('dumbbells') ? kept : null };
    await db.gyms.put(next);
    return next;
  });
}

/**
 * A workout was logged at this gym (finished, imported or in progress), or a set was lifted there in
 * a workout that moved on to another gym. Reads the sets only when no workout says so.
 */
export async function gymInUse(gymId: string, db: AnyGymDB = defaultDb): Promise<boolean> {
  return db.transaction('r', db.sessions, db.sets, async () => {
    if ((await db.sessions.where('gymId').equals(gymId).count()) > 0) return true;
    return (await db.sets.filter((s) => s.gymId === gymId).count()) > 0;
  });
}

export class GymInUseError extends Error {
  constructor() {
    super('Workouts were logged at this gym');
    this.name = 'GymInUseError';
  }
}

export class LastGymError extends Error {
  constructor() {
    super('The only gym');
    this.name = 'LastGymError';
  }
}

/** What Undo puts back: the gym as it was, its own machine answers, and which gym was active. */
export type GymDeleteReceipt = {
  gym: Gym;
  settings: ExerciseSetting[];
  activeAfter: string | null;
  /** Every other gym's active flag and lastUsedAt as they were before the delete (Undo puts them back exactly). */
  others: Array<Pick<Gym, 'id' | 'isActive' | 'lastUsedAt'>>;
};

/**
 * Deletes a gym with no workouts, and its own machine answers. Never the last gym. When it was the
 * active one, the most recently used other gym takes over.
 */
export async function deleteGym(gymId: string, db: AnyGymDB = defaultDb): Promise<GymDeleteReceipt> {
  return db.transaction('rw', [db.gyms, db.sessions, db.sets, db.exerciseSettings], async () => {
    const gym = await db.gyms.get(gymId);
    if (!gym) throw new Error('Gym not found');
    if (await gymInUse(gymId, db)) throw new GymInUseError();
    const others = (await db.gyms.toArray()).filter((g) => g.id !== gymId);
    if (!others.length) throw new LastGymError();
    const snapshot = others.map((g) => ({ id: g.id, isActive: g.isActive, ...(g.lastUsedAt !== undefined ? { lastUsedAt: g.lastUsedAt } : {}) }));
    const settings = await db.exerciseSettings.filter((x) => x.gymId === gymId).toArray();
    await db.exerciseSettings.bulkDelete(settings.map((s) => [s.exerciseId, s.gymId] as [string, string]));
    await db.gyms.delete(gymId);
    let activeAfter: string | null = others.find((g) => g.isActive)?.id ?? null;
    if (gym.isActive || !activeAfter) {
      const next = [...others].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.createdAt - b.createdAt)[0]!;
      await db.gyms.put({ ...next, isActive: true });
      activeAfter = next.id;
    }
    return { gym, settings, activeAfter, others: snapshot };
  });
}

/**
 * Undo of deleteGym, one transaction: the gym and its answers are back, and the active flag and
 * lastUsedAt of every gym are what they were before the delete (the gym that took over gives it up).
 */
export async function undoDeleteGym(r: GymDeleteReceipt, db: AnyGymDB = defaultDb): Promise<void> {
  await db.transaction('rw', [db.gyms, db.exerciseSettings], async () => {
    if (await db.gyms.get(r.gym.id)) return;
    for (const o of r.others) {
      const g = await db.gyms.get(o.id);
      if (!g) continue;
      const next: Gym = { ...g, isActive: o.isActive && !r.gym.isActive };
      if (o.lastUsedAt === undefined) delete next.lastUsedAt;
      else next.lastUsedAt = o.lastUsedAt;
      if (next.isActive !== g.isActive || next.lastUsedAt !== g.lastUsedAt) await db.gyms.put(next);
    }
    await db.gyms.add(r.gym);
    if (r.settings.length) await db.exerciseSettings.bulkPut(r.settings);
  });
}
