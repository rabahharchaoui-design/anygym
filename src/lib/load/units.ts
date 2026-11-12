// Unit conversion between pounds and kilograms (SPEC 5.4). Exact definitions, never rounded here.
import type { Unit } from '../../db/types';

/** Exact international definition: 1 lb = 0.45359237 kg. */
export const KG_PER_LB = 0.45359237;

export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const kgToLb = (kg: number): number => kg / KG_PER_LB;

/** Value in `from` expressed in `to`. Not rounded; round with roundToLoadable or format helpers. */
export function convertForGym(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  return from === 'lb' ? lbToKg(value) : kgToLb(value);
}

/** The other weight unit. */
export const otherUnit = (unit: Unit): Unit => (unit === 'lb' ? 'kg' : 'lb');
