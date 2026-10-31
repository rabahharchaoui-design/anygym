// Geometry for the plate diagram (SPEC 5.3, 5.6, PLAN 2.0d "picture first"). Pure, no React and
// no weight math: it only turns the real dimensions from plates.ts into pixel rectangles.
//
// The scene: the bar at real proportions (shaft 1310 mm, sleeves 415 mm, collars, end caps) with
// plate DIAMETERS on the same scale and a stylized, consistent plate THICKNESS (thinner for 5 and
// under), every plate drawn, touching the next. The scene is laid out once at the "whole bar fits"
// scale (zoom 1); a camera then frames it. An empty bar is a close up (2.2×, anchored on the right
// end: the sleeve big, the shaft running off to the left). From the first plate on, the camera is
// centred on the bar's middle and symmetric: the zoom is the closest one at which BOTH outermost
// plates (and a little bare sleeve) fit with a margin, about 1.3× for one plate per side, easing to
// 1× at a full sleeve, never past the drawing's height. A horn (plate loaded machine) has its own
// camera: a close up when empty, then from the first plate (about 1.25×) easing to 1× at a full
// horn. Taking a plate off never zooms in (`hold`). Plates are never grouped and there is no
// overflow box: when the stylized stack is longer than the sleeve the plates get thinner (`thin`),
// all still drawn. Capacity is a separate rule (SPEC 5.3, fitsSleeve on real thicknesses).
import type { BarId, Unit } from '../db/types';
import { PLATE_SPECS, barSpec, plateSpec, type BarSpec } from './plates';
import { plateColor, type PlateColor } from './plateColors';

/** Side margin of the drawing at zoom 1 (px), each side. */
export const PAD = 6;
/** Space above and below the biggest plate at its closest zoom (px). */
export const PAD_Y = 4;
/** Width of the machine post a horn sticks out of, in mm. */
export const FRAME_MM = 90;
/** Stylized thickness of a plate over 5 (lb or kg), in mm. */
export const BIG_MM = 72;
/** Stylized thickness of a plate of 5 and under, in mm. */
export const SMALL_MM = 32;
/** Plates of this weight and under are drawn thinner. */
export const SMALL_MAX = 5;
/** Smallest hit area of a sleeve (px), above the 44 pt minimum. */
export const MIN_HIT = 48;
/** The empty bar's camera zoom: close, the right sleeve big (2.0d critic). */
export const ZOOM_CLOSE = 2.2;
/** Bare sleeve kept in view past the outermost plate on a light bar, in mm (shrinks to 0 at a full sleeve). */
export const REVEAL_MM = 100;
/** Space between the outermost plate (with its bare sleeve) and the drawing's edge (px). */
export const EDGE_PX = 8;
/** Share of the width a full horn may fill at zoom 1. */
export const HORN_FULL = 0.6;
/** The horn's zoom with its first plate; it eases to 1 at a full horn. */
export const HORN_FIRST = 1.25;
/** The empty horn's close up, at most. */
export const HORN_CLOSE = 2.4;
/** The shortest a horn drawing gets (px), in the tightest sheets. */
export const HORN_MIN_H = 48;
/** Share of the width the empty horn may fill. */
export const HORN_EMPTY_MAX = 0.9;

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
  /** Camera zoom about (cx, cy): 1 = the whole bar (or horn) in view; more = closer. */
  zoom: number;
  /** The camera's anchor: the bar's right end, or the horn's middle. */
  cx: number;
  cy: number;
  /** The middle of the drawing (the floor shadow). */
  mid: number;
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
  /** True when the zoom crops the bar (its left part runs on past the drawing's edge). */
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
  /** Most height the drawing may take (px); the camera keeps every plate inside it. Default: as tall as the closest view needs. */
  maxHeight?: number;
  /** The zoom shown before a plate came off: the camera never zooms in on a removal (it stays at most this). */
  hold?: number;
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

/** How full the sleeve looks: the stylized stack over the sleeve, 0 (empty) to 1 (full). */
function fillOf(stack: number, sleeve: number): number {
  return Math.min(1, stack / sleeve);
}

/** The tallest plate on a side (its real diameter), 0 for none. */
function tallest(perSide: readonly number[], unit: Unit): number {
  return perSide.reduce((m, w) => Math.max(m, plateSpec(w, unit).diameter), 0);
}

/**
 * The centred camera's zoom for a stylized stack `stack` long (not empty): the closest zoom at
 * which the outermost plate and a little bare sleeve sit inside the half width, `EDGE_PX` in from
 * the edge. Without a width it is the same rule on the bar's own length (the margins left out).
 */
function centredZoom(stack: number, unit: Unit, bar: BarId, view?: { width: number; scale: number }): number {
  const spec = barSpec(bar, unit);
  const fill = fillOf(stack, spec.sleeve);
  if (fill >= 1) return 1;
  const outer = spec.shaft / 2 + spec.collar + stack + REVEAL_MM * perMm(unit) * (1 - fill);
  const z = view ? (view.width / 2 - EDGE_PX) / (outer * view.scale) : drawnLength(spec) / 2 / outer;
  return Math.min(ZOOM_CLOSE, Math.max(1, z));
}

/**
 * The bar's camera zoom for one side's plates (1 = the whole bar): ZOOM_CLOSE for an empty bar,
 * then the closest centred view that keeps both outermost plates in, easing to 1 at a full sleeve.
 * Never grows as plates are added. `fit` (the drawing's size) adds the edge margin and keeps the
 * tallest plate inside the height.
 */
export function zoomFor(perSide: readonly number[], unit: Unit, bar: BarId = 'olympic', fit?: { width: number; height: number; scale: number }): number {
  if (!perSide.length) return ZOOM_CLOSE;
  const z = centredZoom(stackLength(perSide, unit), unit, bar, fit && fit.scale ? fit : undefined);
  if (!fit || !fit.scale) return z;
  return Math.max(1, Math.min(z, (fit.height - 2 * PAD_Y) / (tallest(perSide, unit) * fit.scale)));
}

/** Share of the stylized thickness that fits the drawn sleeve (1 unless the stack is longer than the sleeve). */
export function thinFor(perSide: readonly number[], unit: Unit, bar: BarId = 'olympic'): number {
  const stack = stackLength(perSide, unit);
  const sleeve = barSpec(bar, unit).sleeve;
  return stack > sleeve ? sleeve / stack : 1;
}

/**
 * Height of the drawing for a width: the biggest plate at the closest zoom it is ever seen at (one
 * big plate per side, centred) and a little air, capped by `maxHeight` (the camera then pulls back
 * sooner), never below the whole bar's view. The same for every load, so nothing shifts (SPEC 13.2).
 */
export function drawingHeight(width: number, unit: Unit, maxHeight?: number): number {
  const scale = barScale(width, unit);
  const big = bigDiameter(unit) * scale;
  const natural = PAD_Y + big * (scale ? centredZoom(BIG_MM * perMm(unit), unit, 'olympic', { width, scale }) : 1) + PAD_Y;
  const floor = PAD_Y + big + PAD_Y;
  return maxHeight === undefined ? natural : Math.max(floor, Math.min(natural, maxHeight));
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
export const toScreen = (x: number, cx: number, zoom: number) => cx + (x - cx) * zoom;

/** The right side's tap target: from the sleeve to the drawing's edge, at least MIN_HIT wide. */
function rightHit(sleeveX: number, cx: number, zoom: number, width: number, height: number): Rect {
  const hi = width;
  const lo = Math.min(Math.max(0, toScreen(sleeveX, cx, zoom)), hi - MIN_HIT);
  return { x: lo, y: 0, width: hi - lo, height };
}

/** A removal never zooms in: with plates on, the zoom is at most the one held from before. */
const held = (zoom: number, perSide: readonly number[], hold?: number) => (perSide.length && hold !== undefined ? Math.max(1, Math.min(zoom, hold)) : zoom);

export function barLayout({ unit, perSide, width, bar = 'olympic', maxHeight, hold }: LayoutInput): BarLayout {
  const spec = barSpec(bar, unit);
  const scale = barScale(width, unit, bar);
  const height = drawingHeight(width, unit, maxHeight);
  const cy = height / 2;
  const mid = width / 2;
  // The camera's anchor: the empty close up keeps the right end put; with plates it is the middle.
  const cx = perSide.length ? mid : width;
  const zoom = held(zoomFor(perSide, unit, bar, { width, height, scale }), perSide, hold);
  const thin = thinFor(perSide, unit, bar);

  const shaftW = spec.shaft * scale;
  const shaftH = spec.shaftDiameter * scale;
  const collarW = spec.collar * scale;
  const collarH = spec.collarDiameter * scale;
  const sleeveW = spec.sleeve * scale;
  const sleeveH = spec.sleeveDiameter * scale;
  const capW = spec.capWidth * scale;
  const capH = spec.capDiameter * scale;

  const shaft = { x: mid - shaftW / 2, y: cy - shaftH / 2, width: shaftW, height: shaftH };
  const collarR = { x: mid + shaftW / 2, y: cy - collarH / 2, width: collarW, height: collarH };
  const sleeveR = { x: collarR.x + collarW, y: cy - sleeveH / 2, width: sleeveW, height: sleeveH };
  const capR = { x: sleeveR.x + sleeveW, y: cy - capH / 2, width: capW, height: capH };
  const mirror = (r: Rect): Rect => ({ ...r, x: mirrorX(r.x, r.width, width) });

  const right = stack(perSide, unit, scale, sleeveR.x, cy, thin);
  const plates = right.flatMap((p) => [p, { ...p, side: 'left' as const, x: mirrorX(p.x, p.width, width) }]);
  const hitR = rightHit(sleeveR.x, cx, zoom, width, height);
  // The left side: from the drawing's edge to the left sleeve's inner end, at least MIN_HIT wide
  // (in the empty close up that sleeve is past the edge: the strip is still there).
  const leftInner = toScreen(width - sleeveR.x, cx, zoom);
  const hitL = { x: 0, y: 0, width: Math.min(hitR.x, Math.max(MIN_HIT, leftInner)), height };

  return {
    width,
    height,
    scale,
    zoom,
    cx,
    cy,
    mid,
    bar,
    sleeves: { left: mirror(sleeveR), right: sleeveR },
    shoulders: { left: mirror(collarR), right: collarR },
    caps: { left: mirror(capR), right: capR },
    shaft,
    plates,
    thin,
    hits: { right: hitR, left: hitL },
    cropped: !perSide.length,
    sides: ['left', 'right'],
  };
}

/** Length of a drawn horn (post, collar, sleeve, cap) in the unit's length unit. */
function hornLength(unit: Unit): number {
  const spec = barSpec('olympic', unit);
  return FRAME_MM * perMm(unit) + spec.collar + spec.sleeve + spec.capWidth;
}

/** Scene pixels per length unit of a horn at zoom 1 (the full horn): HORN_FULL of the width, or less so its first plate fits the height. */
export function hornScale(width: number, height: number, unit: Unit): number {
  return Math.max(0, Math.min((HORN_FULL * width) / hornLength(unit), (height - 2 * PAD_Y) / (bigDiameter(unit) * HORN_FIRST)));
}

/** A horn's drawing height: taller than the bar's on the same width, so the horn can be big. */
export function hornHeight(width: number, unit: Unit, maxHeight?: number): number {
  const natural = PAD_Y + bigDiameter(unit) * HORN_FIRST * ((HORN_FULL * width) / hornLength(unit)) + PAD_Y;
  // Never under HORN_MIN_H: the horn just gets smaller (its plates still fit at every zoom).
  return maxHeight === undefined ? natural : Math.max(HORN_MIN_H, Math.min(natural, maxHeight));
}

/**
 * The horn's camera zoom (1 = the full horn): a close up when empty (at most HORN_CLOSE, the whole
 * horn still in view), HORN_FIRST from the first plate, easing evenly to 1 at a full horn. Never
 * grows as plates are added; every plate always fits the height.
 */
export function hornZoom(perSide: readonly number[], unit: Unit, width: number, height: number): number {
  const scale = hornScale(width, height, unit);
  if (!scale) return 1;
  if (!perSide.length) return Math.max(1, Math.min(HORN_CLOSE, (HORN_EMPTY_MAX * width) / (hornLength(unit) * scale)));
  const first = fillOf(BIG_MM * perMm(unit), barSpec('olympic', unit).sleeve);
  const fill = fillOf(stackLength(perSide, unit), barSpec('olympic', unit).sleeve);
  return Math.max(1, Math.min(HORN_FIRST, 1 + ((HORN_FIRST - 1) * (1 - fill)) / (1 - first)));
}

/**
 * One plate loaded machine horn (SPEC 5.2), edge on: a machine post, a collar and the horn (one
 * Olympic sleeve long; machines vary, it only needs to look right, the math does not depend on
 * it), in the same picture style as the bar, with its own camera (hornZoom). Only the 'right' side.
 */
export function hornLayout({ unit, perSide, width, maxHeight, hold }: LayoutInput): BarLayout {
  const spec = barSpec('olympic', unit);
  const height = hornHeight(width, unit, maxHeight);
  const cy = height / 2;
  const frameLen = FRAME_MM * perMm(unit);
  const big = bigDiameter(unit);
  const scale = hornScale(width, height, unit);
  const zoom = held(hornZoom(perSide, unit, width, height), perSide, hold);
  const thin = thinFor(perSide, unit);

  const drawnW = hornLength(unit) * scale;
  const left = (width - drawnW) / 2;
  const cx = width / 2;
  // The machine post runs past the top and bottom of the drawing (a big machine, cropped).
  const frame = { x: left, y: cy - big * scale, width: frameLen * scale, height: 2 * big * scale };
  const collarW = spec.collar * scale;
  const collarH = spec.collarDiameter * scale;
  const sleeveW = spec.sleeve * scale;
  const sleeveH = spec.sleeveDiameter * scale;
  const shoulder = { x: frame.x + frame.width, y: cy - collarH / 2, width: collarW, height: collarH };
  const sleeve = { x: shoulder.x + collarW, y: cy - sleeveH / 2, width: sleeveW, height: sleeveH };
  const capW = spec.capWidth * scale;
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
    mid: cx,
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
