// "+ New gym" (PLAN 3.9, SPEC 3 and 19): the five starting points and the plain words that describe a
// gym's equipment. Pure data and words; db/gyms.ts builds the record. A preset only says what the
// gym has; plates, bars and machine weights start at the SPEC 5.3 defaults and the first use
// prompts ask the rest, never a guess.
import { EQUIPMENT_IDS, type EquipmentId, type Gym, type GymType } from '../db/types';
import { EQUIPMENT_LABEL } from './intake/options';
import { formatAmount } from './load';

export type GymPresetId = 'hotel' | 'full' | 'home' | 'outdoors' | 'none';

export type GymPreset = {
  id: GymPresetId;
  /** The card's label and the name a new gym gets until the user types one. */
  label: string;
  hint: string;
  /** Where it lands in the SPEC 3 presets. Outdoors starts with nothing, like the intake's outdoors. */
  type: GymType;
};

/** SPEC 19 order: Hotel gym, Full gym, Home, Outdoors, No equipment. */
export const GYM_PRESETS: readonly GymPreset[] = [
  { id: 'hotel', label: 'Hotel gym', hint: 'Dumbbells, a bench, a cable, treadmill and bike', type: 'hotel' },
  { id: 'full', label: 'Full gym', hint: 'Everything on. Turn off what is missing.', type: 'full' },
  { id: 'home', label: 'Home', hint: 'Starts empty. You pick what you have.', type: 'home' },
  { id: 'outdoors', label: 'Outdoors', hint: 'A park or a track. Add a pull up bar or bands if there.', type: 'none' },
  { id: 'none', label: 'No equipment', hint: 'Floor and bodyweight only', type: 'none' },
];

export const presetById = (id: GymPresetId): GymPreset => GYM_PRESETS.find((p) => p.id === id)!;

/** The words for a name typed in: trimmed, inner runs of spaces made one, at most 40 characters. */
export function cleanGymName(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** Cardio and extras say little about what you can lift: they come last in the summary. */
const LIFT_FIRST: readonly EquipmentId[] = [
  'barbell_rack',
  'dumbbells',
  'cable_station',
  'smith_machine',
  'kettlebells',
  'adjustable_bench',
  'flat_bench',
  'leg_press',
  'lat_pulldown',
  'pull_up_bar',
  ...EQUIPMENT_IDS,
];

/**
 * One short line about a gym's equipment, only from what is saved: "Everything", "Nothing: bodyweight
 * only", or the first two items in plain words with how many more ("Dumbbells 5 to 50 lb, cable
 * station + 3 more"). The dumbbell range shows only when the gym has one saved.
 */
export function equipmentSummary(gym: Pick<Gym, 'equipment' | 'dumbbellRange' | 'unit'>): string {
  const on = new Set(gym.equipment);
  if (on.size === 0) return 'Nothing: bodyweight only';
  if (EQUIPMENT_IDS.every((id) => on.has(id))) return 'Everything';
  const order = [...new Set(LIFT_FIRST)].filter((id) => on.has(id));
  const words = order.slice(0, 2).map((id, i) => {
    const label = i === 0 ? EQUIPMENT_LABEL[id] : EQUIPMENT_LABEL[id].toLowerCase();
    if (id === 'dumbbells' && gym.dumbbellRange) return `${label} ${formatAmount(gym.dumbbellRange.min)} to ${formatAmount(gym.dumbbellRange.max)} ${gym.unit}`;
    return label;
  });
  const more = order.length - words.length;
  return `${words.join(', ')}${more > 0 ? ` + ${more} more` : ''}`;
}

/** "Tokyo · Dumbbells 5 to 50 lb + 3 more": the quiet second line of a gym row. */
export function gymLine(gym: Pick<Gym, 'equipment' | 'dumbbellRange' | 'unit' | 'city'>): string {
  return gym.city ? `${gym.city} · ${equipmentSummary(gym)}` : equipmentSummary(gym);
}

/** Recent first (last made active), then the oldest made first: the gym sheet's order. */
export function recentGyms<T extends Pick<Gym, 'lastUsedAt' | 'createdAt' | 'isActive'>>(gyms: readonly T[]): T[] {
  return [...gyms].sort((a, b) => Number(b.isActive) - Number(a.isActive) || (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.createdAt - b.createdAt);
}
