// Small readings of a lift's sets, shared by the coach's rules. Weights are compared through
// load.ts only.
import type { Load, Unit } from '../../db/types';
import { comparableWeight, formatWeight, pickedWeight, sameResistance } from '../load';
import type { RepRange } from '../progression';
import type { CoachSet, LiftSession } from './types';

/**
 * One lift's identity (SPEC 6 keys): the exercise, where its history counts (ANY_GYM '' for free
 * weights, the gym id for machines and Smith), how it is loaded, and Smith apart from a free bar.
 */
export function liftKey(exerciseId: string, loadKind: Load['kind'], gymKey: string, smith = false): string {
  return `${exerciseId}|${gymKey}|${loadKind}${smith ? '|smith' : ''}`;
}

/** The heaviest load of these sets (compared in the first set's unit). */
export function heaviestLoad(sets: readonly CoachSet[]): Load | null {
  if (!sets.length) return null;
  const unit = sets[0]!.load.unit;
  return sets.reduce((a, b) => (comparableWeight(b.load, unit) > comparableWeight(a.load, unit) ? b : a)).load;
}

/** Every set at the same resistance (any unit). */
export const sameWeight = (sets: readonly CoachSet[]): boolean => sets.length > 0 && sets.every((s) => sameResistance(s.load, sets[0]!.load));

/** Every set reached the top of the range. */
export const allTop = (sets: readonly CoachSet[], range: RepRange): boolean => sets.length > 0 && sets.every((s) => s.reps >= range[1]);

/** Sets that fell below the bottom of the range (missed reps). */
export const missedCount = (sets: readonly CoachSet[], range: RepRange | null): number => (range ? sets.filter((s) => s.reps < range[0]).length : 0);

/** A workout where reps fell sharply from the first to the last set at the same weight (40% or more). */
export const SHARP_DROP = 0.4;
export function sharpDrop(s: Pick<LiftSession, 'sets'>): boolean {
  const first = s.sets[0];
  const last = s.sets[s.sets.length - 1];
  if (!first || !last || s.sets.length < 2 || !sameResistance(first.load, last.load) || first.reps <= 0) return false;
  return (first.reps - last.reps) / first.reps >= SHARP_DROP;
}

/** The weight a lift was last done at, as picked (bar total, one dumbbell, the pin), or null. */
export function lastPicked(session: LiftSession | undefined): { value: number; unit: Unit; load: Load } | null {
  const load = session ? heaviestLoad(session.sets) : null;
  const value = load ? pickedWeight(load) : null;
  return load && value !== null ? { value, unit: load.unit, load } : null;
}

/** "+10 lb", "+5 lb each" (dumbbells), "−15 kg": a change in plain words. */
export function changeWords(kind: Load['kind'], delta: number, unit: Unit): string {
  const sign = delta < 0 ? '−' : '+';
  return `${sign}${formatWeight(Math.abs(delta), unit)}${kind === 'dumbbell_each' ? ' each' : ''}`;
}

/** "185 lb", "30 lb each": a picked weight in plain words. */
export function weightWords(kind: Load['kind'], value: number, unit: Unit): string {
  return `${formatWeight(value, unit)}${kind === 'dumbbell_each' ? ' each' : ''}`;
}
