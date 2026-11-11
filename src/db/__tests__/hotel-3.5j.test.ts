// PLAN 3.5j: + New gym saves what the user tapped (G's hotel gym, dumbbells up to 22 kg). Additive
// only: a gym or a backup from before the elliptical and the yoga mat keeps working unchanged.
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RECORD_CHECKS } from '../../lib/backup';
import { dumbbellCapIn, parseDumbbellRange } from '../../lib/load';
import { makeGym } from '../gyms';
import { addGym, setGymEquipment } from '../gymList';
import { AnyGymDB } from '../schema';
import { EQUIPMENT_IDS, type EquipmentId, type Gym } from '../types';

const G_GEAR: EquipmentId[] = ['yoga_mat', 'treadmill', 'elliptical', 'stair_climber', 'leg_extension', 'leg_curl', 'chest_press_machine', 'shoulder_press_machine', 'flat_bench', 'adjustable_bench', 'dumbbells', 'kettlebells', 'lat_pulldown', 'cable_station'];

let db: AnyGymDB;
let n = 0;
beforeEach(async () => {
  db = new AnyGymDB(`anygym-hotel35j-${n++}`);
  await db.open();
  await db.gyms.add(makeGym({ name: 'Home', type: 'full', unit: 'lb', isActive: true }));
});
afterEach(async () => {
  await db.delete();
});

describe('+ New gym with the equipment tapped', () => {
  it('saves his list in SPEC 3 order and the rack capped at 22 kg (45 lb at a lb gym, 22 kg at a kg gym)', async () => {
    const lb = await addGym({ preset: 'hotel', name: 'Guam', unit: 'lb', equipment: G_GEAR, dumbbellRange: parseDumbbellRange('5', '22', '5', 'lb', 'kg') }, db);
    expect(lb.equipment).toEqual(EQUIPMENT_IDS.filter((id) => G_GEAR.includes(id)));
    expect(lb.equipment.slice(-2)).toEqual(['elliptical', 'yoga_mat']);
    expect(lb.dumbbellRange).toEqual({ min: 5, max: 45, step: 5 });
    expect(lb).toMatchObject({ type: 'hotel', unit: 'lb', isActive: false });
    const kg = await addGym({ preset: 'hotel', name: 'Guam kg', unit: 'kg', equipment: G_GEAR, dumbbellRange: { min: 2, max: dumbbellCapIn(22, 'kg', 'kg', 2, 2)!, step: 2 } }, db);
    expect(kg.dumbbellRange).toEqual({ min: 2, max: 22, step: 2 });
    for (const g of await db.gyms.toArray()) expect(RECORD_CHECKS.gyms(g), g.name).toBe(true);
  });

  it('without dumbbells there is no rack; no list given: the preset; a broken rack is refused, nothing saved', async () => {
    const none = await addGym({ preset: 'hotel', name: 'No dumbbells', unit: 'lb', equipment: ['treadmill', 'elliptical'], dumbbellRange: { min: 5, max: 45, step: 5 } }, db);
    expect(none.dumbbellRange).toBeNull();
    const preset = await addGym({ preset: 'hotel', name: 'Preset', unit: 'kg' }, db);
    expect(preset.equipment).toEqual(makeGym({ name: 'x', type: 'hotel', unit: 'kg' }).equipment);
    expect(preset.dumbbellRange).toEqual({ min: 2, max: 24, step: 2 });
    const unknown = await addGym({ preset: 'home', name: 'Home 2', unit: 'lb', equipment: ['dumbbells'], dumbbellRange: null }, db);
    expect(unknown.dumbbellRange).toBeNull();
    const before = await db.gyms.count();
    await expect(addGym({ preset: 'hotel', name: 'Bad', unit: 'lb', equipment: ['dumbbells'], dumbbellRange: { min: 5, max: 45, step: 0 } }, db)).rejects.toThrow('Invalid dumbbell range');
    expect(await db.gyms.count()).toBe(before);
  });

  it('a gym saved before 3.5j (no elliptical, no yoga mat) loads, passes the backup check and is edited as before', async () => {
    const legacy: Gym = { ...makeGym({ name: 'Old', type: 'full', unit: 'lb' }), equipment: EQUIPMENT_IDS.filter((id) => id !== 'elliptical' && id !== 'yoga_mat') };
    await db.gyms.add(legacy);
    const read = (await db.gyms.get(legacy.id))!;
    expect(read.equipment).not.toContain('elliptical');
    expect(RECORD_CHECKS.gyms(read)).toBe(true);
    const next = await setGymEquipment(legacy.id, [...read.equipment, 'elliptical'], undefined, db);
    expect(next.equipment.at(-1)).toBe('elliptical');
    expect(next.dumbbellRange).toEqual(read.dumbbellRange);
  });
});
