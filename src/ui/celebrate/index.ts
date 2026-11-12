// src/ui/celebrate: the one celebration engine (PLAN 3.6b). The gym uses it today; runs, XP and
// the passport plug in the same way later.
//
// THREE TIERS, so it never gets tiring:
//   SMALL   while the work is going on (a set row): the "New best" chip springs in (PRBadge) and
//           the check draws itself (DrawnCheck). A picture in a row: it never blocks a tap.
//   MEDIUM  on the summary screen: a card (MomentCard) that bursts in with a few ice blue
//           particles and the real fact, "Barbell Bench Press · 185 lb × 6, heaviest ever · +10 lb".
//   BIG     on the summary screen, the whole screen, for a rare moment (BigMoment): a dark
//           backdrop, the number counts up, particles, then it settles into its place on the
//           screen under it. Any tap skips. Never during a set or a run.
//
// HOW TO USE IT (a producer is anything that knows a real, saved fact):
//   1. Build Moment objects (types.ts). The producer writes every word and number, already
//      formatted (weights through src/lib/load.ts); the engine computes nothing. Set `big` only
//      for what is truly rare, and `weight` so two moments of one kind can be ranked.
//      The gym's producer: src/lib/gymMoments.ts (pure) and src/db/celebrations.ts (the reads).
//   2. const { big, medium, small } = selectCelebrations(moments, place, { bigSpent })
//        place 'active'  → everything is SMALL (nothing interrupts);
//        place 'summary' → at most one BIG (the biggest wins), the rest MEDIUM, losers of the
//                          full screen first; bigSpent (already shown once) → no BIG, same order.
//      Show a BIG once only: claim it in storage first (the gym: db/celebrations.ts claimBig).
//   3. Render: <BigMoment moment reduce onSettle onDone />, <MomentCard moment arrival reduce />.
//      The BIG number travels to the element marked data-celebrate-home="<moment.id>" (a
//      MomentCard marks itself; any other element may carry the attribute, e.g. a stat tile).
//      Keep that element's room and hide it (MomentCard arrival 'hidden') until onSettle, so
//      nothing on the screen shifts when the BIG leaves.
//   4. Reduced motion: pass `reduce`. Same tiers, same words; a calm fade, no particles, no
//      count up, no travel (stagingFor).
//
// LIMITS, on purpose:
//   - No sound yet. A web app cannot read the silent switch; whether a sound stays quiet on
//     silent and leaves the playing music alone depends on the iOS audio session (the 'ambient'
//     navigator.audioSession type, Safari 16.4+), which only a real iPhone can prove. Not proven,
//     so not shipped: when it is, it belongs here as one optional, off by default call.
//   - No vibration. Safari on iPhone has none (PLAN 3.6b): nothing is promised.
//   - No libraries: one canvas (Particles) and CSS or Motion transforms and opacity. Springs and
//     durations come from src/ui/motion.ts only.
export type { Moment, MomentKind, Place, Selection, Staging, Tier } from './types';
export { KIND_ORDER, rankMoments, selectCelebrations, stagingFor, tierOf } from './select';
export { BigMoment, BIG_COUNT_MS, BIG_HOLD_MS } from './BigMoment';
export { MomentCard, type Arrival } from './MomentCard';
export { Particles } from './Particles';
export { DrawnCheck } from './DrawnCheck';
export { PRBadge } from '../PRBadge';
