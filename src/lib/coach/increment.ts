// How big the next raise is, per person and per lift (SPEC 15 PERSONAL PROGRESSION ENGINE).
//
// Under 3 workouts of history: SPEC 15's fixed defaults (big leg lifts about 5%, at least +10 lb /
// +5 kg; upper body compounds 2.5%, at least +5 lb / +2.5 kg; small exercises one step, reps first).
// With more: the lift's own weekly gain (strength.ts weeklyRate) sets the share, bounded (big leg
// lifts 2.5 to 10%, upper body 1.25 to 5%), times what the lift learned from earlier raises
// (outcome.ts: a missed raise halves it, one done with reps to spare grows it a little). The
// weight itself always comes from load.ts levelUpWeight, rounded to what the gym can load.
import type { Load, Unit } from '../../db/types';
import { COACH_MIN_ADD, levelUpWeight, type LevelUpRule, type LoadSetup } from '../load';
import type { LiftClass } from './types';

export const DEFAULT_PCT: Record<'lower' | 'upper', number> = { lower: 0.05, upper: 0.025 };
export const MIN_PCT: Record<'lower' | 'upper', number> = { lower: 0.025, upper: 0.0125 };
/** SPEC 15 bounds: lower body up to +10%, upper up to +5%. */
export const MAX_PCT: Record<'lower' | 'upper', number> = { lower: 0.1, upper: 0.05 };
/** Workouts of a lift before its own rate is used. */
export const PERSONAL_AFTER = 3;
/** One Easy tap on the last workout: this much more, this time. */
export const EASY_BONUS = 1.25;

export type IncrementInput = {
  cls: LiftClass;
  /** weeklyRate(), or null. */
  rate: number | null;
  /** Workouts of this lift so far. */
  sessions: number;
  /** learnedScale(). */
  scale: number;
  /** The last workout was tapped Easy. */
  easy: boolean;
};

/** The rule for this raise (load.ts LevelUpRule): small exercises always take the single smallest step. */
export function raiseRule(input: IncrementInput, unit: Unit): LevelUpRule {
  if (input.cls === 'isolation') return { pct: 0, minAdd: 0, capPct: 0 };
  const c = input.cls;
  const personal = input.sessions >= PERSONAL_AFTER && input.rate !== null;
  const base = personal ? Math.min(MAX_PCT[c], Math.max(MIN_PCT[c], input.rate!)) : DEFAULT_PCT[c];
  const factor = input.scale * (input.easy ? EASY_BONUS : 1);
  const pct = Math.min(MAX_PCT[c], base * factor);
  // A lift that missed after a raise drops the minimum too: the next raise may be one small step.
  const minAdd = factor >= 1 ? COACH_MIN_ADD[c][unit] : 0;
  return { pct, minAdd, capPct: MAX_PCT[c] };
}

/** The next weight for one lift (`added`: weight on a stack pin, kept in the raise), or null when there is no step up at this gym. */
export function nextWeight(kind: Load['kind'], value: number, input: IncrementInput, setup: LoadSetup, added = 0): number | null {
  return levelUpWeight(kind, value, raiseRule(input, setup.unit), setup, added);
}
