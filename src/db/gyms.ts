// Gym profile defaults (SPEC 3 presets, SPEC 5.3 bars and plate inventory).
import { newId } from './ids';
import {
  EQUIPMENT_IDS,
  type Bars,
  type DumbbellRange,
  type EquipmentWeight,
  type EquipmentId,
  type Gym,
  type GymType,
  type PlateColors,
  type PlateToggle,
  type Unit,
} from './types';

/** Only true standards get numbers. Everything brand dependent stays null until the user answers. */
export function defaultBars(unit: Unit): Bars {
  return {
    olympic: unit === 'lb' ? 45 : 20,
    womens: unit === 'lb' ? 35 : 15,
    ez_curl: null,
    trap: null,
    smith: null,
  };
}

const PLATES_ON: Record<Unit, number[]> = {
  lb: [45, 35, 25, 10, 5, 2.5],
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
};
const PLATES_OFF: Record<Unit, number[]> = {
  lb: [100, 55, 1.25],
  kg: [2, 1.5, 1, 0.5],
};

/** Every plate the gym could have, heaviest first, with SPEC 5.3 on/off defaults. */
export function defaultPlateInventory(unit: Unit): PlateToggle[] {
  return [
    ...PLATES_ON[unit].map((weight) => ({ weight, enabled: true })),
    ...PLATES_OFF[unit].map((weight) => ({ weight, enabled: false })),
  ].sort((a, b) => b.weight - a.weight);
}

/** SPEC 5.3 default stack step; the first use prompt confirms or edits it. */
export function defaultStackStep(unit: Unit): number {
  return unit === 'lb' ? 5 : 2.5;
}

/** Stack step for a machine: its own 'stack_step' answer if set, else the gym default. */
export function stackStepFor(gym: Pick<Gym, 'stackStep' | 'equipmentWeights'>, machineId: string): number {
  const own = gym.equipmentWeights[machineId];
  return own?.kind === 'stack_step' && own.value !== null ? own.value : gym.stackStep;
}

/** The saved answer for a machine at this gym, or undefined when never answered. */
export function equipmentWeightFor(gym: Pick<Gym, 'equipmentWeights'>, machineId: string): EquipmentWeight | undefined {
  return gym.equipmentWeights[machineId];
}

/**
 * Starting resistance of a plate loaded machine: 0 for "plates only", the listed value, or
 * null until the user answers (then the UI shows "+ start", never a guess).
 */
export function machineStartFor(gym: Pick<Gym, 'equipmentWeights'>, machineId: string): number | null {
  const own = gym.equipmentWeights[machineId];
  if (own?.kind === 'plates_only') return 0;
  if (own?.kind === 'starting_resistance') return own.value;
  return null;
}

export function defaultPlateColors(_unit: Unit): PlateColors {
  // PLAN 2.0d: picture first plates are colour coded in every unit; black iron stays a Settings choice.
  return 'color';
}

/** Full gym dumbbell range. A starting point the user edits, like every preset. */
const FULL_DUMBBELLS: Record<Unit, DumbbellRange> = {
  lb: { min: 5, max: 100, step: 5 },
  kg: { min: 2, max: 50, step: 2 },
};
const HOTEL_DUMBBELLS: Record<Unit, DumbbellRange> = {
  lb: { min: 5, max: 50, step: 5 },
  kg: { min: 2, max: 24, step: 2 },
};

export type EquipmentPreset = { equipment: EquipmentId[]; dumbbellRange: DumbbellRange | null };

export function equipmentPreset(type: GymType, unit: Unit): EquipmentPreset {
  switch (type) {
    case 'full':
      return { equipment: [...EQUIPMENT_IDS], dumbbellRange: { ...FULL_DUMBBELLS[unit] } };
    case 'hotel':
      return {
        equipment: ['dumbbells', 'adjustable_bench', 'cable_station', 'treadmill', 'bike'],
        dumbbellRange: { ...HOTEL_DUMBBELLS[unit] },
      };
    // Home: dumbbells, bands and pull up bar start off; the user picks.
    case 'home':
    case 'none':
      return { equipment: [], dumbbellRange: null };
  }
}

export type NewGymInput = { name: string; type: GymType; unit: Unit; isActive?: boolean };

/** Builds a complete gym record with defaults. Pure; does not write. */
export function makeGym({ name, type, unit, isActive = false }: NewGymInput, now = Date.now()): Gym {
  const preset = equipmentPreset(type, unit);
  return {
    id: newId(),
    name,
    type,
    unit,
    equipment: preset.equipment,
    dumbbellRange: preset.dumbbellRange,
    bars: defaultBars(unit),
    stackStep: defaultStackStep(unit),
    equipmentWeights: {},
    plateInventory: defaultPlateInventory(unit),
    collars: 'none',
    plateColors: defaultPlateColors(unit),
    isActive,
    createdAt: now,
  };
}
