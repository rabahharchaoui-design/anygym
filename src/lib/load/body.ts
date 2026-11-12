// Body measurements: bodyweight and height conversions (PLAN 3.3).
import type { Unit } from '../../db/types';
import { convertForGym } from './units';

// ---------------------------------------------------------------- body measurements (PLAN 3.3)
// The intake's bodyweight ruler and height wheels convert only through these.

/** Snaps to the nearest multiple of `step` (ties go up), exact at 1e-9 resolution. */
export function roundToStep(value: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(value)) throw new Error('Invalid step');
  const n = Math.floor(value / step + 0.5 + 1e-9);
  return Math.round(n * step * 1e6) / 1e6;
}

/** The bodyweight ruler's tick: every 0.5 in either unit. */
export const BODYWEIGHT_STEP = 0.5;

/** A bodyweight in another unit, snapped to the ruler's 0.5 ticks (70 kg → 154.5 lb). */
export function convertBodyweight(value: number, from: Unit, to: Unit): number {
  return roundToStep(convertForGym(value, from, to), BODYWEIGHT_STEP);
}

/** "72.5", "70.0": a bodyweight always shows its one decimal (the ruler's 0.5 ticks). */
export function formatBodyweight(value: number): string {
  return value.toFixed(1);
}

/** Exact definition: 1 in = 2.54 cm. */
export const CM_PER_IN = 2.54;

/** Feet and inches → whole centimeters (5 ft 10 in → 178 cm). */
export function ftInToCm(ft: number, inches: number): number {
  return Math.round((ft * 12 + inches) * CM_PER_IN);
}

/** Centimeters → the nearest whole inch as feet and inches (178 cm → 5 ft 10 in). */
export function cmToFtIn(cm: number): { ft: number; in: number } {
  const total = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(total / 12), in: total % 12 };
}
