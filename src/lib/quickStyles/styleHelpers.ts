// Small helpers the style definitions use: pattern areas, honest tests, fill slots.
import type { Slot } from '../generatorRules';
import { isCompound, isHeavy, type Profile } from '../order';
import type { Pattern, Requires } from '../swap';

export const s = (pattern: Pattern, variant = false): Slot => (variant ? { pattern, variant: true } : { pattern });

export const LEGS: ReadonlySet<Pattern> = new Set<Pattern>(['squat', 'hinge', 'lunge', 'quads isolation', 'hamstrings isolation', 'glutes', 'calves']);
export const PUSH: ReadonlySet<Pattern> = new Set<Pattern>(['horizontal push', 'vertical push', 'chest isolation', 'triceps']);
export const PULL: ReadonlySet<Pattern> = new Set<Pattern>(['horizontal pull', 'vertical pull', 'rear delt', 'biceps']);
export const ARMS: ReadonlySet<Pattern> = new Set<Pattern>(['biceps', 'triceps', 'lateral delt', 'rear delt']);
export const has = (ps: readonly Profile[], set: ReadonlySet<Pattern>) => ps.some((p) => p.pattern !== null && set.has(p.pattern));
export const grouped = (items: readonly { group?: number }[], size: (n: number) => boolean) => [...structureCounts(items).values()].some(size);
export function structureCounts(items: readonly { group?: number }[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const it of items) if (it.group !== undefined) m.set(it.group, (m.get(it.group) ?? 0) + 1);
  return m;
}

/**
 * Low impact: no barbell, nothing hanging from or pressing your own bodyweight, and a big lift only
 * on a machine that holds the path for you (a leg press, never a loaded squat or hinge).
 */
export function lowImpact(p: Profile, requires: Requires | null): boolean {
  if (!requires || p.role !== 'lift' || p.advanced) return false;
  const hard = new Set(['barbell_rack', 'pull_up_bar', 'dip_station']);
  if (!requires.every((g) => !g.every((id) => hard.has(id)))) return false;
  return !isHeavy(p) || requires.some((g) => g.every((id) => id === 'leg_press'));
}

export const timedOr = (newer: boolean, a: number, b: number) => (newer ? a : b);

/** Legs, push or pull (null: abs, shoulders' small moves, anything else). */
export const bodyArea = (p: Profile): 'legs' | 'push' | 'pull' | null =>
  p.pattern === null ? null : LEGS.has(p.pattern) && p.pattern !== 'calves' ? 'legs' : PUSH.has(p.pattern) ? 'push' : PULL.has(p.pattern) ? 'pull' : null;

/**
 * 3.5b round 4 (M6): a pump is built around a main lift: the card opens on a big lift, and its first
 * pair is that lift with a move of another area (a push with a pull, a leg move with an upper one),
 * never a big lift next to an ab move.
 */
export function mainPair(ps: readonly Profile[], items: readonly { group?: number }[]): boolean {
  if (!ps.length || !isCompound(ps[0]!) || items[0]?.group === undefined) return false;
  const g = items[0].group;
  const partner = items.findIndex((it, i) => i > 0 && it.group === g);
  if (partner === -1) return false;
  const a = bodyArea(ps[0]!);
  const b = bodyArea(ps[partner]!);
  return a !== null && b !== null && a !== b;
}

/** 3.5b round 4 (B4): a real leg move: knee or hip dominant and a compound (never a back extension or a leg extension alone). */
export const realLegs = (p: Profile): boolean => p.pattern !== null && ['squat', 'hinge', 'lunge', 'glutes'].includes(p.pattern) && isCompound(p);

/** Fill patterns after a variant's own slots: the card reaches the minutes with what the gym surely has (3.5b round 4, B1). */
export const UPPER_FILL: Slot[] = [s('horizontal push', true), s('horizontal pull', true), s('vertical push', true), s('vertical pull', true), s('lateral delt', true), s('biceps', true), s('triceps', true), s('chest isolation', true), s('rear delt', true)];
export const LOWER_FILL: Slot[] = [s('squat', true), s('hinge', true), s('glutes', true), s('lunge', true), s('hamstrings isolation', true), s('quads isolation', true), s('calves', true)];
export const CORE_FILL: Slot[] = [s('core', true), s('core', true)];
/** Big lifts of another kind (a second row, a second press): Strength focus's 4th and 5th lift where a gym has few. */
export const COMPOUND_FILL: Slot[] = [s('horizontal pull', true), s('horizontal push', true), s('vertical pull', true), s('vertical push', true), s('squat', true)];
