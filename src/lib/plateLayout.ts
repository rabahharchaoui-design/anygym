// Geometry for the plate diagram (SPEC 5.3, 5.6 TRUE SCALE). Pure, no React and no weight math:
// it only turns the real dimensions from plates.ts into pixel rectangles.
//
// One scale for the bar: shaft, collars, sleeves and end caps fill the card width with side
// margins at real proportions (the shaft about 3 times a sleeve), and plate DIAMETERS use the
// same scale. Plate THICKNESS is the one deliberate exception (G, Oct 25 6:13 PM): every plate is
// drawn fat enough to carry its own weight number on its face. When fat plates would run past the
// sleeve end, identical plates are drawn as one plate with a "×3" badge; if even that does not fit,
// the last plate on the sleeve stands for the rest ("+2"). The scale never comes from the loaded
// plates and the shaft never shrinks. Plates past the real sleeve end show the overflow marker.
import type { BarId, Unit } from '../db/types';
import { PLATE_SPECS, barSpec, plateSpec, type BarSpec } from './plates';

/** Side margin of the drawing (px), each side. */
export const PAD = 6;
/** Space above and below the biggest plate (px). */
export const PAD_Y = 3;
/** Font size of the number on a plate face (px). */
export const FACE = 12;
/** Font size of the "×3" badge under the number (px). */
export const BADGE = 11;
/** Smallest readable number (px). */
export const MIN_LABEL = 11;
/** Room around the number inside the plate face (px, both sides together). */
export const FACE_PAD = 6;
/** Rough width of one digit or point as a share of the font size (Space Grotesk, tabular, bold). */
const CHAR_EM = 0.62;
/** Pixel width of the machine frame post a horn sticks out of. */
export const FRAME_WIDTH = 22;

export type Side = 'left' | 'right';

/** One drawn plate: a single plate, a run of identical plates ("×3" badge), or the rest ("+2"). */
export type PlateRect = {
  side: Side;
  /** 0 = innermost. */
  index: number;
  /** The plate's weight (for "+N": the heaviest plate it stands for). */
  weight: number;
  /** Every plate this drawn plate stands for, heaviest first. */
  weights: number[];
  /** Full text for tests: "45", "3×45", or on the marker "then 25 · 10". */
  text: string;
  /** The number printed on the face: "45" (or "3×2.5" on a plate under TALL px). */
  face: string;
  /** "×3" under the number on a plate at least TALL px high, else null. */
  badge: string | null;
  /** Overflow marker: the weights it stands for, stacked ("25", "10"); empty on a plate. */
  lines: string[];
  /** The overflow marker: stands for plates that do not fit on the drawn sleeve. */
  more: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Rect = { x: number; y: number; width: number; height: number };

export type BarLayout = {
  width: number;
  height: number;
  /** Pixels per length unit (per inch for lb, per millimetre for kg), for the bar and plate diameters. */
  scale: number;
  /** Bottom of the plate area (the floor the bar's shadow sits on). */
  floor: number;
  bar: BarId;
  sleeves: Record<Side, Rect>;
  /** Inner collars: the raised flange where the shaft meets each sleeve. */
  shoulders: Record<Side, Rect>;
  /** End caps at the free ends of the sleeves. */
  caps: Record<Side, Rect>;
  shaft: Rect;
  plates: PlateRect[];
  /** Plates per side past the real sleeve end (0 = none): the SPEC 5.3 overflow state. */
  overflow: number;
  /** "then 25 · 10 · 5 · 2.5" when the marker cannot print every plate it stands for, else null. */
  breakdown: string | null;
  /** Sides that carry plates: both on a bar, only 'right' on a machine horn. */
  sides: Side[];
  /** Machine frame the horn sticks out of (horn only). */
  frame?: Rect;
};

export type LayoutInput = {
  unit: Unit;
  /** One side's plates in any order; drawn heaviest innermost. */
  perSide: readonly number[];
  /** Drawing width (px). Sets the scale with the bar's real length. */
  width: number;
  /** Number text per weight, e.g. "2.5". */
  labelOf: (weight: number) => string;
  /** Which bar, for its real dimensions. Default Olympic. */
  bar?: BarId;
};

/** Pixel width of a label at a font size. */
export function textWidth(text: string, size: number): number {
  return text.length * size * CHAR_EM;
}

/** Label for a run of identical plates: "45" for one, "3×45" for three. */
export function runLabel(count: number, text: string): string {
  return count > 1 ? `${count}×${text}` : text;
}

/** The biggest plate of a unit (450 mm): the drawing always has room for it, loaded or not. */
function bigDiameter(unit: Unit): number {
  return Math.max(...PLATE_SPECS[unit].map((p) => p.diameter));
}

/** Drawn length of a bar in its length unit: the bar plus its two end caps. */
function drawnLength(spec: BarSpec): number {
  return spec.total + 2 * spec.capWidth;
}

/** Pixels per length unit for a drawing width: the same rule on every phone (SPEC 5.6). */
export function barScale(width: number, unit: Unit, bar: BarId = 'olympic'): number {
  return Math.max(0, (width - 2 * PAD) / drawnLength(barSpec(bar, unit)));
}

/** Height of the drawing for a scale: the biggest plate and a little air. */
export function drawingHeight(scale: number, unit: Unit): number {
  return PAD_Y + bigDiameter(unit) * scale + PAD_Y;
}

/** Fat plate width for a drawing width: 24 px on the 320 floor, up to 28 px on a Pro Max. */
export function plateWidth(width: number): number {
  return Math.min(28, Math.max(24, 24 + (width - 288) / 30));
}

/**
 * The one height rule for a run's badge (plateLayout and BarSvg): a plate at least this tall carries
 * the number above the hub and "×3" below it; a shorter one prints "3×25" on one line.
 */
export const TALL = 40;
/** Squeezed plates (a side with up to 3 different plates): never narrower than this (px). */
export const MIN_PLATE = 18;
/** Room around the number inside a squeezed plate (px, both sides together). */
export const MIN_FACE_PAD = 4;
/** Line height of the stacked weights on the overflow marker (px). */
export const MARKER_LINE = 12;
/** The overflow marker prints at most this many lines; past that, two lines and "+N". */
export const MARKER_LINES = 3;

type Item = {
  weights: number[];
  text: string;
  face: string;
  badge: string | null;
  /** Stacked lines on the overflow marker (empty on a plate). */
  lines: string[];
  more: boolean;
  height: number;
  /** Width it likes, and the least it may be squeezed to. */
  width: number;
  min: number;
};

/** Runs of identical weights, heaviest first. */
function runsOf(sorted: readonly number[]): number[][] {
  const runs: number[][] = [];
  for (const w of sorted) {
    const last = runs[runs.length - 1];
    if (last && last[0] === w) last.push(w);
    else runs.push([w]);
  }
  return runs;
}

/** A drawn plate standing for a run of identical `weights`. */
function plateItem(weights: number[], unit: Unit, scale: number, base: number, labelOf: (w: number) => string): Item {
  const w = weights[0]!;
  const height = plateSpec(w, unit).diameter * scale;
  const n = weights.length;
  const one = labelOf(w);
  const tall = height >= TALL;
  const face = n > 1 && !tall ? runLabel(n, one) : one;
  const badge = n > 1 && tall ? `×${n}` : null;
  const text = Math.max(textWidth(face, FACE), badge ? textWidth(badge, BADGE) : 0);
  return { weights, text: runLabel(n, one), face, badge, lines: [], more: false, height, width: Math.max(base, text + FACE_PAD), min: Math.max(MIN_PLATE, text + MIN_FACE_PAD) };
}

/**
 * The overflow marker: the plates that do not fit on the drawn sleeve, their weights stacked on its
 * face ("25 / 10"); past three lines the first two and "+N" (the breakdown line names the rest).
 */
function markerItem(weights: number[], unit: Unit, scale: number, base: number, labelOf: (w: number) => string, plateH: number): Item {
  const runs = runsOf(weights).map((r) => runLabel(r.length, labelOf(r[0]!)));
  const lines = runs.length <= MARKER_LINES ? runs : [...runs.slice(0, 2), `+${runsOf(weights).slice(2).flat().length}`];
  const text = Math.max(...lines.map((l) => textWidth(l, BADGE)));
  const height = Math.min(plateH, Math.max(plateSpec(weights[0]!, unit).diameter * scale, lines.length * MARKER_LINE + 8));
  return {
    weights,
    text: `then ${runs.join(' · ')}`,
    face: lines[0]!,
    badge: null,
    lines,
    more: true,
    height,
    width: Math.max(base, text + FACE_PAD),
    min: Math.max(MIN_PLATE, text + MIN_FACE_PAD),
  };
}

/** Widths for `items` in `room` px: as they like, else squeezed evenly toward their minimum; null if not even that fits. */
function squeeze(items: Item[], room: number, allow: boolean): Item[] | null {
  const want = items.reduce((n, it) => n + it.width, 0);
  if (want <= room + 1e-6) return items;
  const least = items.reduce((n, it) => n + it.min, 0);
  if (!allow || least > room + 1e-6) return null;
  const f = (room - least) / (want - least);
  return items.map((it) => ({ ...it, width: it.min + (it.width - it.min) * f }));
}

/**
 * What to draw on one sleeve `room` px long, every number equal to what is drawn (SPEC 0):
 * every plate on its own when the fat plates fit; else one plate per run of identical plates
 * (squeezed down to MIN_PLATE when there are at most 3 different plates); else as many runs as
 * fit followed by the overflow marker naming the rest. `extra` plates (past the real sleeve end)
 * always go on the marker.
 */
function fit(sorted: readonly number[], extra: readonly number[], unit: Unit, scale: number, base: number, room: number, labelOf: (w: number) => string, plateH: number): Item[] {
  const runs = runsOf(sorted);
  const plate = (r: number[]) => plateItem(r, unit, scale, base, labelOf);
  if (!extra.length) {
    const single = squeeze(sorted.map((w) => plate([w])), room, false);
    if (single) return single;
    const grouped = squeeze(runs.map(plate), room, runs.length <= 3);
    if (grouped) return grouped;
  }
  const withRest = (k: number) => [...runs.slice(0, k).map(plate), markerItem([...runs.slice(k).flat(), ...extra], unit, scale, base, labelOf, plateH)];
  for (let k = runs.length - (extra.length ? 0 : 1); k > 0; k--) {
    const items = squeeze(withRest(k), room, true);
    if (items) return items;
  }
  return squeeze(withRest(0), room, true) ?? withRest(0);
}

/** Plates along +x from `start` on a sleeve (right side), and the breakdown line when the marker hides some. */
function stack(perSide: readonly number[], unit: Unit, scale: number, start: number, sleeve: number, cy: number, base: number, labelOf: (w: number) => string, plateH: number) {
  const sorted = [...perSide].sort((a, b) => b - a);
  // The real sleeve decides what fits (SPEC 5.3); the drawing only decides how it is shown.
  const fits: number[] = [];
  const hidden: number[] = [];
  let used = 0;
  for (const w of sorted) {
    const t = plateSpec(w, unit).thickness;
    if (hidden.length || used + t > sleeve + 1e-9) hidden.push(w);
    else {
      fits.push(w);
      used += t;
    }
  }
  const items = sorted.length ? fit(fits, hidden, unit, scale, base, sleeve * scale, labelOf, plateH) : [];
  const plates: PlateRect[] = [];
  let x = start;
  items.forEach((it, index) => {
    plates.push({ side: 'right', index, weight: it.weights[0]!, weights: it.weights, text: it.text, face: it.face, badge: it.badge, lines: it.lines, more: it.more, x, y: cy - it.height / 2, width: it.width, height: it.height });
    x += it.width;
  });
  // The marker prints only two lines and "+N": a line under the bar names every plate on it.
  const marker = items.find((it) => it.more && it.lines.length && it.lines[it.lines.length - 1]!.startsWith('+'));
  return { plates, hidden, breakdown: marker ? marker.text : null };
}

/** Mirror a right side rectangle onto the left side of a drawing of width `width`. */
const mirrorX = (x: number, w: number, width: number) => width - x - w;

export function barLayout({ unit, perSide, width, labelOf, bar = 'olympic' }: LayoutInput): BarLayout {
  const spec = barSpec(bar, unit);
  const scale = barScale(width, unit, bar);
  const plateH = bigDiameter(unit) * scale;
  const cy = PAD_Y + plateH / 2;
  const floor = PAD_Y + plateH;
  const cx = width / 2;

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

  const { plates: drawn, hidden, breakdown } = stack(perSide, unit, scale, sleeveR.x, spec.sleeve, cy, plateWidth(width), labelOf, plateH);
  const plates = drawn.flatMap((p) => [p, { ...p, side: 'left' as const, x: mirrorX(p.x, p.width, width) }]);

  return {
    width,
    height: drawingHeight(scale, unit),
    scale,
    floor,
    bar,
    sleeves: { left: mirror(sleeveR), right: sleeveR },
    shoulders: { left: mirror(collarR), right: collarR },
    caps: { left: mirror(capR), right: capR },
    shaft,
    plates,
    overflow: hidden.length,
    breakdown,
    sides: ['left', 'right'],
  };
}

/**
 * One plate loaded machine horn (SPEC 5.2), edge on: a frame post, a collar, and the horn, at the
 * same scale as the barbell on this width (one horn = one Olympic sleeve; machines vary, it only
 * needs to look right, the math does not depend on it), with the same fat numbered plates.
 * Only the 'right' side exists.
 */
export function hornLayout({ unit, perSide, width, labelOf }: LayoutInput): BarLayout {
  const spec = barSpec('olympic', unit);
  const scale = barScale(width, unit);
  const plateH = bigDiameter(unit) * scale;
  const cy = PAD_Y + plateH / 2;
  const floor = PAD_Y + plateH;

  const collarW = spec.collar * scale;
  const sleeveW = spec.sleeve * scale;
  const capW = spec.capWidth * scale;
  const drawnW = FRAME_WIDTH + collarW + sleeveW + capW;
  const left = Math.max(PAD, (width - drawnW) / 2);
  const frame = { x: left, y: PAD_Y, width: FRAME_WIDTH, height: plateH };
  const collarH = spec.collarDiameter * scale;
  const sleeveH = spec.sleeveDiameter * scale;
  const shoulder = { x: left + FRAME_WIDTH, y: cy - collarH / 2, width: collarW, height: collarH };
  const sleeve = { x: shoulder.x + collarW, y: cy - sleeveH / 2, width: sleeveW, height: sleeveH };
  const capH = spec.capDiameter * scale;
  const cap = { x: sleeve.x + sleeveW, y: cy - capH / 2, width: capW, height: capH };
  const none = { x: left, y: cy, width: 0, height: 0 };

  const { plates, hidden, breakdown } = stack(perSide, unit, scale, sleeve.x, spec.sleeve, cy, plateWidth(width), labelOf, plateH);

  return {
    width,
    height: drawingHeight(scale, unit),
    scale,
    floor,
    bar: 'olympic',
    sleeves: { left: none, right: sleeve },
    shoulders: { left: none, right: shoulder },
    caps: { left: none, right: cap },
    shaft: none,
    plates,
    overflow: hidden.length,
    breakdown,
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
