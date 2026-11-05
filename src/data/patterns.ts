// The movement pattern ladders over the committed data (PLAN 3.4, SPEC 7.2).
import file from '../../data/patterns.json';
import { candidateFacts, type Candidate, type PatternFile, type SwapData } from '../lib/swap';
import { pickerId } from '../lib/picker';
import type { BarId } from '../db/types';
import type { ExerciseLoadType } from '../lib/loadTypeRule';
import { EXERCISE_MAP } from './muscles';

export const PATTERN_FILE = file as unknown as PatternFile;

// One key per exercise: a plan id, its picker aliases and the catalog id it maps to or is linked with.
const KEY = new Map<string, string>();
for (const e of EXERCISE_MAP) if (e.catalogId && e.match !== 'none') KEY.set(e.planId, e.catalogId);
for (const ladder of Object.values(PATTERN_FILE.patterns)) {
  for (const c of ladder.candidates as Candidate[]) if (c.planId && !KEY.has(c.planId)) KEY.set(c.planId, c.id);
}

export const SWAP_DATA: SwapData = {
  ...PATTERN_FILE,
  sameAs: (id) => {
    const shown = pickerId(id);
    return KEY.get(shown) ?? KEY.get(id) ?? shown;
  },
};

/** How a catalog only candidate is loaded (plan exercises answer this themselves). */
export const candidateLoadOf = (id: string): ExerciseLoadType | undefined => candidateFacts(SWAP_DATA, id)?.load;
export const candidateBarOf = (id: string): BarId | undefined => candidateFacts(SWAP_DATA, id)?.bar;
/** Sets of this exercise count each side, when the ladder knows it. */
export const countsEachSide = (id: string): boolean => candidateFacts(SWAP_DATA, id)?.eachSide === true;
