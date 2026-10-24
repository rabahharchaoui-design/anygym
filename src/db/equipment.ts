// Per gym, per machine weight answers (SPEC 5.3 first use prompt). Every write is transactional.
import { db as defaultDb, type AnyGymDB } from './schema';
import type { BarId, EquipmentWeight, Gym } from './types';

/** Machines whose answer is also a bar weight in `gym.bars`, kept in sync in the same write. */
const BAR_OF: Record<string, BarId> = { smith_machine: 'smith', ez_curl_bar: 'ez_curl', trap_bar: 'trap' };

function valid(entry: EquipmentWeight): boolean {
  return entry.value === null || (Number.isFinite(entry.value) && entry.value >= 0);
}

/**
 * Saves the answer for one machine at one gym and returns the updated gym.
 * Smith, EZ curl and trap bar answers also set the matching `bars` weight (plates only = 0).
 */
export async function setEquipmentWeight(
  gymId: string,
  machineId: string,
  entry: EquipmentWeight,
  db: AnyGymDB = defaultDb,
): Promise<Gym> {
  if (!machineId || !valid(entry)) throw new Error('Invalid equipment weight');
  return db.transaction('rw', db.gyms, async () => {
    const gym = await db.gyms.get(gymId);
    if (!gym) throw new Error('Gym not found');
    const next: Gym = { ...gym, equipmentWeights: { ...gym.equipmentWeights, [machineId]: { ...entry } } };
    const bar = BAR_OF[machineId];
    if (bar) next.bars = { ...gym.bars, [bar]: entry.value };
    await db.gyms.put(next);
    return next;
  });
}
