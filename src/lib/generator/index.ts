// The plan generator (PLAN 3.5, SPEC 7.3, 7.4, 15, 22). Pure: no JSON, no Dexie, no React; the swap
// data, the ordering profiles and the names are passed in (src/data/generator.ts binds them).
//
// From the intake answers and the gym's equipment it writes a plan in the shipped JSON shape
// (data/plans/*.json, read by lib/plans.ts normalizePlan):
//   1. the split by days per week, each day a list of pattern slots, most important first;
//   2. each slot takes the best candidate of its ladder (data/patterns.json) this gym surely has,
//      never one on the never list, never a lift the "go easy on" list skips (order.ts), a loved one
//      first, the training style next; a slot with nothing that fits takes its fallback pattern or
//      stays empty (said, never padded);
//   3. sets, reps and rest by the Main goal and the level (SPEC 7.3; compound rest never below
//      SPEC 22 rule 6), and the Also goal adds its part;
//   4. focus areas add 2 to 4 weekly sets (SPEC 15);
//   5. the day in SPEC 22 order (order.ts orderUnits), safe pairs of small moves (canPair);
//   6. trimmed to the time picked the SPEC 7.4 way (estimateDayMinutes, the workout header's estimate).
// The same inputs always give the same plan: every choice is ranked, ties go to the ladder's order.
// A day with fewer than 3 moves the gym can do is an honest failure, never a padded plan.
//
// The old single file is split by job (types, pick, prescribe, finisher, focus, pairs, trim, fit,
// context, raw, day, plan); this index re-exports every name it exported, so imports of
// "lib/generator" keep working.

export { GENERATOR_VERSION } from './types';
export type { Applied, GeneratorDeps, GeneratorInput, GeneratorResult, Item, RawDay, RawFinisher, RawItem, RawPair, RawPlan, RawSingle } from './types';
export { WARM_UP_MIN_MINUTES, WARM_UP_SEC } from './finisher';
export { pairUp, splitUnequalPairs } from './pairs';
export { FIT_SLACK } from './fit';
export { hashText } from './raw';
export { generateDay } from './day';
export type { DayItem, DayResult } from './day';
export { generatePlan } from './plan';
