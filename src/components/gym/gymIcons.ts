// One Lucide icon per kind of gym (PLAN 3.9): the preset cards and the gym rows.
import type { LucideIcon } from 'lucide-react';
import { BodyweightIcon, GymIcon, HomeIcon, OutdoorsIcon, TravelIcon } from '../../ui/icons';
import type { GymType } from '../../db/types';
import type { GymPresetId } from '../../lib/gymPresets';

export const PRESET_ICON: Record<GymPresetId, LucideIcon> = { hotel: TravelIcon, full: GymIcon, home: HomeIcon, outdoors: OutdoorsIcon, none: BodyweightIcon };

/** Outdoors is stored as a gym with no equipment preset ('none'): it shares that icon. */
export const TYPE_ICON: Record<GymType, LucideIcon> = { hotel: TravelIcon, full: GymIcon, home: HomeIcon, none: BodyweightIcon };
