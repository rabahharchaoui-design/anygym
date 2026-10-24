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
export const BAR_PARTS: Record<
  Unit,
  { sleeveDiameter: number; shaftDiameter: number; shoulderDiameter: number; shoulderWidth: number; capWidth: number; capDiameter: number }
> = {
  lb: { sleeveDiameter: 1.97, shaftDiameter: 1.1, shoulderDiameter: 2.9, shoulderWidth: 1, capWidth: 0.45, capDiameter: 2.15 },
  kg: { sleeveDiameter: 50, shaftDiameter: 28, shoulderDiameter: 74, shoulderWidth: 25, capWidth: 11, capDiameter: 55 },
};

/** Pixel gap that stands in for the shaft between the two shoulders (room for both grip knurls and the centre knurl). */
export const SHAFT_GAP = 48;
/** Pixel padding around the drawing. */
export const PAD = 4;
/** Smallest readable label (px). Plates too thin for an upright label get it under the plate instead. */
export const MIN_LABEL = 11;
const MAX_LABEL = 13;
/** Rough width of one digit or point as a share of the font size (Space Grotesk, tabular). */
const CHAR_EM = 0.62;
/** Font size of the labels in the band under the plates. */
export const UNDER_LABEL = 11;
/** Height of the label band a caller should reserve for UNDER_LABEL text. */
export const LABEL_BAND = 16;

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
  /** Font size for an upright label on the plate edge, or null when it goes under the plate. */
  label: number | null;
};

/** An upright weight label under a run of identical plates, nudged outward so labels never overlap. */
export type UnderLabel = {
  side: Side;
  weight: number;
  text: string;
  /** Centre x of the text. */
  x: number;
  /** Centre x of the plates it names (differs from x when nudged). */
  anchor: number;
  /** Centre y of the text. */
  y: number;
  size: number;
};

export type Rect = { x: number; y: number; width: number; height: number };

export type BarLayout = {
  width: number;
  height: number;
  /** Pixels per length unit. */
  scale: number;
  sleeves: Record<Side, Rect>;
  shoulders: Record<Side, Rect>;
  /** End caps at the free ends of the sleeves. */
  caps: Record<Side, Rect>;
  shaft: Rect;
  plates: PlateRect[];
  /** Labels in the band under the plates, for plates too thin for an upright label. */
  labels: UnderLabel[];
  /** Sides that carry plates: both on a bar, only 'right' on a machine horn. */
  sides: Side[];
  /** Machine frame the horn sticks out of (horn only). */
  frame?: Rect;
};

/** Pixel width of a label at a font size. */
export function textWidth(text: string, size: number): number {
  return text.length * size * CHAR_EM;
}

/**
 * Font size for an upright (horizontal) label across the plate edge, or null when the text is
 * wider than the plate. Never rotated: SPEC 5.6 wants labels readable without tilting your head.
 */
export function labelSize(plateWidth: number, plateHeight: number, text: string): number | null {
  for (let size = MAX_LABEL; size >= MIN_LABEL; size--) {
    if (textWidth(text, size) + 3 <= plateWidth && size + 6 <= plateHeight) return size;
  }
  return null;
}

/**
 * Labels for runs of unlabelled plates, placed in the band under the plates. Each run of the same
 * weight gets one label centred under it; a label that would touch the previous one slides
 * outward along the sleeve. Labels that would leave the drawing are dropped (the math line and
 * the tray still name every plate).
 */
export function underLabels(plates: readonly PlateRect[], width: number, bandTop: number, labelOf: (w: number) => string): UnderLabel[] {
  const out: UnderLabel[] = [];
  const size = UNDER_LABEL;
  const y = bandTop + LABEL_BAND / 2;
  for (const side of ['right', 'left'] as const) {
    const own = plates.filter((p) => p.side === side).sort((a, b) => a.index - b.index);
    // Runs of the same weight, innermost first.
    const runs: PlateRect[][] = [];
    for (const p of own) {
      const last = runs[runs.length - 1];
      if (last && last[0]!.weight === p.weight) last.push(p);
      else runs.push([p]);
    }
    let edge = side === 'right' ? -Infinity : Infinity; // outer edge of the previous label
    for (const run of runs) {
      if (run[0]!.label !== null) {
        // Upright on the plate: later labels only need to clear these plates.
        const lastP = run[run.length - 1]!;
        edge = side === 'right' ? Math.max(edge, lastP.x + lastP.width) : Math.min(edge, lastP.x);
        continue;
      }
      const text = labelOf(run[0]!.weight);
      const half = textWidth(text, size) / 2;
      const lo = Math.min(...run.map((p) => p.x));
      const hi = Math.max(...run.map((p) => p.x + p.width));
      const anchor = (lo + hi) / 2;
      const x = side === 'right' ? Math.max(anchor, edge + 3 + half) : Math.min(anchor, edge - 3 - half);
      if (x - half < PAD || x + half > width - PAD) break;
      out.push({ side, weight: run[0]!.weight, text, x, anchor, y, size });
      edge = side === 'right' ? x + half : x - half;
    }
  }
  return out;
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
  /** Pixels reserved at the bottom for labels under thin plates (LABEL_BAND). Default 0 = none. */
  labelBand?: number;
};

export function barLayout({ unit, perSide, inventory, width, height, labelOf, labelBand = 0 }: LayoutInput): BarLayout {
  const parts = BAR_PARTS[unit];
  const sleeveLength = SLEEVE_LENGTH[unit];
  const sizes = inventory.length ? inventory : PLATE_SPECS[unit].map((p) => p.weight);
  const biggest = Math.max(...sizes.map((w) => plateSpec(w, unit).diameter));
  const plateArea = height - labelBand;

  // Room for one sleeve, its shoulder and its end cap on each side of the shaft gap.
  const sleevePx = (width - SHAFT_GAP - 2 * PAD) / 2;
  const scale = Math.max(
    0,
    Math.min(sleevePx / (sleeveLength + parts.shoulderWidth + parts.capWidth), (plateArea - 2 * PAD) / biggest),
  );
  const cy = plateArea / 2;
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
  const capW = parts.capWidth * scale;
  const capH = parts.capDiameter * scale;
  const caps = {
    left: { x: sleeves.left.x - capW, y: cy - capH / 2, width: capW, height: capH },
    right: { x: sleeves.right.x + sleeveW, y: cy - capH / 2, width: capW, height: capH },
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

  const labels = labelBand > 0 ? underLabels(plates, width, plateArea, labelOf) : [];
  return { width, height, scale, sleeves, shoulders, caps, shaft, plates, labels, sides: ['left', 'right'] };
}

/** Pixel width of the machine frame post a horn sticks out of. */
export const FRAME_WIDTH = 22;

/**
 * One plate loaded machine horn (SPEC 5.2), edge on: a frame post on the left, a collar, and the
 * horn to the right, drawn to the same scale as the plates. Horn length uses the Olympic sleeve
 * length (machines vary; it only needs to look right, the math does not depend on it).
 * Plates sit heaviest innermost against the collar. Only the 'right' side exists.
 */
export function hornLayout({ unit, perSide, inventory, width, height, labelOf, labelBand = 0 }: LayoutInput): BarLayout {
  const parts = BAR_PARTS[unit];
  const sleeveLength = SLEEVE_LENGTH[unit];
  const sizes = inventory.length ? inventory : PLATE_SPECS[unit].map((p) => p.weight);
  const biggest = Math.max(...sizes.map((w) => plateSpec(w, unit).diameter));
  const plateArea = height - labelBand;
  const room = width - FRAME_WIDTH - 2 * PAD;
  const scale = Math.max(
    0,
    Math.min(room / (sleeveLength + parts.shoulderWidth + parts.capWidth), (plateArea - 2 * PAD) / biggest),
  );
  const cy = plateArea / 2;

  const sleeveW = sleeveLength * scale;
  const shoulderW = parts.shoulderWidth * scale;
  const capW = parts.capWidth * scale;
  const drawn = FRAME_WIDTH + shoulderW + sleeveW + capW;
  const left = Math.max(PAD, (width - drawn) / 2);
  const frame = { x: left, y: PAD, width: FRAME_WIDTH, height: plateArea - 2 * PAD };
  const shoulderH = parts.shoulderDiameter * scale;
  const sleeveH = parts.sleeveDiameter * scale;
  const shoulder = { x: left + FRAME_WIDTH, y: cy - shoulderH / 2, width: shoulderW, height: shoulderH };
  const sleeve = { x: shoulder.x + shoulderW, y: cy - sleeveH / 2, width: sleeveW, height: sleeveH };
  const capH = parts.capDiameter * scale;
  const cap = { x: sleeve.x + sleeveW, y: cy - capH / 2, width: capW, height: capH };
  const none = { x: left, y: cy, width: 0, height: 0 };

  const plates: PlateRect[] = [];
  let offset = 0;
  [...perSide]
    .sort((a, b) => b - a)
    .forEach((weight, index) => {
      const spec = plateSpec(weight, unit);
      const w = spec.thickness * scale;
      const h = spec.diameter * scale;
      plates.push({ side: 'right', index, weight, x: sleeve.x + offset, y: cy - h / 2, width: w, height: h, label: labelSize(w, h, labelOf(weight)) });
      offset += w;
    });

  return {
    width,
    height,
    scale,
    sleeves: { left: none, right: sleeve },
    shoulders: { left: none, right: shoulder },
    caps: { left: none, right: cap },
    shaft: none,
    plates,
    labels: labelBand > 0 ? underLabels(plates, width, plateArea, labelOf) : [],
    sides: ['right'],
    frame,
  };
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
