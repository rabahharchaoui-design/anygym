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
import { defaultPlateInventory, stackStepFor } from '../db/gyms';
import type { BarId, Collars, DumbbellRange, Gym, Load, PlateToggle, Unit } from '../db/types';
import { PLATE_SPECS, plateSpec, SLEEVE_LENGTH } from './plates';

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

/**
 * Real plates for one side that weigh exactly `side` (an imported "per side" number, SPEC 9.3):
 * the listed plates when they are all real plates and add up, else heaviest first from the usual
 * plates (SPEC 5.3 defaults), then from every real plate of the unit (sleeve fit respected). null
 * when no real loading weighs exactly that.
 */
export function platesForSide(side: number, unit: Unit, listed?: readonly number[]): number[] | null {
  const real = PLATE_SPECS[unit].map((p) => p.weight);
  if (listed && listed.length > 0 && listed.every((w) => real.includes(w)) && toInt(add(...listed)) === toInt(side)) return [...listed];
  for (const inventory of [enabledPlates(defaultPlateInventory(unit)), real]) {
    const r = solvePlates(times(side, 2), { bar: 0, inventory, unit });
    if (r.exact) return r.perSide;
  }
  return null;
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

/** The most dumbbells a range may list (a real rack has far fewer): bounds every generated list. */
export const MAX_DUMBBELLS = 400;

/**
 * A range that makes sense (PLAN 1.7i): finite numbers, a positive step, min ≥ 0, max ≥ min and
 * at most MAX_DUMBBELLS weights. Anything else (step 0 from a damaged backup) lists nothing.
 */
export function validDumbbellRange(range: DumbbellRange): boolean {
  const { min, max, step } = range;
  if (![min, max, step].every(Number.isFinite) || step <= 0 || min < 0 || max < min) return false;
  return Math.floor(add(max, -min) / step + EPS) + 1 <= MAX_DUMBBELLS;
}

/** Every dumbbell in the range, lightest first; none for a range that is not valid (never loops). */
export function dumbbellsInRange(range: DumbbellRange): number[] {
  if (!validDumbbellRange(range)) return [];
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

/**
 * Top of the stack selector when the machine's real stack size is not known: 300 lb / 140 kg.
 * A display range only (how far the pin list scrolls), never stored and never shown as data.
 */
export const DISPLAY_STACK_MAX: Record<Unit, number> = { lb: 300, kg: 140 };

/**
 * A pin this machine can be set to: any positive whole multiple of its step (PLAN 1.7c: the pin
 * list grows past DISPLAY_STACK_MAX with "More", so validity never depends on the display range).
 */
export function isStackPin(value: number, step: number): boolean {
  return validStackStep(step) && value > 0 && toInt(value) % toInt(step) === 0;
}

/** The most pins a generated pin list holds: bounds every list, whatever a damaged step says. */
export const MAX_STACK_PINS = 2000;

/**
 * A stack step that makes sense (PLAN 1.7j): a finite number from 0.01 to 10000, exact to 2
 * decimals (what the number pad can type). Anything else (0, negative, 1e-12 from a damaged
 * backup) is never used to build a pin list.
 */
export function validStackStep(step: number): boolean {
  if (!Number.isFinite(step) || step < 0.01 || step > 10000) return false;
  return Math.abs(Math.round(step * 100) - step * 100) < 1e-6;
}

/** The pin list after "More": `pins` more steps past `max` (PLAN 1.7c). */
export function morePins(max: number, step: number, pins = 10): number {
  return add(max, times(step, pins));
}

/**
 * Every pin position of a stack, lightest first: step, 2 × step, ... up to max (at most
 * MAX_STACK_PINS). Empty for a step that is not valid (validStackStep) or a max that is not finite.
 */
export function stackValues(step: number, max: number): number[] {
  if (!validStackStep(step) || !Number.isFinite(max)) return [];
  const count = Math.min(MAX_STACK_PINS, Math.max(1, Math.floor(toInt(max) / toInt(step) + EPS)));
  return Array.from({ length: count }, (_, i) => times(step, i + 1));
}

// ---------------------------------------------------------------- Load records (SPEC 5.5)

/** Barbell: bar + 2 × perSide + collars. null while the bar weight is unknown (never a guess). */
export function barbellLoad(bar: number | null, perSide: readonly number[], collars: Collars, unit: Unit, barId?: BarId): Load | null {
  const { total, collarsTotal } = sumLoad({ bar, perSide, collars, unit });
  if (bar === null || total === null) return null;
  const load: Load = { kind: 'barbell', unit, total, barWeight: bar, perSide: [...perSide], collars: collarsTotal };
  if (barId) load.barId = barId;
  return load;
}

/** Dumbbell pair, each hand: total = 2 × each. */
export function dumbbellLoad(each: number, unit: Unit): Load {
  return { kind: 'dumbbell_each', unit, total: dumbbellTotal(each) };
}

/** One weight held (goblet, kettlebell): total = the weight. */
export function singleLoad(weight: number, unit: Unit): Load {
  return { kind: 'single', unit, total: weight };
}

/** The dumbbell or held weight a dumbbell_each / single load was made from; null for any other load. */
export function heldWeightOf(load: Load | null | undefined): number | null {
  if (load?.kind === 'dumbbell_each') return fromInt(toInt(load.total) / 2);
  if (load?.kind === 'single') return load.total;
  return null;
}

/** Stack: the pin value plus optional added weight (plates on the pin). */
export function stackLoad(stackValue: number, unit: Unit, added = 0): Load {
  const load: Load = { kind: 'stack', unit, total: stackTotal(stackValue, added), stackValue };
  if (added > 0) load.added = added;
  return load;
}

/** Plate loaded machine: start + 2 × sum(perSide). null while the starting resistance is unknown (never a guess). */
export function plateMachineLoad(start: number | null, perSide: readonly number[], unit: Unit): Load | null {
  if (start === null) return null;
  const total = sumLoad({ bar: start, perSide, unit }).total!;
  return { kind: 'plate_machine', unit, total, barWeight: start, perSide: [...perSide], collars: 0 };
}

/**
 * The collar weight a bar or plate machine load was lifted with (PLAN 1.7f), in the load's unit.
 * New loads store it. Older loads recover it as total − barWeight − 2 × sum(perSide) when that is
 * a real collar value (none, or the competition pair); anything else counts as 0. 0 for other kinds.
 */
export function collarsOf(load: Load): number {
  if (load.collars !== undefined) return load.collars;
  if (load.barWeight === undefined || !load.perSide) return 0;
  const rest = add(load.total, -load.barWeight, -times(add(...load.perSide), 2));
  const pair = collarsWeight('competition', load.unit);
  return Math.abs(rest - pair) < 1e-6 ? pair : 0;
}

/**
 * What a stored bar or plate machine total holds beyond bar, plates and collars (PLAN 1.7f): 0 for
 * every load this app builds; an older or imported record can carry a gap (stored 63 on 20 bar +
 * 2 × 20). Editing shows it as "3 other" so the stored total is never changed by just opening it.
 */
export function otherOf(load: Load): number {
  if (load.barWeight === undefined || !load.perSide) return 0;
  return add(load.total, -load.barWeight, -times(add(...load.perSide), 2), -collarsOf(load));
}

/** The collar setting a load was lifted with: editing a set uses this, never today's gym setting. */
export function collarsSettingOf(load: Load): Collars {
  return collarsOf(load) > 0 ? 'competition' : 'none';
}

/** Bodyweight: the body is not counted (it is not known); total is the added weight only, 0 with none. */
export function bodyweightLoad(unit: Unit, added = 0): Load {
  return added > 0 ? { kind: 'bodyweight', unit, total: added, added } : { kind: 'bodyweight', unit, total: 0 };
}

/** Timed hold: no load; the seconds live on the set. */
export function timedLoad(unit: Unit): Load {
  return { kind: 'timed', unit, total: 0 };
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
    case 'plate_machine':
      return plateIncrement(enabledPlates(gym.plateInventory), gym.unit);
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

/** 5 lb / 2.5 kg total, or one pair of the smallest plate if that is bigger. null with no plates. */
function plateIncrement(plates: readonly number[], unit: Unit): number | null {
  if (!plates.length) return null;
  return Math.max(unit === 'lb' ? 5 : 2.5, times(Math.min(...plates), 2));
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

// ---------------------------------------------------------------- progression targets (SPEC 6)
//
// The progression engine (progression.ts) decides WHICH rule applies; every weight it suggests is
// made here. It works on the "picked weight": the one number the user picks on the input.
//   barbell, plate machine: the total · dumbbells and one weight: one dumbbell · stack: the pin ·
//   bodyweight: the added weight (0 = just you) · timed: none.

/** What one exercise can load at this gym, already resolved for that exercise. */
export type LoadSetup = {
  unit: Unit;
  /** Bar (barbell, Smith) or starting weight (plate machine). null = not known yet. Ignored by other kinds. */
  base: number | null;
  /** Enabled plate sizes. */
  plates: readonly number[];
  /** Collars on barbells; machines use 'none'. */
  collars: Collars;
  dumbbellRange: DumbbellRange | null;
  /** This machine's stack step. */
  stackStep: number;
  /**
   * One weight that is a plate held in the hands (plate twists, plate raises, PLAN 1.7j): the
   * gym's enabled plate weights are the choices, never the dumbbell range.
   */
  heldPlates?: readonly number[];
};

/**
 * The weights a dumbbell pair or one held weight can be at this gym, lightest first: the enabled
 * plates for a held plate (LoadSetup.heldPlates), else the dumbbell range. null for other kinds.
 */
export function heldChoices(kind: Load['kind'], s: Pick<LoadSetup, 'dumbbellRange' | 'heldPlates'>): number[] | null {
  if (kind === 'single' && s.heldPlates) return [...new Set(s.heldPlates.filter((w) => Number.isFinite(w) && w > 0))].sort((a, b) => a - b);
  if (kind !== 'single' && kind !== 'dumbbell_each') return null;
  return s.dumbbellRange ? dumbbellsInRange(s.dumbbellRange) : [];
}

/** Nearest of a list (ties lighter), or null for an empty list. */
function nearestOf(value: number, list: readonly number[]): number | null {
  let best: number | null = null;
  for (const w of list) if (best === null || Math.abs(toInt(w) - toInt(value)) < Math.abs(toInt(best) - toInt(value))) best = w;
  return best;
}

/** The picked weight of a stored load (see above), or null for a timed hold. */
export function pickedWeight(load: Load): number | null {
  switch (load.kind) {
    case 'dumbbell_each':
    case 'single':
      return heldWeightOf(load);
    case 'stack':
      return load.stackValue ?? load.total;
    case 'bodyweight':
      return load.added ?? 0;
    case 'timed':
      return null;
    default:
      return load.total;
  }
}

/** Same kind, unit and weight (to the 1e-9). */
export function sameLoad(a: Load, b: Load): boolean {
  return a.kind === b.kind && a.unit === b.unit && toInt(a.total) === toInt(b.total) && toInt(a.added ?? 0) === toInt(b.added ?? 0);
}

/** How close two loads in different units must be to count as the same resistance (in the first load's unit). */
export const SAME_RESISTANCE_TOLERANCE = 0.01;

/**
 * The same resistance, in any unit (PLAN 1.7i, records): same load kind and the same compared
 * weight (comparableWeight) after converting the second into the first one's unit, within
 * SAME_RESISTANCE_TOLERANCE. Bodyweight with nothing added is the same in lb and kg.
 */
export function sameResistance(a: Load, b: Load): boolean {
  if (a.kind !== b.kind) return false;
  if (a.unit === b.unit) return sameLoad(a, b);
  if (a.kind === 'bodyweight' && !(a.added ?? 0) && !(b.added ?? 0)) return true;
  return Math.abs(comparableWeight(a, a.unit) - comparableWeight(b, a.unit)) <= SAME_RESISTANCE_TOLERANCE;
}

const plateOpts = (kind: Load['kind'], s: LoadSetup, base: number): SolveOptions => ({
  bar: base,
  inventory: s.plates,
  collars: kind === 'barbell' ? s.collars : 'none',
  unit: s.unit,
});

/**
 * The Load record for a picked weight, only when this gym can make it exactly; otherwise null
 * (an unknown bar, a missing plate, a dumbbell out of range, a pin off the stack). `added` is
 * the extra weight on a stack pin.
 */
export function loadAt(kind: Load['kind'], value: number, s: LoadSetup, added = 0): Load | null {
  switch (kind) {
    case 'barbell':
    case 'plate_machine': {
      if (s.base === null) return null;
      const r = solvePlates(value, plateOpts(kind, s, s.base));
      if (!r.exact) return null;
      return kind === 'barbell' ? barbellLoad(s.base, r.perSide, s.collars, s.unit) : plateMachineLoad(s.base, r.perSide, s.unit);
    }
    case 'dumbbell_each':
    case 'single': {
      if (!heldChoices(kind, s)!.some((w) => toInt(w) === toInt(value))) return null;
      return kind === 'single' ? singleLoad(value, s.unit) : dumbbellLoad(value, s.unit);
    }
    case 'stack':
      return isStackPin(value, s.stackStep) ? stackLoad(value, s.unit, added) : null;
    case 'bodyweight':
      return bodyweightLoad(s.unit, value);
    case 'timed':
      return timedLoad(s.unit);
  }
}

/** Why an earlier load cannot be copied exactly here (copyLoad), in the words the toast uses. */
export type CopyRefusal = 'unit' | 'kind' | 'base' | 'inexact';

/**
 * LAST TIME copy (PLAN 1.7j, SPEC 21.1): the earlier set's TOTAL made again on today's equipment
 * (today's bar or starting weight, collars, plates, dumbbells, stack step), never a silently
 * different total. The earlier plates are kept when they still make that total; otherwise the
 * total is solved again (135 lb on a 35 lb bar → 50 per side). `barId` is today's bar. Refused
 * (with the reason) when the unit or load kind differ, the base weight is unknown, or no exact
 * loading exists here.
 */
export function copyLoad(prev: Load, kind: Load['kind'], s: LoadSetup, barId?: BarId): { load: Load } | { load: null; why: CopyRefusal } {
  if (prev.kind !== kind) return { load: null, why: 'kind' };
  if (kind === 'timed') return { load: timedLoad(s.unit) };
  if (prev.unit !== s.unit) {
    // Just you is the same in any unit; any number is not (never converted silently).
    if (kind === 'bodyweight' && !(prev.added ?? 0)) return { load: bodyweightLoad(s.unit) };
    return { load: null, why: 'unit' };
  }
  switch (kind) {
    case 'barbell':
    case 'plate_machine': {
      if (s.base === null) return { load: null, why: 'base' };
      const collars = kind === 'barbell' ? s.collars : 'none';
      const own = prev.perSide && prev.perSide.every((w) => s.plates.includes(w)) ? prev.perSide : null;
      let perSide: number[] | null = null;
      if (own && toInt(sumLoad({ bar: s.base, perSide: own, collars, unit: s.unit }).total ?? NaN) === toInt(prev.total)) perSide = [...own];
      else {
        const r = solvePlates(prev.total, plateOpts(kind, s, s.base));
        if (r.exact) perSide = r.perSide;
      }
      if (!perSide) return { load: null, why: 'inexact' };
      const load = kind === 'barbell' ? barbellLoad(s.base, perSide, s.collars, s.unit, barId) : plateMachineLoad(s.base, perSide, s.unit);
      return load && toInt(load.total) === toInt(prev.total) ? { load } : { load: null, why: 'inexact' };
    }
    case 'stack': {
      const pin = prev.stackValue ?? prev.total;
      const load = loadAt('stack', pin, s, prev.added ?? 0);
      return load && toInt(load.total) === toInt(prev.total) ? { load } : { load: null, why: 'inexact' };
    }
    case 'bodyweight':
      return { load: bodyweightLoad(s.unit, prev.added ?? 0) };
    default: {
      const w = heldWeightOf(prev);
      const load = w === null ? null : loadAt(kind, w, s);
      return load ? { load } : { load: null, why: 'inexact' };
    }
  }
}

/**
 * Nearest picked weight this gym can load (ties lighter), e.g. after a unit conversion. null
 * when nothing can be loaded or the weight is not ours to round (added bodyweight, timed).
 */
export function nearestLoadable(kind: Load['kind'], value: number, s: LoadSetup): number | null {
  switch (kind) {
    case 'barbell':
    case 'plate_machine':
      return s.base === null ? null : roundToLoadable(value, { kind: 'plates', ...plateOpts(kind, s, s.base) });
    case 'single':
      if (s.heldPlates) return nearestOf(value, heldChoices(kind, s)!);
      return s.dumbbellRange && validDumbbellRange(s.dumbbellRange) ? roundToLoadable(value, { kind: 'dumbbell', range: s.dumbbellRange }) : null;
    case 'dumbbell_each':
      return s.dumbbellRange && validDumbbellRange(s.dumbbellRange) ? roundToLoadable(value, { kind: 'dumbbell', range: s.dumbbellRange }) : null;
    case 'stack':
      return roundToLoadable(value, { kind: 'stack', step: s.stackStep });
    case 'bodyweight':
      return toInt(value) === 0 ? 0 : null;
    case 'timed':
      return null;
  }
}

/**
 * One step up from a loadable picked weight (SPEC 6 rule 2): barbell and plate machines +5 lb /
 * +2.5 kg total (or the next loadable total above), the next dumbbell up, the next pin. null when
 * there is no step up here (top of the rack, full sleeve, bodyweight, timed).
 */
export function stepUp(kind: Load['kind'], value: number, s: LoadSetup): number | null {
  switch (kind) {
    case 'barbell':
    case 'plate_machine': {
      const inc = plateIncrement(s.plates, s.unit);
      if (s.base === null || inc === null) return null;
      const target = add(value, inc);
      const r = solvePlates(target, plateOpts(kind, s, s.base));
      return r.exact ? target : (r.above?.total ?? null);
    }
    case 'dumbbell_each':
    case 'single':
      // The next dumbbell up, or the next enabled plate up for a held plate.
      return heldChoices(kind, s)!.find((w) => w > value + EPS) ?? null;
    case 'stack':
      // The real stack size is not known: the next pin up (the user picks "More" if needed).
      return add(value, s.stackStep);
    case 'bodyweight':
    case 'timed':
      return null;
  }
}

/**
 * About 10% lighter, rounded to a weight this gym can load (SPEC 6 rule 3). A stack with `added`
 * weight on the pin (PLAN 1.7i): 10% off the TOTAL resistance, the added weight kept, and the pin
 * that is left rounded to a loadable pin (100 pin + 100 added → 180 total → an 80 pin).
 */
export function resetWeight(kind: Load['kind'], value: number, s: LoadSetup, added = 0): number | null {
  if (kind === 'stack' && added > 0) {
    const total = fromInt(Math.round(toInt(add(value, added)) * 0.9));
    return nearestLoadable(kind, add(total, -added), s);
  }
  return nearestLoadable(kind, fromInt(Math.round(toInt(value) * 0.9)), s);
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
 *   20 bar + 2 × 20 + 3 other = 63 kg   (an older record's gap, see otherOf)
 * A base of 0 (plates only) is left out. `baseLabel` names the base ("bar", or e.g. "start" on a
 * plate loaded machine).
 */
export function formatMathLine(
  bar: number | null,
  perSide: readonly number[],
  collars: Collars,
  unit: Unit,
  baseLabel = 'bar',
  other = 0,
): string {
  const { total, collarsTotal } = sumLoad({ bar, perSide, collars, unit, other });
  const parts: string[] = [];
  if (bar !== null && bar !== 0) parts.push(`${formatAmount(bar)} ${baseLabel}`);
  if (perSide.length === 1) parts.push(`2 × ${formatAmount(perSide[0]!)}`);
  if (perSide.length > 1) parts.push(`2 × (${perSide.map(formatAmount).join(' + ')})`);
  if (collarsTotal) parts.push(`${formatAmount(collarsTotal)} collars`);
  if (total === null) return [...parts, baseLabel].join(' + ');
  let left = parts.length ? parts.join(' + ') : `0 ${baseLabel}`;
  if (other > 0) left += ` + ${formatAmount(other)} other`;
  if (other < 0) left += ` − ${formatAmount(-other)} other`;
  return `${left} = ${formatWeight(total, unit)}`;
}

/**
 * One logged set as a compact row (PLAN 1.7): "12 × 185 lb", "10 × 30 lb each", "10 × 30 lb" (one weight held), "8 reps",
 * "8 reps + 25 lb", "45 s". Dumbbell pairs show the dumbbell, not the doubled total.
 */
export function formatSetLine(set: { reps?: number; seconds?: number; load?: Load }): string {
  const load = set.load;
  if (load?.kind === 'timed' || (set.reps === undefined && set.seconds !== undefined)) return `${set.seconds ?? 0} s`;
  const reps = set.reps ?? 0;
  if (!load) return `${reps} reps`;
  if (load.kind === 'bodyweight') return load.added ? `${reps} reps + ${formatWeight(load.added, load.unit)}` : `${reps} reps`;
  if (load.kind === 'dumbbell_each') return `${reps} × ${formatWeight(heldWeightOf(load)!, load.unit)} each`;
  return `${reps} × ${formatWeight(load.total, load.unit)}`;
}

// ---------------------------------------------------------------- totals (PLAN 1.7c, SPEC 21.1)

/**
 * Weight moved by one set: reps × the set's total, in the set's own unit (dumbbell pairs count
 * both dumbbells; bodyweight counts only the added weight, the body is not known). 0 for holds.
 */
export function setLifted(set: { reps?: number; seconds?: number; load?: Load }): number {
  if (!set.load || set.reps === undefined || set.load.kind === 'timed') return 0;
  return times(set.load.total, set.reps);
}

/** "Total lifted" over logged sets, in `unit`. A set in the other unit is converted for display only. */
export function totalLifted(sets: ReadonlyArray<{ reps?: number; seconds?: number; load?: Load }>, unit: Unit): number {
  return add(...sets.map((s) => (s.load ? convertForGym(setLifted(s), s.load.unit, unit) : 0)));
}

/** "4,350 lb", "1,234.5 kg": formatAmount with thousands separators. */
export function formatTotal(value: number, unit: Unit): string {
  const [whole, frac] = formatAmount(value).split('.');
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${frac ? `${grouped}.${frac}` : grouped} ${unit}`;
}

/** The weight a set table cell shows, number only (SPEC 21.1): the dumbbell (not the pair), the added weight on bodyweight, else the total. null for holds. */
export function cellWeight(load: Load): number | null {
  switch (load.kind) {
    case 'dumbbell_each':
      return heldWeightOf(load);
    case 'bodyweight':
      return load.added ?? 0;
    case 'timed':
      return null;
    default:
      return load.total;
  }
}

/**
 * The weight a record compares, in `unit` (PLAN 1.7c): the total for bars, machines and stacks,
 * one dumbbell for pairs, the added weight on bodyweight; converted when logged in the other unit.
 * Comparison only, never stored or shown.
 */
export function comparableWeight(load: Load, unit: Unit): number {
  const own = load.kind === 'stack' ? load.total : (pickedWeight(load) ?? 0);
  return convertForGym(own, load.unit, unit);
}

/** Plates on a bar or horn while its base weight is unknown: the "40 + bar" cell. */
export function platesOnly(perSide: readonly number[], unit: Unit): number {
  return sumLoad({ bar: 0, perSide, unit }).platesTotal;
}
