// The intake's "Exercises you love / never want" deck (PLAN 3.5f, SPEC 14 item 11): one well known
// move per movement pattern that this person's gym surely has, with a sure demo, in a whole body
// order. Pure. Only the swap ladders are read, so a candidate move shows up here only after it is
// approved on this phone. Fewer moves fit: fewer cards, never padded.
import type { GymKit } from '../picker';
import { type Pattern, type SwapData, supports, workoutIdOf } from '../swap';

/** Legs, a push, a pull... so the first few cards already cover the body. */
export const DECK_PATTERNS: readonly Pattern[] = ['squat', 'horizontal push', 'horizontal pull', 'hinge', 'vertical push', 'vertical pull', 'lunge', 'biceps', 'triceps', 'glutes', 'lateral delt', 'core', 'chest isolation', 'hamstrings isolation', 'quads isolation', 'rear delt', 'calves'];

/** Rounds of the patterns: the best move of each first, then each pattern's next, up to `max` cards. */
export const INTAKE_DECK_MAX = 12;

export type IntakeDeckDeps = { data: SwapData; usable: (id: string) => boolean };

export function intakeDeck(gym: GymKit, deps: IntakeDeckDeps, max = INTAKE_DECK_MAX): string[] {
  const per = DECK_PATTERNS.map((p) =>
    deps.data.patterns[p].candidates
      .filter((c) => !c.timed && supports(c.requires, gym))
      .map(workoutIdOf)
      .filter(deps.usable),
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (let round = 0; out.length < max && per.some((ids) => ids.length > round); round++) {
    for (const ids of per) {
      const id = ids[round];
      if (!id || out.length >= max || seen.has(deps.data.sameAs(id))) continue;
      seen.add(deps.data.sameAs(id));
      out.push(id);
    }
  }
  return out;
}

/** A card decided: Love and Never never hold the same move; a pass leaves both as they were. */
export function decideExercise(lists: { love: readonly string[]; never: readonly string[] }, id: string, to: 'love' | 'never' | 'pass'): { love: string[]; never: string[] } {
  const love = lists.love.filter((x) => x !== id);
  const never = lists.never.filter((x) => x !== id);
  if (to === 'pass') return { love: [...lists.love], never: [...lists.never] };
  return to === 'love' ? { love: [...love, id], never } : { love, never: [...never, id] };
}
