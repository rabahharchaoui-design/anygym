// The base weight model: total = base + 2 × sum(perSide) + collars.
import type { Collars, PlateToggle, Unit } from '../../db/types';
import { add, times } from './exact';
import { kgToLb } from './units';

/** Competition collars are 2.5 kg each (SPEC 5.3); spring clips count as 0. In a lb gym the 5 kg is converted, not rounded. */
export function collarsWeight(collars: Collars, unit: Unit): number {
  if (collars === 'none') return 0;
  return unit === 'kg' ? 5 : kgToLb(5);
}

export type SumInput = {
  /** Base weight (see top of file). null = not known yet. */
  bar: number | null;
  perSide: readonly number[];
  collars?: Collars;
  unit: Unit;
  /** Edit set, older records only: weight the stored total holds beyond bar, plates and collars (otherOf). */
  other?: number;
};

export type SumResult = {
  /** null when the base weight is unknown. Never a guess. */
  total: number | null;
  /** 2 × sum(perSide). */
  platesTotal: number;
  collarsTotal: number;
};

/** total = bar + 2 × sum(perSide) + collars (+ other, see otherOf). */
export function sumLoad({ bar, perSide, collars = 'none', unit, other = 0 }: SumInput): SumResult {
  const platesTotal = times(add(...perSide), 2);
  const collarsTotal = collarsWeight(collars, unit);
  return {
    total: bar === null ? null : add(bar, platesTotal, collarsTotal, other),
    platesTotal,
    collarsTotal,
  };
}

/** Enabled plate sizes, heaviest first. */
export function enabledPlates(inventory: readonly PlateToggle[]): number[] {
  return inventory.filter((p) => p.enabled).map((p) => p.weight).sort((a, b) => b - a);
}

// ---------------------------------------------------------------- Smith and plate loaded machines

/** Smith machine base: "Count plates only" = 0, else the bar weight from the frame sticker (null until answered). */
export function smithBase(mode: 'plates_only' | 'bar', barWeight: number | null = null): number | null {
  return mode === 'plates_only' ? 0 : barWeight;
}

/** Plate loaded machine base: the listed starting resistance, 0 for "plates only", null until answered. */
export function machineBase(startingResistance: number | null): number | null {
  return startingResistance;
}
