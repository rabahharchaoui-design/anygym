// Exact decimal arithmetic: sums run on integers at 1e-9 resolution (see the note in index.ts).

const SCALE = 1e9;
export const EPS = 1e-9;
export const toInt = (x: number): number => Math.round(x * SCALE);
export const fromInt = (n: number): number => n / SCALE;

/** Exact decimal sum (1e-9 resolution). */
export function add(...values: number[]): number {
  return fromInt(values.reduce((sum, v) => sum + toInt(v), 0));
}

/** Exact decimal a × n for an integer count n. */
export function times(value: number, n: number): number {
  return fromInt(toInt(value) * n);
}

/** n where n × step is nearest to value; ties go to the lower n. */
export function nearestCount(value: number, step: number): number {
  return Math.ceil(toInt(value) / toInt(step) - 0.5);
}

/** `value × factor` exactly enough for rounding (1e-9). */
export const scale = (value: number, factor: number): number => fromInt(Math.round(toInt(value) * factor));
