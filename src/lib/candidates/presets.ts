// The six places the library must cover (PLAN 3.5e targets): at least 25 sure moves for every place
// preset and at least 3 for every movement pattern. The kits are the SPEC 3 presets as a new gym gets
// them; Home starts empty in the app (the user picks), so here it is the SPEC 3 home picks (dumbbells,
// bands, a pull up bar), Dumbbells only is a 5 to 50 lb rack, Outdoors is a park with a bar.
import { equipmentPreset } from '../../db/gyms';
import type { GymKit } from '../picker';

export type PresetKitId = 'full' | 'hotel' | 'home' | 'dumbbells' | 'bodyweight' | 'outdoors';

export interface PresetKit {
  id: PresetKitId;
  label: string;
  kit: GymKit;
}

const RACK = { min: 5, max: 50, step: 5 };

export const PRESET_KITS: readonly PresetKit[] = [
  { id: 'full', label: 'Full gym', kit: equipmentPreset('full', 'lb') },
  { id: 'hotel', label: 'Hotel gym', kit: equipmentPreset('hotel', 'lb') },
  { id: 'home', label: 'Home', kit: { equipment: ['dumbbells', 'resistance_bands', 'pull_up_bar'], dumbbellRange: RACK } },
  { id: 'dumbbells', label: 'Dumbbells only', kit: { equipment: ['dumbbells'], dumbbellRange: RACK } },
  { id: 'bodyweight', label: 'Bodyweight', kit: equipmentPreset('none', 'lb') },
  { id: 'outdoors', label: 'Outdoors', kit: { equipment: ['pull_up_bar'], dumbbellRange: null } },
];

/** The places that were short before this item (PLAN 3.5e: the hotel had 13 sure moves). */
export const SHORT_PRESETS: readonly PresetKitId[] = ['hotel', 'home', 'dumbbells', 'bodyweight', 'outdoors'];

/** Leg patterns (the hotel had no sure leg move). */
export const LEG_GROUPS: readonly string[] = ['squat', 'hinge', 'lunge', 'quads isolation', 'hamstrings isolation', 'glutes', 'calves'];

export const PRESET_TARGET = 25;
export const PATTERN_TARGET = 3;
