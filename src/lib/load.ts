// Weight math (SPEC 5.4). The only place in the app that does arithmetic on weights.
// Pure functions: no React, no Dexie. Every function works in the gym's own unit.
//
// "Base weight": barbell math and plate loaded machine math share one model.
//   total = base + 2 × sum(perSide) + collars
// where `base` is the bar (barbell), the Smith bar (0 for "count plates only"), or the
// listed starting resistance of a plate loaded machine (0 for "plates only"), and
// `perSide` is the plates on one sleeve or one horn. `null` base = not known yet: the
// total is unknown and the UI shows "2 × 45 + bar"; a number is never guessed.
//
// Precision: sums run on integers at 1e-9 resolution, so 2.5 + 1.25 is exactly 3.75
// and never 3.7500000001. Nothing here rounds to display precision; only the format
// helpers at the bottom do that.
import { stackStepFor } from '../db/gyms';
import type { Collars, DumbbellRange, Gym, Load, PlateToggle, Unit } from '../db/types';
import { plateSpec, SLEEVE_LENGTH } from './plates';

export { fitsSleeve } from './plates';

/** Exact international definition: 1 lb = 0.45359237 kg. */
export const KG_PER_LB = 0.45359237;

export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const kgToLb = (kg: number): number => kg / KG_PER_LB;

/** Value in `from` expressed in `to`. Not rounded; round with roundToLoadable or format helpers. */
export function convertForGym(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  return from === 'lb' ? lbToKg(value) : kgToLb(value);
}

// ---------------------------------------------------------------- exact sums

const SCALE = 1e9;
const EPS = 1e-9;
const toInt = (x: number): number => Math.round(x * SCALE);
const fromInt = (n: number): number => n / SCALE;

/** Exact decimal sum (1e-9 resolution). */
export function add(...values: number[]): number {
  return fromInt(values.reduce((sum, v) => sum + toInt(v), 0));
}

/** Exact decimal a × n for an integer count n. */
function times(value: number, n: number): number {
  return fromInt(toInt(value) * n);
}

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
};

export type SumResult = {
  /** null when the base weight is unknown. Never a guess. */
  total: number | null;
  /** 2 × sum(perSide). */
  platesTotal: number;
  collarsTotal: number;
};

/** total = bar + 2 × sum(perSide) + collars. */
export function sumLoad({ bar, perSide, collars = 'none', unit }: SumInput): SumResult {
  const platesTotal = times(add(...perSide), 2);
  const collarsTotal = collarsWeight(collars, unit);
  return {
    total: bar === null ? null : add(bar, platesTotal, collarsTotal),
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

// ---------------------------------------------------------------- plate solver

export type SolveOptions = {
  /** Base weight (bar, Smith bar, or machine starting resistance). Must be known to solve. */
  bar: number;
  /** Enabled plate sizes in the gym unit. Each size may be used any number of times. */
  inventory: readonly number[];
  collars?: Collars;
  unit: Unit;
  /** Max plates per side. Defaults to whatever fits on the sleeve. */
  maxPerSide?: number;
  /** Loadable sleeve length in in (lb) or mm (kg). Defaults to SPEC 5.3. */
  sleeveLength?: number;
};

export type Loading = { total: number; perSide: number[] };

export type SolveResult =
  | { exact: true; total: number; perSide: number[] }
  | { exact: false; below?: Loading; above?: Loading; diffBelow?: number; diffAbove?: number };

type Table = {
  plates: number[];
  thick: number[];
  /** Plate weight in units of `step`. */
  units: number[];
  /** Weight of one unit. */
  step: number;
  maxC: number;
  maxS: number;
  sleeve: number;
  /** cost[i][c * (maxS + 1) + s] = least sleeve used by plates i.. with at most c plates summing to s units. */
  cost: Float64Array[];
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const tables = new Map<string, Table>();

/**
 * Least sleeve length for every reachable per side sum, by plate count, for plates i and lighter.
 * Lets the solver prove which sums are loadable and rebuild them heaviest first.
 */
function buildTable(opts: SolveOptions): Table {
  const plates = [...new Set(opts.inventory)].sort((a, b) => b - a);
  const sleeve = opts.sleeveLength ?? SLEEVE_LENGTH[opts.unit];
  const key = `${opts.unit}|${sleeve}|${opts.maxPerSide ?? ''}|${plates.join(',')}`;
  const cached = tables.get(key);
  if (cached) return cached;

  const thick = plates.map((w) => plateSpec(w, opts.unit).thickness);
  // Plate sizes have at most 3 decimals; milli units keep everything integer.
  const milli = plates.map((w) => Math.round(w * 1000));
  const g = milli.reduce((a, b) => gcd(a, b), 0) || 1;
  const units = milli.map((m) => m / g);
  const sleeveCap = plates.length ? Math.floor(sleeve / Math.min(...thick) + EPS) : 0;
  const maxC = Math.max(0, Math.min(opts.maxPerSide ?? Infinity, sleeveCap));
  const maxS = units.length ? maxC * Math.max(...units) : 0;
  const width = maxS + 1;

  const cost: Float64Array[] = new Array(plates.length + 1);
  const last = new Float64Array((maxC + 1) * width).fill(Infinity);
  for (let c = 0; c <= maxC; c++) last[c * width] = 0;
  cost[plates.length] = last;
  for (let i = plates.length - 1; i >= 0; i--) {
    const next = cost[i + 1]!;
    const row = new Float64Array((maxC + 1) * width).fill(Infinity);
    const u = units[i]!;
    const t = thick[i]!;
    for (let c = 0; c <= maxC; c++) {
      for (let s = 0; s <= maxS; s++) {
        let best = Infinity;
        for (let k = 0; k <= c && k * u <= s; k++) {
          const v = k * t + next[(c - k) * width + s - k * u]!;
          if (v < best) best = v;
        }
        row[c * width + s] = best;
      }
    }
    cost[i] = row;
  }

  const table = { plates, thick, units, step: g / 1000, maxC, maxS, sleeve, cost };
  tables.set(key, table);
  return table;
}

const loadable = (t: Table, s: number): boolean => t.cost[0]![t.maxC * (t.maxS + 1) + s]! <= t.sleeve + EPS;

/** Heaviest first plates for a loadable per side sum: as many of the heaviest plate as still leaves a fit. */
function rebuild(t: Table, s: number): number[] {
  const width = t.maxS + 1;
  const out: number[] = [];
  let c = t.maxC;
  let room = t.sleeve + EPS;
  let rest = s;
  for (let i = 0; i < t.plates.length; i++) {
    const u = t.units[i]!;
    const th = t.thick[i]!;
    const next = t.cost[i + 1]!;
    let k = Math.min(c, Math.floor(rest / u));
    while (k * th + next[(c - k) * width + rest - k * u]! > room) k--;
    for (let j = 0; j < k; j++) out.push(t.plates[i]!);
    c -= k;
    rest -= k * u;
    room -= k * th;
  }
  return out;
}

/**
 * Plates per side for a target total (SPEC 5.4). Heaviest plates first, symmetric, and only
 * loadings that fit on the sleeve count. When the target cannot be loaded exactly, returns the
 * nearest loadable totals below and above ("Closest: 185 or 190"). A target under the base
 * weight has no `below`; its `above` is the empty bar.
 */
export function solvePlates(target: number, opts: SolveOptions): SolveResult {
  const t = buildTable(opts);
  const base = add(opts.bar, collarsWeight(opts.collars ?? 'none', opts.unit));
  const totalOf = (s: number): number => add(base, times(t.step, 2 * s));
  const loadingOf = (s: number): Loading => {
    const perSide = rebuild(t, s);
    return { total: sumLoad({ bar: opts.bar, perSide, collars: opts.collars, unit: opts.unit }).total!, perSide };
  };

  let below: number | undefined;
  let above: number | undefined;
  for (let s = 0; s <= t.maxS; s++) {
    if (!loadable(t, s)) continue;
    const total = totalOf(s);
    if (Math.abs(total - target) < EPS) {
      const { perSide } = loadingOf(s);
      return { exact: true, total, perSide };
    }
    if (total < target) below = s;
    else {
      above = s;
      break;
    }
  }

  const result: SolveResult = { exact: false };
  if (below !== undefined) {
    result.below = loadingOf(below);
    result.diffBelow = add(target, -result.below.total);
  }
  if (above !== undefined) {
    result.above = loadingOf(above);
    result.diffAbove = add(result.above.total, -target);
  }
  return result;
}

/** Nearest loading to a target, preferring the lighter one on a tie. */
function nearestLoading(target: number, opts: SolveOptions): Loading {
  const r = solvePlates(target, opts);
  if (r.exact) return { total: r.total, perSide: r.perSide };
  if (r.below && (!r.above || r.diffBelow! <= r.diffAbove!)) return r.below;
  return r.above!;
}

// ---------------------------------------------------------------- stacks and dumbbells

/** Stack machine total: the pin value plus any added weight (e.g. an add-on plate). */
export function stackTotal(stackValue: number, added = 0): number {
  return add(stackValue, added);
}

/** Nearest multiple of `step` (ties go lighter), at least one step and at most `max`. */
export function nearestStack(target: number, step: number, max?: number): number {
  const n = Math.max(1, nearestCount(target, step));
  const value = times(step, n);
  return max !== undefined && value > max ? times(step, Math.floor(max / step + EPS)) : value;
}

/** n where n × step is nearest to value; ties go to the lower n. */
function nearestCount(value: number, step: number): number {
  return Math.ceil(toInt(value) / toInt(step) - 0.5);
}

/** Stored total for a dumbbell pair: 2 × each hand. */
export function dumbbellTotal(each: number): number {
  return times(each, 2);
}

/** Every dumbbell in the range, lightest first. */
export function dumbbellsInRange(range: DumbbellRange): number[] {
  const out: number[] = [];
  for (let n = 0; ; n++) {
    const w = add(range.min, times(range.step, n));
    if (w > range.max + EPS) return out;
    out.push(w);
  }
}

/** Nearest dumbbell (each hand) in the range; ties go lighter, clamped to the range. */
export function nearestDumbbell(target: number, range: DumbbellRange): number {
  const all = dumbbellsInRange(range);
  const n = Math.min(all.length - 1, Math.max(0, nearestCount(add(target, -range.min), range.step)));
  return all[n]!;
}

/** Next dumbbell up from `each`, or null at the top of the range. */
export function nextDumbbell(each: number, range: DumbbellRange): number | null {
  return dumbbellsInRange(range).find((w) => w > each + EPS) ?? null;
}

// ---------------------------------------------------------------- progression helpers (SPEC 6)

type GymLike = Pick<Gym, 'unit' | 'plateInventory' | 'dumbbellRange' | 'stackStep' | 'equipmentWeights'>;

/**
 * Smallest load step for SPEC 6 rule 2, in the gym unit.
 * Barbell and plate machines: 5 lb / 2.5 kg total, or one pair of the smallest enabled plate if
 * that is bigger (a step the gym cannot load is a lie). Dumbbells: the range step (next dumbbell
 * up). Stack: that machine's step. Bodyweight and timed: no load step (null). Null also when the
 * gym cannot make any step (no plates, no dumbbells).
 */
export function smallestIncrement(kind: Load['kind'], gym: GymLike, machineId?: string): number | null {
  switch (kind) {
    case 'barbell':
    case 'plate_machine': {
      const plates = enabledPlates(gym.plateInventory);
      if (!plates.length) return null;
      return Math.max(gym.unit === 'lb' ? 5 : 2.5, times(plates[plates.length - 1]!, 2));
    }
    case 'dumbbell_each':
    case 'single':
      return gym.dumbbellRange ? gym.dumbbellRange.step : null;
    case 'stack':
      return machineId ? stackStepFor(gym, machineId) : gym.stackStep;
    case 'bodyweight':
    case 'timed':
      return null;
  }
}

export type LoadableOptions =
  | ({ kind: 'plates' } & SolveOptions)
  | { kind: 'dumbbell'; range: DumbbellRange }
  | { kind: 'stack'; step: number; max?: number };

/**
 * Nearest weight the gym can actually load (ties go lighter). Used after convertForGym and for
 * the "−10%, rounded to a loadable weight" reset. Dumbbells are each hand.
 */
export function roundToLoadable(value: number, opts: LoadableOptions): number {
  switch (opts.kind) {
    case 'plates':
      return nearestLoading(value, opts).total;
    case 'dumbbell':
      return nearestDumbbell(value, opts.range);
    case 'stack':
      return nearestStack(value, opts.step, opts.max);
  }
}

// ---------------------------------------------------------------- display (the only rounding)

/**
 * Display rule (SPEC 5.4), same for kg and lb:
 * - A value that is exact to 2 decimals (every real plate, bar, dumbbell and stack weight) is
 *   shown exactly with trailing zeros dropped: 60, 102.5, 132.5, 1.25. A real weight is never
 *   rounded into a different number.
 * - Anything else (a converted value) is rounded to 1 decimal, dropping ".0": 44.1, 146.
 */
export function formatAmount(value: number): string {
  const hundredths = value * 100;
  const exact = Math.abs(hundredths - Math.round(hundredths)) < 1e-6;
  const text = exact ? (Math.round(hundredths) / 100).toString() : value.toFixed(1).replace(/\.0$/, '');
  return text === '-0' ? '0' : text;
}

/** "185 lb", "102.5 kg". */
export function formatWeight(value: number, unit: Unit): string {
  return `${formatAmount(value)} ${unit}`;
}

/**
 * The small math line under the total (SPEC 5.3), e.g.
 *   45 bar + 2 × (45 + 25) = 185 lb
 *   20 bar + 2 × (20 + 5) + 5 collars = 75 kg
 *   2 × 45 + bar                 (bar weight not known yet)
 * A base of 0 (plates only) is left out. `baseLabel` names the base ("bar", or e.g. "start" on a
 * plate loaded machine).
 */
export function formatMathLine(
  bar: number | null,
  perSide: readonly number[],
  collars: Collars,
  unit: Unit,
  baseLabel = 'bar',
): string {
  const { total, collarsTotal } = sumLoad({ bar, perSide, collars, unit });
  const parts: string[] = [];
  if (bar !== null && bar !== 0) parts.push(`${formatAmount(bar)} ${baseLabel}`);
  if (perSide.length === 1) parts.push(`2 × ${formatAmount(perSide[0]!)}`);
  if (perSide.length > 1) parts.push(`2 × (${perSide.map(formatAmount).join(' + ')})`);
  if (collarsTotal) parts.push(`${formatAmount(collarsTotal)} collars`);
  if (total === null) return [...parts, baseLabel].join(' + ');
  const left = parts.length ? parts.join(' + ') : `0 ${baseLabel}`;
  return `${left} = ${formatWeight(total, unit)}`;
}
