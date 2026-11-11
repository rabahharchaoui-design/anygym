// The intake funnel's questions and options (SPEC 14, PLAN 3.3). Plain data: labels in plain
// words, stable ids that are stored, an icon name the screen maps to one Lucide icon. No React.
import type { EquipmentId } from '../../db/types';

export type Option<T extends string = string> = { id: T; label: string; icon?: string; hint?: string };

export const GOALS = [
  { id: 'muscle', label: 'Build muscle', icon: 'Dumbbell' },
  { id: 'strength', label: 'Get stronger', icon: 'Trophy' },
  { id: 'fat_loss', label: 'Lose fat', icon: 'Flame' },
  { id: 'tone', label: 'Tone up', icon: 'Sparkles' },
  { id: 'health', label: 'Stay healthy', icon: 'Heart' },
  { id: 'athletic', label: 'Athletic performance', icon: 'Zap' },
  { id: 'race', label: 'Train for a race', icon: 'Flag' },
  { id: 'comeback', label: 'Get back into it', icon: 'RotateCcw' },
] as const satisfies readonly Option[];
export type GoalId = (typeof GOALS)[number]['id'];

export const FOCUS = [
  { id: 'chest', label: 'Chest', icon: 'Body:chest' },
  { id: 'back', label: 'Back', icon: 'Body:back' },
  { id: 'shoulders', label: 'Shoulders', icon: 'Body:shoulders' },
  { id: 'arms', label: 'Arms', icon: 'Body:arms' },
  { id: 'core', label: 'Abs and core', icon: 'Body:core' },
  { id: 'glutes', label: 'Glutes', icon: 'Body:glutes' },
  { id: 'legs', label: 'Legs', icon: 'Body:legs' },
  { id: 'balance', label: 'Whole body balance', icon: 'Body:balance' },
] as const satisfies readonly Option[];
export type FocusId = (typeof FOCUS)[number]['id'];

export const WINS = [
  { id: 'clothes', label: 'Look better in clothes', icon: 'Shirt' },
  { id: 'arms', label: 'Bigger arms', icon: 'Dumbbell' },
  { id: 'lifts', label: 'Stronger lifts', icon: 'TrendingUp' },
  { id: 'energy', label: 'More energy', icon: 'BatteryCharging' },
  { id: 'posture', label: 'Better posture', icon: 'PersonStanding' },
  { id: 'belly', label: 'Lose belly fat', icon: 'Flame' },
  { id: 'run', label: 'Run farther', icon: 'Footprints' },
  { id: 'stiff', label: 'Feel less stiff', icon: 'Wind' },
] as const satisfies readonly Option[];
export type WinId = (typeof WINS)[number]['id'];

export const EXPERIENCE = [
  { id: 'new', label: 'Brand new', icon: 'Sprout' },
  { id: 'months', label: 'A few months', icon: 'Leaf' },
  { id: '1_2y', label: '1 to 2 years', icon: 'TrendingUp' },
  { id: '3y', label: '3+ years', icon: 'Medal' },
  { id: 'break', label: 'Coming back after a break', icon: 'RotateCcw' },
] as const satisfies readonly Option[];
export type ExperienceId = (typeof EXPERIENCE)[number]['id'];

export const DAYS = [2, 3, 4, 5, 6] as const;
export type DaysPerWeek = (typeof DAYS)[number];

/** Monday first; ids are stable, labels short (chips). */
export const WEEKDAYS = [
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: 'Tue' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: 'Thu' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: 'Sat' },
  { id: 'sun', label: 'Sun' },
] as const satisfies readonly Option[];
export type WeekdayId = (typeof WEEKDAYS)[number]['id'];

export const MINUTES = [20, 30, 45, 60, 75] as const;
export type Minutes = (typeof MINUTES)[number];

export const PLACES = [
  { id: 'full', label: 'Full gym', icon: 'Warehouse' },
  { id: 'hotel', label: 'Hotel gyms', hint: 'I travel a lot', icon: 'Luggage' },
  { id: 'home', label: 'Home', icon: 'House' },
  { id: 'outdoors', label: 'Outdoors', icon: 'Trees' },
  { id: 'mix', label: 'Mix of everything', icon: 'Shuffle' },
] as const satisfies readonly Option[];
export type PlaceAnswer = (typeof PLACES)[number]['id'];

export const STYLES = [
  { id: 'free', label: 'Free weights', icon: 'Dumbbell' },
  { id: 'machines', label: 'Machines', icon: 'Cog' },
  { id: 'mix', label: 'Mix', icon: 'Shuffle' },
  { id: 'bodyweight', label: 'Bodyweight', icon: 'PersonStanding' },
  { id: 'any', label: 'Whatever works', icon: 'ThumbsUp' },
] as const satisfies readonly Option[];
export type StyleId = (typeof STYLES)[number]['id'];

export const CARDIO = [
  { id: 'love', label: 'Love it', icon: 'HeartPulse' },
  { id: 'little', label: 'A little', icon: 'Activity' },
  { id: 'if_needed', label: 'Only if I have to', icon: 'Hourglass' },
  { id: 'none', label: 'None', icon: 'Ban' },
] as const satisfies readonly Option[];
export type CardioId = (typeof CARDIO)[number]['id'];

export const CARDIO_FAVORITES = [
  { id: 'running', label: 'Running', icon: 'Footprints' },
  { id: 'treadmill', label: 'Treadmill', icon: 'Gauge' },
  { id: 'bike', label: 'Bike', icon: 'Bike' },
  { id: 'stairs', label: 'Stairs', icon: 'TrendingUp' },
  { id: 'rower', label: 'Rower', icon: 'Waves' },
  { id: 'jump_rope', label: 'Jump rope', icon: 'Repeat' },
  { id: 'walking', label: 'Walking', icon: 'Route' },
] as const satisfies readonly Option[];
export type CardioFavoriteId = (typeof CARDIO_FAVORITES)[number]['id'];

/** "None" is exclusive: picking it clears the rest, picking another clears it. */
export const EASY_ON = [
  { id: 'lower_back', label: 'Lower back', icon: 'Body:lowerBack' },
  { id: 'knees', label: 'Knees', icon: 'Body:knees' },
  { id: 'shoulders', label: 'Shoulders', icon: 'Body:shoulders' },
  { id: 'wrists', label: 'Wrists', icon: 'Body:wrists' },
  { id: 'neck', label: 'Neck', icon: 'Body:neck' },
  { id: 'hips', label: 'Hips', icon: 'Body:hips' },
  { id: 'none', label: 'None', icon: 'Ban' },
] as const satisfies readonly Option[];
export type EasyOnId = (typeof EASY_ON)[number]['id'];

export const WHEN = [
  { id: 'early', label: 'Early morning', icon: 'Sunrise' },
  { id: 'lunch', label: 'Lunch', icon: 'Sun' },
  { id: 'after_work', label: 'After work', icon: 'Sunset' },
  { id: 'night', label: 'Night', icon: 'Moon' },
] as const satisfies readonly Option[];
export type WhenId = (typeof WHEN)[number]['id'];

export const AGE_RANGES = [
  { id: 'under_25', label: 'Under 25' },
  { id: '25_34', label: '25 to 34' },
  { id: '35_44', label: '35 to 44' },
  { id: '45_54', label: '45 to 54' },
  { id: '55_64', label: '55 to 64' },
  { id: '65', label: '65+' },
] as const satisfies readonly Option[];
export type AgeRangeId = (typeof AGE_RANGES)[number]['id'];

export const ids = <T extends string>(list: readonly Option<T>[]): readonly T[] => list.map((o) => o.id);
export const labelOf = <T extends string>(list: readonly Option<T>[], id: T | undefined): string | undefined => list.find((o) => o.id === id)?.label;

/** SPEC 3 equipment picker words, in picker order. */
export const EQUIPMENT_LABEL: Record<EquipmentId, string> = {
  barbell_rack: 'Barbell and rack',
  flat_bench: 'Flat bench',
  adjustable_bench: 'Adjustable bench',
  dumbbells: 'Dumbbells',
  kettlebells: 'Kettlebells',
  cable_station: 'Cable station',
  smith_machine: 'Smith machine',
  leg_press: 'Leg press',
  leg_extension: 'Leg extension',
  leg_curl: 'Leg curl',
  chest_press_machine: 'Chest press machine',
  pec_deck: 'Pec deck',
  lat_pulldown: 'Lat pulldown',
  seated_row: 'Seated row',
  shoulder_press_machine: 'Shoulder press machine',
  calf_raise_machine: 'Calf raise machine',
  hip_adductor_abductor: 'Inner and outer thigh machine',
  hyperextension_bench: 'Back extension bench',
  pull_up_bar: 'Pull up bar',
  dip_station: 'Dip station',
  resistance_bands: 'Resistance bands',
  ez_curl_bar: 'EZ curl bar',
  treadmill: 'Treadmill',
  bike: 'Bike',
  stair_climber: 'Stair climber',
  rower: 'Rower',
  jump_rope: 'Jump rope',
  elliptical: 'Elliptical',
  yoga_mat: 'Yoga mat',
};

/** The SPEC 13.7 glossary entry (ⓘ) for equipment a normal person might not know. */
export const EQUIPMENT_INFO: Partial<Record<EquipmentId, string>> = {
  barbell_rack: 'olympic-barbell',
  adjustable_bench: 'adjustable-bench',
  kettlebells: 'kettlebell',
  cable_station: 'cable-station',
  smith_machine: 'smith-machine',
  leg_press: 'leg-press',
  pec_deck: 'pec-deck',
  lat_pulldown: 'lat-pulldown',
  seated_row: 'seated-row',
  hyperextension_bench: 'hyperextension-bench',
  dip_station: 'dip-station',
  resistance_bands: 'resistance-band',
  ez_curl_bar: 'ez-curl-bar',
  chest_press_machine: 'weight-stack-machine',
  leg_extension: 'weight-stack-machine',
  leg_curl: 'weight-stack-machine',
  calf_raise_machine: 'weight-stack-machine',
  hip_adductor_abductor: 'weight-stack-machine',
  shoulder_press_machine: 'weight-stack-machine',
};
