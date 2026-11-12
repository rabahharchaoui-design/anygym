// The shape of a quick workout style.
import type { DayItem } from '../generator';
import type { Range, Slot } from '../generatorRules';
import type { GoalId } from '../intake/options';
import type { Profile } from '../order';
import type { Requires } from '../swap';

export type StyleId = 'circuit' | 'pump' | 'strength' | 'cardioCore' | 'mobility' | 'armsAbs' | 'easy';

/** A grouped item: items sharing `group` are done back to back (2: a superset, 3 or more: a circuit). */
export type GroupedItem = DayItem & { group?: number };

export type Shape = 'circuit' | 'tri' | 'pairs' | 'straight';

export type StyleDef = {
  id: StyleId;
  title: string;
  /** The chip when the structure does not decide it (Strength, Low impact). */
  chip?: 'Strength' | 'Low impact';
  /** 1 to 3 dots: how hard the style is meant to be. */
  effort: 1 | 2 | 3;
  /** Different body areas of the same style; the first one that keeps the cards diverse is used. */
  variants: ReadonlyArray<{ key: string; label: string; slots: readonly Slot[] }>;
  /** Shorter than this, the style is not offered (Strength focus needs its long rest). */
  minMinutes?: number;
  shape: (minutes: number) => Shape;
  /** The goal its prescriptions come from (Strength focus trains like strength). */
  goals?: readonly GoalId[];
  /** Only the slots' own patterns (a small moves style never falls back to a row). */
  noFallback?: true;
  /** Fewer moves than the minutes would allow (Strength focus: fewer, heavier). */
  maxMoves?: (minutes: number) => number;
  /** Reps for every lift that is not timed, compounds and the rest. */
  reps?: { compound: Range; other: Range };
  /** Starting sets (rounds for a circuit); the fit adds or takes from there. */
  sets?: (newer: boolean) => number;
  maxSets: (newer: boolean) => number;
  /** Rest after a round of a group, after a single small move, and the least either may get. */
  rest: { group: number; single: number; floor: number; cap: number };
  /** May this exercise be in it at all (Easy start: low impact only). */
  only?: (p: Profile, requires: Requires | null) => boolean;
  /** Is its name true of what it holds. */
  honest: (ps: readonly Profile[], items: readonly { group?: number }[]) => boolean;
  /** 3.5b round 4: the most heavy lifts on the card. */
  maxHeavy?: number;
};
