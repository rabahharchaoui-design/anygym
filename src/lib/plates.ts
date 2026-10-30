// Plate dimensions for drawing and sleeve fit (SPEC 5.3). Pure data, no weight math.
//
// Lengths are in the gym's length unit: inches for lb plates, millimetres for kg plates.
// These numbers only decide how plates are drawn and whether they fit on the sleeve.
// Weight math lives in load.ts and never reads this file's dimensions.
import type { BarId, Unit } from '../db/types';

export type LengthUnit = 'in' | 'mm';

export type PlateSpec = {
  /** Plate weight in the gym unit. */
  weight: number;
  diameter: number;
  thickness: number;
  /** True when SPEC marks the size as approximate (or does not list it; see 1.25 lb). */
  approx: boolean;
  /** IWF colour for colour coded kg plates. lb plates are black iron. */
  color: 'black' | 'red' | 'blue' | 'yellow' | 'green' | 'white' | 'chrome';
};

export const LENGTH_UNIT: Record<Unit, LengthUnit> = { lb: 'in', kg: 'mm' };

/** Olympic loadable sleeve, about 16.4 in / 415 mm (SPEC 5.3). */
export const SLEEVE_LENGTH: Record<Unit, number> = { lb: 16.4, kg: 415 };

const LB45_THICKNESS = 1.81;
/**
 * Drawn diameter of the 45 lb plate and up. SPEC 5.6 TRUE SCALE (newer than the 17.01 in table in
 * 5.3, so it wins for drawing): 450 mm for 45 lb / 20 kg and up, the same disc as a kg bumper.
 */
const LB_BIG_DIAMETER = 450 / 25.4;

/** Heaviest first. Hammer Strength round rubber Olympic plates (SPEC 5.3). */
const LB_PLATES: PlateSpec[] = [
  // SPEC: 55 and 100 lb drawn at the big disc size, thickness of a 45 times 2.2 and 1.2.
  { weight: 100, diameter: LB_BIG_DIAMETER, thickness: LB45_THICKNESS * 2.2, approx: true, color: 'black' },
  { weight: 55, diameter: LB_BIG_DIAMETER, thickness: LB45_THICKNESS * 1.2, approx: true, color: 'black' },
  { weight: 45, diameter: LB_BIG_DIAMETER, thickness: LB45_THICKNESS, approx: false, color: 'black' },
  { weight: 35, diameter: 14.92, thickness: 1.8, approx: false, color: 'black' },
  { weight: 25, diameter: 12.6, thickness: 1.81, approx: false, color: 'black' },
  { weight: 10, diameter: 10.04, thickness: 1.52, approx: false, color: 'black' },
  { weight: 5, diameter: 7.24, thickness: 1.05, approx: false, color: 'black' },
  { weight: 2.5, diameter: 6.34, thickness: 0.94, approx: false, color: 'black' },
  // Not in the SPEC table (1.25 lb is an optional inventory plate). Sized to look right
  // next to the 2.5; change plates "only need to look right relative to each other".
  { weight: 1.25, diameter: 5.5, thickness: 0.75, approx: true, color: 'black' },
];

/** Heaviest first. 25 to 10 kg from the Rogue IWF training plate spec, change plates approx. */
const KG_PLATES: PlateSpec[] = [
  { weight: 25, diameter: 450, thickness: 64, approx: false, color: 'red' },
  { weight: 20, diameter: 450, thickness: 54, approx: false, color: 'blue' },
  { weight: 15, diameter: 450, thickness: 44, approx: false, color: 'yellow' },
  { weight: 10, diameter: 450, thickness: 32, approx: false, color: 'green' },
  { weight: 5, diameter: 230, thickness: 26, approx: true, color: 'white' },
  { weight: 2.5, diameter: 210, thickness: 19, approx: true, color: 'red' },
  { weight: 2, diameter: 190, thickness: 19, approx: true, color: 'blue' },
  { weight: 1.5, diameter: 175, thickness: 18, approx: true, color: 'yellow' },
  { weight: 1.25, diameter: 160, thickness: 16, approx: true, color: 'chrome' },
  { weight: 1, diameter: 160, thickness: 15, approx: true, color: 'green' },
  { weight: 0.5, diameter: 135, thickness: 12, approx: true, color: 'white' },
];

export const PLATE_SPECS: Record<Unit, readonly PlateSpec[]> = { lb: LB_PLATES, kg: KG_PLATES };

/** Spec for one plate size. Throws for a size the app does not know (never guess a size). */
export function plateSpec(weight: number, unit: Unit): PlateSpec {
  const spec = PLATE_SPECS[unit].find((p) => p.weight === weight);
  if (!spec) throw new Error(`Unknown ${unit} plate: ${weight}`);
  return spec;
}

/** Total sleeve length taken by one side's plates, in the unit's length unit. */
export function stackThickness(perSide: readonly number[], unit: Unit): number {
  return perSide.reduce((sum, w) => sum + plateSpec(w, unit).thickness, 0);
}

/** True when one side's plates fit on the loadable sleeve (default 16.4 in / 415 mm). */
export function fitsSleeve(perSide: readonly number[], unit: Unit, sleeveLength = SLEEVE_LENGTH[unit]): boolean {
  return stackThickness(perSide, unit) <= sleeveLength + 1e-9;
}

// ---------------------------------------------------------------- bar geometry (SPEC 5.6 TRUE SCALE)

/**
 * Real bar dimensions for drawing, in the unit's length unit (in for lb, mm for kg). Drawing and
 * sleeve fit only; the bar's weight is a separate, user owned number (load.ts never reads this).
 * `shaft` is the grip shaft between the inner collars, `sleeve` one loadable sleeve, `collar` one
 * inner collar. total = shaft + 2 × (collar + sleeve).
 */
export type BarSpec = {
  id: BarId;
  total: number;
  shaft: number;
  sleeve: number;
  collar: number;
  shaftDiameter: number;
  sleeveDiameter: number;
  collarDiameter: number;
  /** End cap on the free end of each sleeve, drawn just past it. */
  capWidth: number;
  capDiameter: number;
  /** True when SPEC gives no dimensions for this bar and Olympic proportions stand in for it. */
  schematic: boolean;
};

type MmBar = Omit<BarSpec, 'id' | 'total' | 'schematic'>;

/** Men's Olympic bar: 2200 mm = 1310 shaft + 2 × (30 collar + 415 sleeve); 28 mm shaft, 50 mm sleeves. */
const OLYMPIC_MM: MmBar = { shaft: 1310, sleeve: 415, collar: 30, shaftDiameter: 28, sleeveDiameter: 50, collarDiameter: 74, capWidth: 10, capDiameter: 55 };
/** Women's 15 kg bar: 2010 mm = 1310 shaft + 2 × (30 collar + 320 sleeve); 25 mm shaft. */
const WOMENS_MM: MmBar = { ...OLYMPIC_MM, sleeve: 320, shaftDiameter: 25 };

/**
 * EZ curl, trap and Smith bars: SPEC 5.6 points to "their own real dimensions from SPEC 5.3", but
 * 5.3 lists no dimensions for them and they vary by brand. Rather than invent a size, they are
 * drawn with Olympic proportions (marked schematic) and keep the Olympic sleeve for the fit check,
 * so a load that fits today still fits. Revisit when SPEC gives real numbers.
 */
const BAR_MM: Record<BarId, { mm: MmBar; schematic: boolean }> = {
  olympic: { mm: OLYMPIC_MM, schematic: false },
  womens: { mm: WOMENS_MM, schematic: false },
  ez_curl: { mm: OLYMPIC_MM, schematic: true },
  trap: { mm: OLYMPIC_MM, schematic: true },
  smith: { mm: OLYMPIC_MM, schematic: true },
};

/** Bar dimensions in the unit's length unit. The Olympic lb sleeve is SLEEVE_LENGTH.lb (16.4 in), the SPEC figure. */
export function barSpec(barId: BarId = 'olympic', unit: Unit): BarSpec {
  const { mm, schematic } = BAR_MM[barId];
  const k = unit === 'kg' ? 1 : 1 / 25.4;
  const sleeve = mm.sleeve === OLYMPIC_MM.sleeve ? SLEEVE_LENGTH[unit] : mm.sleeve * k;
  const out = {
    id: barId,
    shaft: mm.shaft * k,
    sleeve,
    collar: mm.collar * k,
    shaftDiameter: mm.shaftDiameter * k,
    sleeveDiameter: mm.sleeveDiameter * k,
    collarDiameter: mm.collarDiameter * k,
    capWidth: mm.capWidth * k,
    capDiameter: mm.capDiameter * k,
    schematic,
  };
  return { ...out, total: out.shaft + 2 * (out.collar + out.sleeve) };
}
