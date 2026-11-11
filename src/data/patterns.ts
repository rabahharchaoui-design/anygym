// The movement pattern ladders over the committed data (PLAN 3.4, SPEC 7.2).
import file from '../../data/patterns.json';
import { PATTERNS, candidateFacts, type Candidate, type PatternFile, type PatternLadder, type Pattern, type SwapData } from '../lib/swap';
import { pickerId } from '../lib/picker';
import type { BarId } from '../db/types';
import type { ExerciseLoadType } from '../lib/loadTypeRule';
import { EXERCISE_MAP } from './muscles';
import { approvedCandidate, approvedLadder, approvedVersion } from './candidateGate';

export const PATTERN_FILE = file as unknown as PatternFile;

// One key per exercise: a plan id, its picker aliases and the catalog id it maps to or is linked with.
const KEY = new Map<string, string>();
for (const e of EXERCISE_MAP) if (e.catalogId && e.match !== 'none') KEY.set(e.planId, e.catalogId);
for (const ladder of Object.values(PATTERN_FILE.patterns)) {
  for (const c of ladder.candidates as Candidate[]) if (c.planId && !KEY.has(c.planId)) KEY.set(c.planId, c.id);
}

// PLAN 3.5e: a candidate G approved on this phone joins its ladder last, behind every sure move.
// Nothing approved: the committed ladders themselves, unchanged.
let ladders: { version: number; patterns: Record<Pattern, PatternLadder> } = { version: 0, patterns: PATTERN_FILE.patterns };
function laddersNow(): Record<Pattern, PatternLadder> {
  const v = approvedVersion();
  if (ladders.version !== v) {
    const patterns = {} as Record<Pattern, PatternLadder>;
    for (const p of PATTERNS) {
      const base = PATTERN_FILE.patterns[p];
      patterns[p] = { ...base, candidates: [...base.candidates, ...approvedLadder(p)] };
    }
    ladders = { version: v, patterns };
  }
  return ladders.patterns;
}

export const SWAP_DATA: SwapData = {
  get patterns() {
    return laddersNow();
  },
  planExercises: PATTERN_FILE.planExercises,
  sameAs: (id) => {
    const shown = pickerId(id);
    return KEY.get(shown) ?? KEY.get(id) ?? shown;
  },
};

/** How a catalog only candidate is loaded (plan exercises answer this themselves). */
// PLAN 3.5j: an approved move outside the ladders (a treadmill run) says its own load (timed).
export const candidateLoadOf = (id: string): ExerciseLoadType | undefined => candidateFacts(SWAP_DATA, id)?.load ?? approvedCandidate(id)?.load;
export const candidateBarOf = (id: string): BarId | undefined => candidateFacts(SWAP_DATA, id)?.bar;
/** Sets of this exercise count each side, when the ladder knows it. */
export const countsEachSide = (id: string): boolean => candidateFacts(SWAP_DATA, id)?.eachSide === true;
