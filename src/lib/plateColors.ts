// Plate colours and the "Each side" chips (PLAN 2.0d). Pure, no React and no weight math:
// it only names a colour per plate size and groups one side's plates for the quiet chips line.
import type { Unit } from '../db/types';

/** The colour families a drawn plate, a tray stripe and a chip can have. */
export type PlateColor = 'red' | 'blue' | 'yellow' | 'green' | 'white' | 'black' | 'gray' | 'graphite' | 'chrome';

/**
 * kg: IWF colours (25 red, 20 blue, 15 yellow, 10 green, 5 white, 2.5 black, 1.25 chrome; the
 * optional 2, 1.5, 1 and 0.5 follow the IWF change plates). lb: 55 red, 45 blue, 35 yellow,
 * 25 green, 10 white, 5 and 2.5 gray (PLAN 2.0d); the optional 100 is black and 1.25 chrome. The
 * 5 and the 2.5 are two different grays, light enough to read on the dark sheet (2.0d critic).
 */
const COLORS: Record<Unit, ReadonlyMap<number, PlateColor>> = {
  kg: new Map<number, PlateColor>([
    [25, 'red'],
    [20, 'blue'],
    [15, 'yellow'],
    [10, 'green'],
    [5, 'white'],
    [2.5, 'black'],
    [2, 'blue'],
    [1.5, 'yellow'],
    [1.25, 'chrome'],
    [1, 'green'],
    [0.5, 'white'],
  ]),
  lb: new Map<number, PlateColor>([
    [100, 'black'],
    [55, 'red'],
    [45, 'blue'],
    [35, 'yellow'],
    [25, 'green'],
    [10, 'white'],
    [5, 'gray'],
    [2.5, 'graphite'],
    [1.25, 'chrome'],
  ]),
};

/** Colour of one plate size. Throws for a size the app does not know (never guess). */
export function plateColor(weight: number, unit: Unit): PlateColor {
  const c = COLORS[unit].get(weight);
  if (!c) throw new Error(`Unknown ${unit} plate: ${weight}`);
  return c;
}

/**
 * Paint for each colour: the body, a lighter rim and a darker shade, all tuned for the dark sheet.
 * `edge` is a 1 px light outline for the dark plates (black, the grays): without it they sink into
 * the sheet (2.0d critic). The same edge rings their chip dots and tray stripes.
 */
export const PAINT: Record<PlateColor, { fill: string; rim: string; shade: string; edge?: string }> = {
  red: { fill: '#D7322C', rim: '#FF7A70', shade: '#7A1410' },
  blue: { fill: '#2D63D8', rim: '#7FA6FF', shade: '#132F72' },
  yellow: { fill: '#EFC12F', rim: '#FFE58A', shade: '#8A6A08' },
  green: { fill: '#2E9E4F', rim: '#7CDD95', shade: '#11512A' },
  white: { fill: '#E8E8EB', rim: '#FFFFFF', shade: '#8E8E96' },
  black: { fill: '#232327', rim: '#6A6A74', shade: '#050506', edge: '#8A8A94' },
  gray: { fill: '#8C9098', rim: '#C4C8CF', shade: '#3E4147', edge: '#B9BDC4' },
  graphite: { fill: '#6B6F77', rim: '#A5A9B1', shade: '#2C2E33', edge: '#A0A4AC' },
  chrome: { fill: '#B4B9C1', rim: '#F2F4F7', shade: '#5E636B' },
};

/** The rubber body of a black iron plate (colour shows as a band); dark, so it gets the edge too. */
export const IRON_EDGE = PAINT.black.edge!;

/** The sheet the plates are drawn on (tokens.css --surface-2), for the contrast check. */
export const SHEET_BG = '#17171A';

/** WCAG relative luminance of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** WCAG contrast ratio of two #RRGGBB colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** One chip of the "Each side" line: a weight, how many of it, and its colour. */
export type Chip = { weight: number; count: number; color: PlateColor };

/** One side's plates grouped by weight, heaviest first, each with its colour. */
export function sideChips(perSide: readonly number[], unit: Unit): Chip[] {
  const chips: Chip[] = [];
  for (const w of [...perSide].sort((a, b) => b - a)) {
    const last = chips[chips.length - 1];
    if (last && last.weight === w) last.count++;
    else chips.push({ weight: w, count: 1, color: plateColor(w, unit) });
  }
  return chips;
}

/** A chip's text: "45 ×2" for two, "10" for one. `label` prints the weight ("2.5"). */
export function chipText(chip: Chip, label: (w: number) => string): string {
  return chip.count > 1 ? `${label(chip.weight)} ×${chip.count}` : label(chip.weight);
}
