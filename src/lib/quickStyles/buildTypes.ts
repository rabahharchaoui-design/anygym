// What building one card takes and gives.
import type { GeneratorDeps, GeneratorInput } from '../generator';
import type { Slot } from '../generatorRules';
import type { Profile } from '../order';
import type { Requires } from '../swap';
import type { Density } from './estimate';
import type { GroupedItem, Shape, StyleDef } from './types';

export type BuildDeps = GeneratorDeps & {
  usable: (id: string) => boolean;
  requires: (id: string) => Requires | null;
};

export type BuildSpec = {
  /** 3.5b round 4: the most heavy lifts the card may hold. */
  maxHeavy?: number;
  name: string;
  slots: readonly Slot[];
  shape: Shape;
  input: GeneratorInput;
  /** The most moves to start from. */
  want: number;
  density: Density;
  reps?: StyleDef['reps'];
  sets?: number;
  maxSets: number;
  rest: StyleDef['rest'];
  /** Rest after a heavy or big compound done on its own is never shortened (SPEC 22 rule 6). */
  only?: (p: Profile, requires: Requires | null) => boolean;
};

export type Work = GroupedItem & { profile: Profile; keepRest: boolean };

/**
 * One card: the slots filled the plan generator's way (gear, never, go easy on, loved, soft dislikes,
 * a sure demo), grouped the style's way, then fitted to the minutes through the one estimate: rest
 * first, then sets, then the last moves (never under 3) when it is long; sets, then rest when it is
 * short. null when fewer than 3 sure moves fit, or it still cannot fit.
 */
export type Built = {
  items: GroupedItem[];
  minutes: number;
  /** Still more than 2 min under the minutes: the gym had no more sure moves, or every set and rest is at its cap. */
  short?: 'moves' | 'caps';
};
