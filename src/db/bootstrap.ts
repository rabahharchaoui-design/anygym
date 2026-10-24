import { makeGym } from './gyms';
import { db as defaultDb, type AnyGymDB } from './schema';
import type { Gym } from './types';

/**
 * First launch: if there are no gyms, create "My Gym" (full, lb, active).
 * Idempotent: the count and the add run in one readwrite transaction, which
 * IndexedDB serializes, so concurrent calls still leave exactly one gym.
 * Returns the active gym.
 */
export async function ensureFirstGym(db: AnyGymDB = defaultDb): Promise<Gym> {
  return db.transaction('rw', db.gyms, async () => {
    if ((await db.gyms.count()) === 0) {
      await db.gyms.add(makeGym({ name: 'My Gym', type: 'full', unit: 'lb', isActive: true }));
    }
    const gym = await activeGymIn(db);
    if (!gym) throw new Error('No gym after ensureFirstGym');
    return gym;
  });
}

/** The active gym, or the oldest gym if none is flagged active. */
export async function getActiveGym(db: AnyGymDB = defaultDb): Promise<Gym | undefined> {
  return db.transaction('r', db.gyms, () => activeGymIn(db));
}

async function activeGymIn(db: AnyGymDB): Promise<Gym | undefined> {
  const gyms = await db.gyms.orderBy('createdAt').toArray();
  return gyms.find((g) => g.isActive) ?? gyms[0];
}

let started: Promise<Gym> | null = null;

/** App start: run ensureFirstGym once per page load and share the result. */
export function startDb(): Promise<Gym> {
  started ??= ensureFirstGym();
  return started;
}
