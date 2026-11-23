// The run start screen's remembered choice (PLAN 4.2): the run type and its goals, one kv row.
// It stays on this phone (a preference, not history; no run is ever stored from here), and the
// distance unit is the profile's (Settings shows the same one).
import { durableRow } from '../lib/durable';
import type { DistanceUnit } from '../lib/intake/answers';
import { parseRunSetup, sanitizeRunSetup, type RunSetup } from '../lib/run/goal';
import { setProfileUnits } from './intake';
import { readRunUnit } from './runUnit';
import { db as defaultDb, type AnyGymDB } from './schema';

import { RUN_SETUP_KEY } from './runSetupKey';

export { RUN_SETUP_KEY };

export type RunSetupState = { setup: RunSetup; unit: DistanceUnit };

/** The saved setup (the default when nothing or nonsense is saved) and the profile's distance unit. */
export async function readRunSetup(db: AnyGymDB = defaultDb): Promise<RunSetupState> {
  const [row, unit] = await Promise.all([db.kv.get(RUN_SETUP_KEY), readRunUnit(db)]);
  return { setup: parseRunSetup(row?.value), unit };
}

export async function saveRunSetup(setup: RunSetup, db: AnyGymDB = defaultDb): Promise<void> {
  await db.kv.put(durableRow(RUN_SETUP_KEY, JSON.stringify(sanitizeRunSetup(setup))));
}

/** Miles or kilometers for runs: the profile's unit, the one Settings shows too. */
export async function saveRunUnit(unit: DistanceUnit, db: AnyGymDB = defaultDb): Promise<void> {
  await setProfileUnits({ distanceUnit: unit }, db);
}
