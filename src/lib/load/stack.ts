// Stack machines: pins, steps and the pin list.
import type { Unit } from '../../db/types';
import { add, EPS, nearestCount, times, toInt } from './exact';

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
