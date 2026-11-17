// Run setup for the start screen (SPEC 12.1, 12.7): the run type, its goal and the picker values.
// Pure: no screen, no database. A goal is kept exactly as it was picked (5 km stays 5 km, 3 mi
// stays 3 mi); meters are worked out only when asked, through lib/gps unitMeters.
import type { DistanceUnit } from '../intake/answers';
import { unitMeters } from '../gps';

export type RunType = 'free' | 'distance' | 'time' | 'intervals';
export type DistanceGoal = { value: number; unit: DistanceUnit };
export type IntervalPresetId = 'beginner' | 'builder' | 'speed';

/** What the start screen remembers between visits. Every part always has a value, so Start works with no setup. */
/** `autoPause` is the run setting of SPEC 12.3 (on by default): standing still pauses the clock. */
export type RunSetup = { type: RunType; distance: DistanceGoal; timeMin: number; interval: IntervalPresetId; autoPause: boolean };

export const RUN_TYPES: ReadonlyArray<{ value: RunType; label: string }> = [
  { value: 'free', label: 'Free run' },
  { value: 'distance', label: 'Distance' },
  { value: 'time', label: 'Time' },
  { value: 'intervals', label: 'Intervals' },
];

/** SPEC 12.1: 3 mi, 5 km, 10 km, then custom. */
export const DISTANCE_PRESETS: readonly DistanceGoal[] = [
  { value: 3, unit: 'mi' },
  { value: 5, unit: 'km' },
  { value: 10, unit: 'km' },
];

/** SPEC 12.1: 20 / 30 / 45 min, then custom. */
export const TIME_PRESETS_MIN: readonly number[] = [20, 30, 45];

/** Custom distance: half steps from 0.5 to 50 in the chosen unit (past a marathon in miles). */
export const CUSTOM_DISTANCE = { min: 0.5, max: 50, step: 0.5 } as const;
/** Custom time: 5 minute steps from 5 minutes to 3 hours. */
export const CUSTOM_TIME_MIN = { min: 5, max: 180, step: 5 } as const;

/** SPEC 12.7 presets, as words only: 4.4 builds the interval run itself. */
export const INTERVAL_PRESETS: ReadonlyArray<{ id: IntervalPresetId; label: string; detail: string }> = [
  { id: 'beginner', label: 'Beginner', detail: 'Run 1 min, walk 2 min, 8 times' },
  { id: 'builder', label: 'Builder', detail: 'Run 3 min, walk 1 min, 6 times' },
  { id: 'speed', label: 'Speed', detail: '1 min hard, 1 min easy, 10 times' },
];

export const DEFAULT_RUN_SETUP: RunSetup = { type: 'free', distance: { value: 5, unit: 'km' }, timeMin: 30, interval: 'beginner', autoPause: true };

const steps = (range: { min: number; max: number; step: number }): number[] => {
  const out: number[] = [];
  const n = Math.round((range.max - range.min) / range.step);
  for (let i = 0; i <= n; i++) out.push(Math.round((range.min + i * range.step) * 100) / 100);
  return out;
};

/** Every value of the custom distance wheel. */
export const customDistanceValues = (): number[] => steps(CUSTOM_DISTANCE);
/** Every value of the custom time wheel, in minutes. */
export const customTimeValues = (): number[] => steps(CUSTOM_TIME_MIN);

const onStep = (v: unknown, range: { min: number; max: number; step: number }): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= range.min && v <= range.max && Math.abs(v / range.step - Math.round(v / range.step)) < 1e-9;

export const isDistanceGoal = (g: unknown): g is DistanceGoal => {
  const d = g as Partial<DistanceGoal> | null;
  return !!d && typeof d === 'object' && (d.unit === 'km' || d.unit === 'mi') && onStep(d.value, CUSTOM_DISTANCE);
};
export const isTimeGoal = (m: unknown): m is number => onStep(m, CUSTOM_TIME_MIN);

/** A saved setup read back: anything missing or not understood falls back to the default for that part alone. */
export function sanitizeRunSetup(raw: unknown): RunSetup {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof RunSetup, unknown>>;
  return {
    type: RUN_TYPES.some((t) => t.value === r.type) ? (r.type as RunType) : DEFAULT_RUN_SETUP.type,
    distance: isDistanceGoal(r.distance) ? { value: r.distance.value, unit: r.distance.unit } : DEFAULT_RUN_SETUP.distance,
    timeMin: isTimeGoal(r.timeMin) ? r.timeMin : DEFAULT_RUN_SETUP.timeMin,
    interval: INTERVAL_PRESETS.some((p) => p.id === r.interval) ? (r.interval as IntervalPresetId) : DEFAULT_RUN_SETUP.interval,
    autoPause: typeof r.autoPause === 'boolean' ? r.autoPause : DEFAULT_RUN_SETUP.autoPause,
  };
}

/** Reads the stored text (JSON); bad text gives the default setup. */
export function parseRunSetup(text: string | null | undefined): RunSetup {
  if (!text) return DEFAULT_RUN_SETUP;
  try {
    return sanitizeRunSetup(JSON.parse(text));
  } catch {
    return DEFAULT_RUN_SETUP;
  }
}

export const sameDistance = (a: DistanceGoal, b: DistanceGoal): boolean => a.unit === b.unit && a.value === b.value;
export const isDistancePreset = (g: DistanceGoal): boolean => DISTANCE_PRESETS.some((p) => sameDistance(p, g));
export const isTimePreset = (min: number): boolean => TIME_PRESETS_MIN.includes(min);

/** "5 km", "3 mi", "2.5 mi". */
export const distanceLabel = (g: DistanceGoal): string => `${g.value} ${g.unit}`;

/** "45 min", "1 h", "1 h 30 min". */
export function timeLabel(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** The goal in meters, for the run itself (4.3). */
export const goalMeters = (g: DistanceGoal): number => g.value * unitMeters(g.unit);
/** The goal in seconds, for the run itself (4.3). */
export const goalSeconds = (min: number): number => min * 60;

/**
 * A custom distance carried to the other unit: the same number on the wheel (5 km becomes 5 mi),
 * because the wheel shows numbers, not a converted length nobody picked.
 */
export const withUnit = (g: DistanceGoal, unit: DistanceUnit): DistanceGoal => ({ value: g.value, unit });

/** The one line under the run types: what this run is, and a quiet second line when there is one. */
export function goalLine(setup: RunSetup): { label: string; detail: string | null } {
  switch (setup.type) {
    case 'free':
      return { label: 'No goal', detail: 'Run as far as you like' };
    case 'distance':
      return { label: distanceLabel(setup.distance), detail: null };
    case 'time':
      return { label: timeLabel(setup.timeMin), detail: null };
    case 'intervals': {
      const p = INTERVAL_PRESETS.find((i) => i.id === setup.interval) ?? INTERVAL_PRESETS[0]!;
      return { label: p.label, detail: p.detail };
    }
  }
}
