// The distance unit runs are shown in: the profile's, else the phone's region. Its own small file so
// History can read it without the run setup code (PLAN 4.6).
import { phoneLocale, unitsForLocale } from '../lib/intake/region';
import type { DistanceUnit } from '../lib/intake/answers';
import { db as defaultDb, type AnyGymDB } from './schema';

export async function readRunUnit(db: AnyGymDB = defaultDb): Promise<DistanceUnit> {
  // The first profile row (the same one db/intake getProfile returns), read here so History does not load all of db/intake.
  const profile = (await db.profile.toArray()).sort((a, b) => a.createdAt - b.createdAt)[0];
  return profile?.distanceUnit ?? profile?.intake?.units?.distance ?? unitsForLocale(phoneLocale()).distance;
}
