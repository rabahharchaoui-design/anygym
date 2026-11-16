// Settings' gym block (lb / kg and plate colors) through one door, so the screen never imports
// src/db/ (3.6z A14: the unit switch comes with its Undo).
import { setGymUnit, setPlateColors, undoGymUnit } from '../db/equipment';
import type { Gym, Unit } from '../db/types';

/** Switches the gym's unit; the Undo puts the gym record from before the switch back. */
export async function switchGymUnit(gym: Gym, unit: Unit): Promise<{ undo: () => Promise<Gym> }> {
  const before = gym;
  await setGymUnit(gym.id, unit);
  return { undo: () => undoGymUnit(before) };
}

export const setGymPlateColors = (gym: Gym, on: boolean): Promise<Gym> => setPlateColors(gym.id, on ? 'color' : 'black');
