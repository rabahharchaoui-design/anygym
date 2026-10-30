// Geometry for the plate diagram (SPEC 5.3, 5.6, PLAN 2.0d "picture first"). Pure, no React and
// no weight math: it only turns the real dimensions from plates.ts into pixel rectangles.
//
// The scene: the bar at real proportions (shaft 1310 mm, sleeves 415 mm, collars, end caps) with
// plate DIAMETERS on the same scale and a stylized, consistent plate THICKNESS (thinner for 5 and
// under), every plate drawn, touching the next. The scene is laid out once at the "whole bar fits"
// scale; a camera zoom then frames the shaft and the loaded part of the sleeves: an empty bar fills
// the width, and every plate added zooms out a little, down to the whole bar (zoom 1). Plates are
// never grouped and there is no overflow box: when even the whole bar cannot hold the stylized
// stack, the plates get thinner (`thin`), all still drawn. Capacity is a separate rule (SPEC 5.3,
// fitsSleeve on real thicknesses); this file only decides how the plates are shown.
import type { BarId, Unit } from '../db/types';
import { PLATE_SPECS, barSpec, plateSpec, type BarSpec } from './plates';
import { plateColor, type PlateColor } from './plateColors';

/** Side margin of the drawing at zoom 1 (px), each side. */
export const PAD = 6;
/** Space above and below the biggest plate at its closest zoom (px). */
export const PAD_Y = 4;
/** Pixel width of the machine frame post a horn sticks out of. */
export const FRAME_WIDTH = 22;
/** Stylized thickness of a plate over 5 (lb or kg), in mm. */
export const BIG_MM = 72;
/** Stylized thickness of a plate of 5 and under, in mm. */
export const SMALL_MM = 32;
/** Plates of this weight and under are drawn thinner. */
export const SMALL_MAX = 5;
/** Bare sleeve the camera keeps in view past the outermost plate, in mm. */
export const REVEAL_MM = 110;
/** Smallest hit area of a sleeve (px), above the 44 pt minimum. */
export const MIN_HIT = 48;

export type Side = 'left' | 'right';

/** One drawn plate, in scene coordinates (zoom 1). */
export type PlateRect = {
  side: Side;
  /** 0 = innermost. */
  index: number;
  weight: number;
  color: PlateColor;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Rect = { x: number; y: number; width: number; height: number };

export type BarLayout = {
  width: number;
  height: number;
  /** Scene pixels per length unit (per inch for lb, per millimetre for kg) at zoom 1. */
  scale: number;
  /** Camera zoom about (cx, cy): 1 = the whole bar fits the width; more = closer. */
  zoom: number;
  cx: number;
  cy: number;
  bar: BarId;
  sleeves: Record<Side, Rect>;
  /** Inner collars: the raised flange where the shaft meets each sleeve. */
  shoulders: Record<Side, Rect>;
  /** End caps at the free ends of the sleeves. */
  caps: Record<Side, Rect>;
  shaft: Rect;
  /** Every plate, both sides, in scene coordinates. */
  plates: PlateRect[];
  /** Share of the stylized thickness drawn (1, or less at the floor when the stack is longer than the sleeve). */
  thin: number;
  /** Tap targets in screen coordinates (after the zoom): a whole side from the sleeve out, at least MIN_HIT wide. */
  hits: Partial<Record<Side, Rect>>;
  /** True when the zoom crops the bar ends (the sleeve runs on past the drawing's edge). */
  cropped: boolean;
  /** Sides that carry plates: both on a bar, only 'right' on a machine horn. */
  sides: Side[];
  /** Machine frame the horn sticks out of (horn only). */
  frame?: Rect;
};

export type LayoutInput = {
  unit: Unit;
  /** One side's plates in any order; drawn heaviest innermost. */
  perSide: readonly number[];
  /** Drawing width (px). */
  width: number;
  /** Which bar, for its real dimensions. Default Olympic. */
  bar?: BarId;
};

/** Millimetres in one length unit of the gym (mm for kg, in for lb). */
const perMm = (unit: Unit) => (unit === 'kg' ? 1 : 1 / 25.4);

/** The biggest plate of a unit (450 mm): the drawing always has room for it. */
function bigDiameter(unit: Unit): number {
  return Math.max(...PLATE_SPECS[unit].map((p) => p.diameter));
}

/** Drawn length of a bar in its length unit: the bar plus its two end caps. */
function drawnLength(spec: BarSpec): number {
  return spec.total + 2 * spec.capWidth;
}

/** Scene pixels per length unit: the whole bar fills the width with side margins (zoom 1). */
export function barScale(width: number, unit: Unit, bar: BarId = 'olympic'): number {
  return Math.max(0, (width - 2 * PAD) / drawnLength(barSpec(bar, unit)));
}

/** Stylized drawn thickness of one plate, in the unit's length unit. */
export function plateThickness(weight: number, unit: Unit): number {
  plateSpec(weight, unit); // never draw a size the app does not know
  return (weight <= SMALL_MAX ? SMALL_MM : BIG_MM) * perMm(unit);
}

/** Stylized length of one side's stack, in the unit's length unit. */
export function stackLength(perSide: readonly number[], unit: Unit): number {
  return perSide.reduce((n, w) => n + plateThickness(w, unit), 0);
}

/**
 * Camera zoom for a stylized stack `stack` long: the view reaches from the centre to the outermost
 * plate plus a little bare sleeve, never past the whole bar. Only ever shrinks as the stack grows.
 */
function zoomAt(stack: number, unit: Unit, bar: BarId): number {
  const spec = barSpec(bar, unit);
  const reach = spec.sleeve + spec.capWidth;
  const inner = spec.shaft / 2 + spec.collar;
  return (inner + reach) / (inner + Math.min(reach, stack + REVEAL_MM * perMm(unit)));
}

/** Camera zoom for one side's plates (1 = the whole bar). Monotonic: never grows as plates are added. */
export function zoomFor(perSide: readonly number[], unit: Unit, bar: BarId = 'olympic'): number {
  return zoomAt(stackLength(perSide, unit), unit, bar);
}

/** Share of the stylized thickness that fits the drawn sleeve (1 unless the stack is longer than the sleeve). */
export function thinFor(perSide: readonly number[], unit: Unit, bar: BarId = 'olympic'): number {
  const stack = stackLength(perSide, unit);
  const sleeve = barSpec(bar, unit).sleeve;
  return stack > sleeve ? sleeve / stack : 1;
}

/**
 * Height of the drawing for a width: the biggest plate at the closest zoom it is ever seen at (one
 * big plate per side), and a little air. The same for every load, so nothing shifts (SPEC 13.2).
 */
export function drawingHeight(width: number, unit: Unit): number {
  const z = zoomAt(BIG_MM * perMm(unit), unit, 'olympic');
  return PAD_Y + bigDiameter(unit) * barScale(width, unit) * z + PAD_Y;
}

/** Plates along +x from `start` on a sleeve (right side), heaviest innermost, touching. */
function stack(perSide: readonly number[], unit: Unit, scale: number, start: number, cy: number, thin: number): PlateRect[] {
  const sorted = [...perSide].sort((a, b) => b - a);
  let x = start;
  return sorted.map((weight, index) => {
    const width = plateThickness(weight, unit) * thin * scale;
    const height = plateSpec(weight, unit).diameter * scale;
    const p: PlateRect = { side: 'right', index, weight, color: plateColor(weight, unit), x, y: cy - height / 2, width, height };
    x += width;
    return p;
  });
}

/** Mirror a right side rectangle onto the left side of a drawing of width `width`. */
const mirrorX = (x: number, w: number, width: number) => width - x - w;

/** A scene x after the zoom about cx. */
const toScreen = (x: number, cx: number, zoom: number) => cx + (x - cx) * zoom;

/** The right side's tap target: from the sleeve to the drawing's edge, at least MIN_HIT wide. */
function rightHit(sleeveX: number, cx: number, zoom: number, width: number, height: number): Rect {
  const hi = width;
  const lo = Math.min(Math.max(0, toScreen(sleeveX, cx, zoom)), hi - MIN_HIT);
  return { x: lo, y: 0, width: hi - lo, height };
}

export function barLayout({ unit, perSide, width, bar = 'olympic' }: LayoutInput): BarLayout {
  const spec = barSpec(bar, unit);
  const scale = barScale(width, unit, bar);
  const height = drawingHeight(width, unit);
  const cy = height / 2;
  const cx = width / 2;
  const zoom = zoomFor(perSide, unit, bar);
  const thin = thinFor(perSide, unit, bar);

  const shaftW = spec.shaft * scale;
  const shaftH = spec.shaftDiameter * scale;
  const collarW = spec.collar * scale;
  const collarH = spec.collarDiameter * scale;
  const sleeveW = spec.sleeve * scale;
  const sleeveH = spec.sleeveDiameter * scale;
  const capW = spec.capWidth * scale;
  const capH = spec.capDiameter * scale;

  const shaft = { x: cx - shaftW / 2, y: cy - shaftH / 2, width: shaftW, height: shaftH };
  const collarR = { x: cx + shaftW / 2, y: cy - collarH / 2, width: collarW, height: collarH };
  const sleeveR = { x: collarR.x + collarW, y: cy - sleeveH / 2, width: sleeveW, height: sleeveH };
  const capR = { x: sleeveR.x + sleeveW, y: cy - capH / 2, width: capW, height: capH };
  const mirror = (r: Rect): Rect => ({ ...r, x: mirrorX(r.x, r.width, width) });

  const right = stack(perSide, unit, scale, sleeveR.x, cy, thin);
  const plates = right.flatMap((p) => [p, { ...p, side: 'left' as const, x: mirrorX(p.x, p.width, width) }]);
  const hitR = rightHit(sleeveR.x, cx, zoom, width, height);

  return {
    width,
    height,
    scale,
    zoom,
    cx,
    cy,
    bar,
    sleeves: { left: mirror(sleeveR), right: sleeveR },
    shoulders: { left: mirror(collarR), right: collarR },
    caps: { left: mirror(capR), right: capR },
    shaft,
    plates,
    thin,
    hits: { right: hitR, left: mirror(hitR) },
    cropped: zoom > 1 + 1e-9,
    sides: ['left', 'right'],
  };
}

/**
 * One plate loaded machine horn (SPEC 5.2), edge on: a frame post, a collar and the horn, in the
 * same picture style and at the same scale and zoom as the barbell on this width (one horn = one
 * Olympic sleeve; machines vary, it only needs to look right, the math does not depend on it).
 * Only the 'right' side exists.
 */
export function hornLayout({ unit, perSide, width }: LayoutInput): BarLayout {
  const spec = barSpec('olympic', unit);
  const scale = barScale(width, unit);
  const height = drawingHeight(width, unit);
  const cy = height / 2;
  const cx = width / 2;
  const zoom = zoomFor(perSide, unit);
  const thin = thinFor(perSide, unit);

  const collarW = spec.collar * scale;
  const sleeveW = spec.sleeve * scale;
  const capW = spec.capWidth * scale;
  const drawnW = FRAME_WIDTH + collarW + sleeveW + capW;
  const left = Math.max(PAD, (width - drawnW) / 2);
  const plateH = bigDiameter(unit) * scale;
  const frame = { x: left, y: cy - plateH / 2, width: FRAME_WIDTH, height: plateH };
  const collarH = spec.collarDiameter * scale;
  const sleeveH = spec.sleeveDiameter * scale;
  const shoulder = { x: left + FRAME_WIDTH, y: cy - collarH / 2, width: collarW, height: collarH };
  const sleeve = { x: shoulder.x + collarW, y: cy - sleeveH / 2, width: sleeveW, height: sleeveH };
  const capH = spec.capDiameter * scale;
  const cap = { x: sleeve.x + sleeveW, y: cy - capH / 2, width: capW, height: capH };
  const none = { x: left, y: cy, width: 0, height: 0 };

  return {
    width,
    height,
    scale,
    zoom,
    cx,
    cy,
    bar: 'olympic',
    sleeves: { left: none, right: sleeve },
    shoulders: { left: none, right: shoulder },
    caps: { left: none, right: cap },
    shaft: none,
    plates: stack(perSide, unit, scale, sleeve.x, cy, thin),
    thin,
    hits: { right: rightHit(sleeve.x, cx, zoom, width, height) },
    cropped: false,
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
