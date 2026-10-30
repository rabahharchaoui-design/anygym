// Per gym, per machine weight answers (SPEC 5.3 first use prompt). Every write is transactional.
import { db as defaultDb, type AnyGymDB } from './schema';
import type { BarId, EquipmentWeight, Gym, PlateColors, Unit } from './types';
import { defaultBars, defaultPlateInventory, defaultStackStep, equipmentPreset } from './gyms';
import { preserveLegacyBars } from './history';

/** Machines whose answer is also a bar weight in `gym.bars`, kept in sync in the same write. */
const BAR_OF: Record<string, BarId> = { smith_machine: 'smith', ez_curl_bar: 'ez_curl', trap_bar: 'trap' };

function valid(entry: EquipmentWeight): boolean {
  return entry.value === null || (Number.isFinite(entry.value) && entry.value >= 0);
}

/** The gym's unit changed since the answer was typed (another tab, PLAN 2.0c): nothing was saved. */
export class UnitChangedError extends Error {
  constructor() {
    super('The gym units changed');
  }
}

/**
 * Saves the answer for one machine at one gym and returns the updated gym.
 * Smith, EZ curl and trap bar answers also set the matching `bars` weight (plates only = 0).
 * `unit`: the unit the answer was typed in (PLAN 2.0c). When the gym is in another unit by now
 * (changed in another tab), nothing is saved (UnitChangedError): 35 lb is never stored as 35 kg.
 * A bar answer first stores the bar of older sets logged here without one (preserveLegacyBars),
 * in the same transaction, so they never move between histories.
 */
export async function setEquipmentWeight(
  gymId: string,
  machineId: string,
  entry: EquipmentWeight,
  db: AnyGymDB = defaultDb,
  unit?: Unit,
): Promise<Gym> {
  if (!machineId || !valid(entry)) throw new Error('Invalid equipment weight');
  return db.transaction('rw', [db.gyms, db.sets, db.sessions], async () => {
    const gym = await db.gyms.get(gymId);
    if (!gym) throw new Error('Gym not found');
    if (unit !== undefined && unit !== gym.unit) throw new UnitChangedError();
    const next: Gym = { ...gym, equipmentWeights: { ...gym.equipmentWeights, [machineId]: { ...entry } } };
    const bar = BAR_OF[machineId];
    if (bar) {
      if (gym.bars[bar] !== entry.value) await preserveLegacyBars(db, gym);
      next.bars = { ...gym.bars, [bar]: entry.value };
    }
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
 * Before the gym changes, older sets logged here without a bar id get the bar their stored
 * evidence resolves to on the gym as it is (PLAN 2.0c, preserveLegacyBars), in the same
 * transaction: a legacy Smith set never turns into Olympic history after the switch.
 */
export async function setGymUnit(gymId: string, unit: Unit, db: AnyGymDB = defaultDb): Promise<Gym> {
  if (unit !== 'lb' && unit !== 'kg') throw new Error('Invalid unit');
  return db.transaction('rw', [db.gyms, db.sets, db.sessions], async () => {
    const gym = await db.gyms.get(gymId);
    if (!gym) throw new Error('Gym not found');
    if (gym.unit === unit) return gym;
    await preserveLegacyBars(db, gym);
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
