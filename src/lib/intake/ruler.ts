// The bodyweight ruler (PLAN 3.3): a horizontal strip scrubbed with the thumb, a tick every 0.5.
// Position ↔ value only; snapping and unit flips go through src/lib/load.ts.
import type { Unit } from '../../db/types';
import { BODYWEIGHT_STEP, convertBodyweight, roundToStep } from '../load';
import { BODYWEIGHT_RANGE } from './funnel';

/** Pixels between two ticks (0.5 apart). */
export const TICK_PX = 12;

/** Where the ruler starts before the user moves it (shown dim, never saved until moved). */
export const RULER_START: Record<Unit, number> = { kg: 70, lb: 155 };

/** A labelled tick every this much. */
export const LABEL_EVERY: Record<Unit, number> = { kg: 5, lb: 10 };

/** Clamped and snapped to a 0.5 tick inside the unit's range. */
export function snapBodyweight(value: number, unit: Unit): number {
  const r = BODYWEIGHT_RANGE[unit];
  return Math.min(r.max, Math.max(r.min, roundToStep(value, BODYWEIGHT_STEP)));
}

/** Scroll offset (px from the start of the ticks) for a value. */
export function offsetFor(value: number, unit: Unit): number {
  return ((snapBodyweight(value, unit) - BODYWEIGHT_RANGE[unit].min) / BODYWEIGHT_STEP) * TICK_PX;
}

/** The value under the needle at this scroll offset, snapped to the nearest tick. */
export function valueAt(offset: number, unit: Unit): number {
  const ticks = Math.round(offset / TICK_PX);
  return snapBodyweight(BODYWEIGHT_RANGE[unit].min + ticks * BODYWEIGHT_STEP, unit);
}

/** How many ticks the strip has (both ends included). */
export function tickCount(unit: Unit): number {
  const r = BODYWEIGHT_RANGE[unit];
  return Math.round((r.max - r.min) / BODYWEIGHT_STEP) + 1;
}

/** The labelled values, low to high. */
export function labels(unit: Unit): number[] {
  const r = BODYWEIGHT_RANGE[unit];
  const every = LABEL_EVERY[unit];
  const out: number[] = [];
  for (let v = Math.ceil(r.min / every) * every; v <= r.max; v += every) out.push(v);
  return out;
}

/** The unit toggle: the same weight in the other unit, on a tick, inside the range. */
export function flipBodyweight(value: number, from: Unit, to: Unit): number {
  return snapBodyweight(convertBodyweight(value, from, to), to);
}
