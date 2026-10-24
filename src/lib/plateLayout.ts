// Geometry for the plate diagram (SPEC 5.3). Pure, no React and no weight math:
// it only turns plate dimensions from plates.ts into pixel rectangles.
//
// The bar is drawn edge on and horizontal. Both loadable sleeves are drawn to scale; the
// long shaft between them is shortened to a fixed gap (it carries no plates, and drawing
// 1.3 m of bare steel would shrink the plates to slivers). Plates sit heaviest innermost,
// against the sleeve shoulder, and descend outward, identical on both sides.
import type { Unit } from '../db/types';
import { PLATE_SPECS, SLEEVE_LENGTH, plateSpec } from './plates';

/** Olympic bar parts in the unit's length unit (in for lb, mm for kg). Drawing only, approximate. */
export const BAR_PARTS: Record<Unit, { sleeveDiameter: number; shaftDiameter: number; shoulderDiameter: number; shoulderWidth: number }> = {
  lb: { sleeveDiameter: 1.97, shaftDiameter: 1.1, shoulderDiameter: 2.9, shoulderWidth: 1 },
  kg: { sleeveDiameter: 50, shaftDiameter: 28, shoulderDiameter: 74, shoulderWidth: 25 },
};

/** Pixel gap that stands in for the shaft between the two shoulders. */
export const SHAFT_GAP = 36;
/** Pixel padding around the drawing. */
export const PAD = 4;
/** Smallest readable label (px). Thinner plates get no label; the tray names them. */
export const MIN_LABEL = 11;
const MAX_LABEL = 13;

export type Side = 'left' | 'right';

export type PlateRect = {
  side: Side;
  /** 0 = innermost. */
  index: number;
  weight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Font size for the weight label, or null when the plate is too thin to label. */
  label: number | null;
};

export type Rect = { x: number; y: number; width: number; height: number };

export type BarLayout = {
  width: number;
  height: number;
  /** Pixels per length unit. */
  scale: number;
  sleeves: Record<Side, Rect>;
  shoulders: Record<Side, Rect>;
  shaft: Rect;
  plates: PlateRect[];
};

/** Label font size that fits a plate of this pixel width, or null when none does. */
export function labelSize(plateWidth: number, plateHeight: number, text: string): number | null {
  const size = Math.min(MAX_LABEL, plateWidth - 2);
  if (size < MIN_LABEL) return null;
  // Rotated label runs along the plate height; digits are about 0.62em wide.
  if (text.length * size * 0.62 + 6 > plateHeight) return null;
  return size;
}

export type LayoutInput = {
  unit: Unit;
  /** One side's plates in any order; drawn heaviest innermost. */
  perSide: readonly number[];
  /** Plate sizes the drawing must fit (the gym's enabled plates). Empty = every known size. */
  inventory: readonly number[];
  width: number;
  height: number;
  /** Label text per weight, e.g. "2.5". */
  labelOf: (weight: number) => string;
};

export function barLayout({ unit, perSide, inventory, width, height, labelOf }: LayoutInput): BarLayout {
  const parts = BAR_PARTS[unit];
  const sleeveLength = SLEEVE_LENGTH[unit];
  const sizes = inventory.length ? inventory : PLATE_SPECS[unit].map((p) => p.weight);
  const biggest = Math.max(...sizes.map((w) => plateSpec(w, unit).diameter));

  // Room for one sleeve and its shoulder on each side of the shaft gap.
  const sleevePx = (width - SHAFT_GAP - 2 * PAD) / 2;
  const scale = Math.max(0, Math.min(sleevePx / (sleeveLength + parts.shoulderWidth), (height - 2 * PAD) / biggest));
  const cy = height / 2;
  const cx = width / 2;

  const sleeveH = parts.sleeveDiameter * scale;
  const shoulderW = parts.shoulderWidth * scale;
  const shoulderH = parts.shoulderDiameter * scale;
  const sleeveW = sleeveLength * scale;
  const innerRight = cx + SHAFT_GAP / 2 + shoulderW;
  const innerLeft = cx - SHAFT_GAP / 2 - shoulderW;

  const shaftH = parts.shaftDiameter * scale;
  const shaft = { x: cx - SHAFT_GAP / 2, y: cy - shaftH / 2, width: SHAFT_GAP, height: shaftH };
  const shoulders = {
    left: { x: innerLeft, y: cy - shoulderH / 2, width: shoulderW, height: shoulderH },
    right: { x: cx + SHAFT_GAP / 2, y: cy - shoulderH / 2, width: shoulderW, height: shoulderH },
  };
  const sleeves = {
    left: { x: innerLeft - sleeveW, y: cy - sleeveH / 2, width: sleeveW, height: sleeveH },
    right: { x: innerRight, y: cy - sleeveH / 2, width: sleeveW, height: sleeveH },
  };

  const sorted = [...perSide].sort((a, b) => b - a);
  const plates: PlateRect[] = [];
  let offset = 0;
  sorted.forEach((weight, index) => {
    const spec = plateSpec(weight, unit);
    const w = spec.thickness * scale;
    const h = spec.diameter * scale;
    const y = cy - h / 2;
    const label = labelSize(w, h, labelOf(weight));
    plates.push({ side: 'right', index, weight, x: innerRight + offset, y, width: w, height: h, label });
    plates.push({ side: 'left', index, weight, x: innerLeft - offset - w, y, width: w, height: h, label });
    offset += w;
  });

  return { width, height, scale, sleeves, shoulders, shaft, plates };
}

// ---------------------------------------------------------------- list edits (no arithmetic)

/** One side's plates with `count` more of `weight`, kept heaviest first. */
export function withPlates(perSide: readonly number[], weight: number, count: number): number[] {
  return [...perSide, ...Array<number>(count).fill(weight)].sort((a, b) => b - a);
}

/** One side's plates without the outermost (lightest) plate. */
export function withoutOutermost(perSide: readonly number[]): number[] {
  return [...perSide].sort((a, b) => b - a).slice(0, -1);
}

/** The outermost plate on a side, or null for an empty sleeve. */
export function outermost(perSide: readonly number[]): number | null {
  return perSide.length ? Math.min(...perSide) : null;
}
