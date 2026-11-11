// The equipment picker's groups (PLAN 3.3a, SPEC 3 list). Every one of the 29 items is in exactly
// one group, in this order. Plain data; the screen draws a picture per item (EquipmentArt.tsx).
import { EQUIPMENT_IDS, type EquipmentId } from '../../db/types';

export type EquipmentGroupId = 'free' | 'benches' | 'machines' | 'cables' | 'extras';
export type EquipmentGroup = { id: EquipmentGroupId; label: string; items: readonly EquipmentId[] };

export const EQUIPMENT_GROUPS: readonly EquipmentGroup[] = [
  { id: 'free', label: 'Free weights', items: ['barbell_rack', 'ez_curl_bar', 'dumbbells', 'kettlebells'] },
  { id: 'benches', label: 'Benches and bars', items: ['flat_bench', 'adjustable_bench', 'hyperextension_bench', 'pull_up_bar', 'dip_station'] },
  {
    id: 'machines',
    label: 'Machines',
    items: ['smith_machine', 'leg_press', 'leg_extension', 'leg_curl', 'chest_press_machine', 'pec_deck', 'shoulder_press_machine', 'calf_raise_machine', 'hip_adductor_abductor'],
  },
  { id: 'cables', label: 'Cables', items: ['cable_station', 'lat_pulldown', 'seated_row'] },
  { id: 'extras', label: 'Cardio and extras', items: ['resistance_bands', 'jump_rope', 'yoga_mat', 'treadmill', 'elliptical', 'bike', 'stair_climber', 'rower'] },
];

/** The groups with only what this place asks about; a group with nothing left is left out. */
export function groupsFor(choices: readonly EquipmentId[]): EquipmentGroup[] {
  const asked = new Set(choices);
  return EQUIPMENT_GROUPS.map((g) => ({ ...g, items: g.items.filter((id) => asked.has(id)) })).filter((g) => g.items.length > 0);
}

/** A group's All toggle: everything in it on, or (all on already) everything in it off. Order stays SPEC 3. */
export function toggleGroup(value: readonly EquipmentId[], items: readonly EquipmentId[]): EquipmentId[] {
  const on = new Set(value);
  const allOn = items.every((id) => on.has(id));
  for (const id of items) {
    if (allOn) on.delete(id);
    else on.add(id);
  }
  return EQUIPMENT_IDS.filter((id) => on.has(id));
}

/** One tile tapped: on or off, in SPEC 3 order. */
export function toggleItem(value: readonly EquipmentId[], id: EquipmentId): EquipmentId[] {
  const on = new Set(value);
  if (on.has(id)) on.delete(id);
  else on.add(id);
  return EQUIPMENT_IDS.filter((x) => on.has(x));
}
