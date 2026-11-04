// Routines by place (PLAN 3.1): which curated plans can be done where. Pure: no JSON, no React.
//
// A plan's places come from its exercises' equipment needs, never from a hand picked list:
//   1. an exercise mapped exact or variant to the catalog (SPEC 4.3) needs the catalog's equipment;
//   2. otherwise its load type names the implement when it is certain (barbell, dumbbells, a
//      plate loaded or weight stack machine);
//   3. anything else (a hold, a stretch, reps with "your bodyweight", a single held weight, an
//      unknown load, a finisher) is "unknown": it fits only a place that has everything.
// A place fits a plan when it has every need of every exercise in it, and, for the places named
// after one kind of gear, the plan really uses that gear. A tile is only shown with a plan behind it.

import type { ExerciseLoadType } from './loadTypeRule';
import type { MatchKind } from './catalog';

export type Need = 'barbell' | 'dumbbell' | 'kettlebell' | 'machine' | 'cable' | 'bands' | 'bodyweight' | 'cardio' | 'unknown';

export type PlaceId = 'home' | 'travel' | 'dumbbells' | 'bands' | 'full' | 'bodyweight' | 'cardio';

export type Place = {
  id: PlaceId;
  label: string;
  /** What the place has (SPEC 3 presets); 'all' = everything on, so it also covers unknown needs. */
  has: readonly Need[] | 'all';
  /** Named after one kind of gear: a plan shows here only when it uses it. */
  uses?: Need;
};

/** In tile order (G's inspiration list). */
export const PLACES: readonly Place[] = [
  // SPEC 3 Home: dumbbells, bands and a pull up bar are what a home has at most.
  { id: 'home', label: 'At home', has: ['dumbbell', 'bands', 'bodyweight'] },
  // SPEC 3 Hotel gym: dumbbells, a bench, one cable station, a treadmill and a bike.
  { id: 'travel', label: 'Travel or hotel gym', has: ['dumbbell', 'cable', 'cardio', 'bodyweight'] },
  { id: 'dumbbells', label: 'Dumbbells only', has: ['dumbbell', 'bodyweight'], uses: 'dumbbell' },
  { id: 'bands', label: 'Bands', has: ['bands', 'bodyweight'], uses: 'bands' },
  // SPEC 3 Full gym: everything on.
  { id: 'full', label: 'Full gym', has: 'all' },
  { id: 'bodyweight', label: 'Bodyweight', has: ['bodyweight'], uses: 'bodyweight' },
  { id: 'cardio', label: 'Cardio', has: ['cardio'], uses: 'cardio' },
];

const BY_ID = new Map(PLACES.map((p) => [p.id, p]));
export const placeById = (id: string | undefined): Place | undefined => (id ? BY_ID.get(id as PlaceId) : undefined);

/** free-exercise-db equipment words → a need. "other" and missing say nothing sure. */
const CATALOG_NEED: Record<string, Need> = {
  barbell: 'barbell',
  'e-z curl bar': 'barbell',
  dumbbell: 'dumbbell',
  kettlebells: 'kettlebell',
  machine: 'machine',
  cable: 'cable',
  bands: 'bands',
  'body only': 'bodyweight',
};

/**
 * Load types that name the implement for sure. A weight stack can be a machine or a cable
 * station, so it counts as a machine: the narrower claim (it never puts a plan in a place that
 * might lack it). "single" (a dumbbell, kettlebell or plate), "bodyweight" (band work, pull ups and
 * dips are logged that way too), "timed" and "unknown" say nothing about the gear.
 */
const LOAD_NEED: Partial<Record<ExerciseLoadType, Need>> = {
  barbell: 'barbell',
  dumbbell_each: 'dumbbell',
  plate_machine: 'machine',
  stack: 'machine',
};

export type NeedInput = {
  /** The map entry's match for this exercise; undefined when it has none. */
  match?: MatchKind;
  /** The catalog exercise's equipment word, when mapped. */
  catalogEquipment?: string | null;
  loadType?: ExerciseLoadType;
};

/** What one exercise needs, from the data only. */
export function exerciseNeed({ match, catalogEquipment, loadType }: NeedInput): Need {
  if ((match === 'exact' || match === 'variant') && catalogEquipment) {
    const n = CATALOG_NEED[catalogEquipment];
    if (n) return n;
  }
  return (loadType && LOAD_NEED[loadType]) || 'unknown';
}

/** Whether a place fits a plan with these needs (one per exercise, finishers included). */
export function placeFits(place: Place, needs: readonly Need[]): boolean {
  if (needs.length === 0) return false;
  if (place.uses && !needs.includes(place.uses)) return false;
  if (place.has === 'all') return true;
  const has = place.has;
  return needs.every((n) => has.includes(n));
}

/** The places a plan fits, in tile order. */
export function placesFor(needs: readonly Need[]): PlaceId[] {
  return PLACES.filter((p) => placeFits(p, needs)).map((p) => p.id);
}

export type PlaceTile<T> = { place: Place; plans: T[] };

/** Only the tiles with at least one plan behind them, in tile order; plans keep their order. */
export function placeTiles<T>(plans: readonly T[], placesOf: (plan: T) => readonly PlaceId[]): PlaceTile<T>[] {
  return PLACES.map((place) => ({ place, plans: plans.filter((p) => placesOf(p).includes(place.id)) })).filter((t) => t.plans.length > 0);
}
