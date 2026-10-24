import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnyGymDB } from '../schema';
import { setEquipmentWeight } from '../equipment';
import { equipmentWeightFor, machineStartFor, makeGym, stackStepFor } from '../gyms';
import type { Gym } from '../types';

let db: AnyGymDB;
let gym: Gym;
let n = 0;

beforeEach(async () => {
  db = new AnyGymDB(`anygym-equip-${n++}`);
  await db.open();
  gym = makeGym({ name: 'Test', type: 'full', unit: 'lb', isActive: true });
  await db.gyms.add(gym);
});
afterEach(async () => {
  await db.delete();
});

describe('setEquipmentWeight', () => {
  it('saves a plate machine answer and reads back as the start', async () => {
    expect(machineStartFor(gym, 'leg_press')).toBeNull();
    const out = await setEquipmentWeight(gym.id, 'leg_press', { kind: 'plates_only', value: 0 }, db);
    expect(out.equipmentWeights.leg_press).toEqual({ kind: 'plates_only', value: 0 });
    const stored = (await db.gyms.get(gym.id))!;
    expect(machineStartFor(stored, 'leg_press')).toBe(0);
    await setEquipmentWeight(gym.id, 'leg_press', { kind: 'starting_resistance', value: 110 }, db);
    const again = (await db.gyms.get(gym.id))!;
    expect(machineStartFor(again, 'leg_press')).toBe(110);
    expect(equipmentWeightFor(again, 'leg_press')).toEqual({ kind: 'starting_resistance', value: 110 });
    expect(equipmentWeightFor(again, 'hack_squat')).toBeUndefined();
  });

  it('keeps other answers and the stack step override', async () => {
    await setEquipmentWeight(gym.id, 'lat_pulldown', { kind: 'stack_step', value: 10 }, db);
    await setEquipmentWeight(gym.id, 'leg_press', { kind: 'plates_only', value: 0 }, db);
    const stored = (await db.gyms.get(gym.id))!;
    expect(stackStepFor(stored, 'lat_pulldown')).toBe(10);
    expect(stackStepFor(stored, 'seated_row')).toBe(5);
    expect(Object.keys(stored.equipmentWeights).sort()).toEqual(['lat_pulldown', 'leg_press']);
    expect(machineStartFor(stored, 'lat_pulldown')).toBeNull(); // a stack step is not a start
  });

  it('mirrors bar answers into bars', async () => {
    await setEquipmentWeight(gym.id, 'smith_machine', { kind: 'plates_only', value: 0 }, db);
    await setEquipmentWeight(gym.id, 'ez_curl_bar', { kind: 'bar_weight', value: 25 }, db);
    await setEquipmentWeight(gym.id, 'trap_bar', { kind: 'bar_weight', value: 55 }, db);
    const stored = (await db.gyms.get(gym.id))!;
    expect(stored.bars).toMatchObject({ smith: 0, ez_curl: 25, trap: 55, olympic: 45 });
  });

  it('rejects bad input and unknown gyms without writing', async () => {
    await expect(setEquipmentWeight(gym.id, 'leg_press', { kind: 'starting_resistance', value: -5 }, db)).rejects.toThrow();
    await expect(setEquipmentWeight(gym.id, 'leg_press', { kind: 'starting_resistance', value: Number.NaN }, db)).rejects.toThrow();
    await expect(setEquipmentWeight(gym.id, '', { kind: 'plates_only', value: 0 }, db)).rejects.toThrow();
    await expect(setEquipmentWeight('nope', 'leg_press', { kind: 'plates_only', value: 0 }, db)).rejects.toThrow('Gym not found');
    expect((await db.gyms.get(gym.id))!.equipmentWeights).toEqual({});
    // null (unknown) is a valid answer to store.
    await setEquipmentWeight(gym.id, 'leg_press', { kind: 'starting_resistance', value: null }, db);
    expect(machineStartFor((await db.gyms.get(gym.id))!, 'leg_press')).toBeNull();
  });
});
