// Per gym, per machine weight answers (SPEC 5.3 first use prompt). Every write is transactional.
import { db as defaultDb, type AnyGymDB } from './schema';
import type { BarId, EquipmentWeight, Gym, PlateColors, Unit } from './types';
import { defaultBars, defaultPlateInventory, defaultStackStep, equipmentPreset } from './gyms';

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

/** Colored (IWF) plates or plain black plates in the plate drawings, per gym (Settings). */
export async function setPlateColors(gymId: string, mode: PlateColors, db: AnyGymDB = defaultDb): Promise<Gym> {
  if (mode !== 'black' && mode !== 'color') throw new Error('Invalid plate colors');
  return db.transaction('rw', db.gyms, async () => {
    const gym = await db.gyms.get(gymId);
    if (!gym) throw new Error('Gym not found');
    const next: Gym = { ...gym, plateColors: mode };
    await db.gyms.put(next);
    return next;
  });
}

/**
 * lb or kg for a gym (SPEC 3: the unit is per gym). Every weight the gym stores is in its unit, so
 * switching starts its plates, bars, stack step and dumbbells over from that unit's defaults and
 * clears the answers given in the other unit (EZ, trap, Smith, starting weights): never a converted
 * guess. The plate color choice stays. The same unit again changes nothing.
 */
export async function setGymUnit(gymId: string, unit: Unit, db: AnyGymDB = defaultDb): Promise<Gym> {
  if (unit !== 'lb' && unit !== 'kg') throw new Error('Invalid unit');
  return db.transaction('rw', db.gyms, async () => {
    const gym = await db.gyms.get(gymId);
    if (!gym) throw new Error('Gym not found');
    if (gym.unit === unit) return gym;
    const preset = equipmentPreset(gym.type, unit);
    const next: Gym = {
      ...gym,
      unit,
      bars: defaultBars(unit),
      stackStep: defaultStackStep(unit),
      plateInventory: defaultPlateInventory(unit),
      equipmentWeights: {},
      dumbbellRange: gym.dumbbellRange ? (preset.dumbbellRange ?? null) : null,
    };
    await db.gyms.put(next);
    return next;
  });
}
