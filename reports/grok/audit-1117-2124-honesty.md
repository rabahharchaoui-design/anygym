STATUS: HANDLED
Grok Build honesty audit, written Nov 17 21:38 at ed18080b. A second opinion, not orders: SPEC.md wins.

I'll audit only what's already built, starting with the spec, the plan, and the newest reports so I don't repeat known findings.

The spec and the built plan items are in. Next I’ll read the newest audits and hunt for numbers, muscles, demos, and coach lines the app cannot back up.

I'll confirm the line numbers on the two honesty bugs and check that the newest reports do not already list them.

The newest reports do not mention the voice split or the side-delt naming. I'll lock the user-facing strings and line numbers before writing the audit.

# Grok honesty audit

- MAJOR src/lib/run/voice/events.ts:34 — A kilometer that contains a GPS gap is announced with a time shorter than the kilometer took. On the track in `src/lib/run/__tests__/live-4.3.test.ts` (600 m, a 40 s gap bridged over 120 m, then on), kilometer 1 is flagged and the summary leaves its time blank and prints "GPS gap". The voice still says that kilometer in four minutes and fifty-three seconds, the moving time with the 40 s gap left out, and says nothing about the gap. `src/lib/run/voice/compose.ts:103` always speaks `movingSec`; the null pace only drops the pace line, and `src/lib/run/voice/__tests__/compose-4.4.test.ts:125` locks that sentence in. Smallest fix: put `gap: true` on the split event when `last.gap` is set, and in `composeCue` speak only the split count. The flag has to come from the split, because a slow timed split also has a null pace and its time is real.

- MAJOR src/db/coachData.ts:75 — Side delts are named "front delts", and that false match changes the training advice. Dumbbell Lateral Raise (`dumbbell-lateral-raise`, exact match to `Side_Lateral_Raise`) has shoulders resolved to side: the sheet text is "Side delts" while the drawing region is `front-deltoids`. `primaryRegions` returns that region, and `regionWord` (`src/db/coachData.ts:67`, passed in `src/screens/today/useCoach.ts:55`) turns it into "front delts". Log the lateral raise yesterday and have Overhead Press (`Standing_Military_Press`, shoulders resolved to front) on today's plan, and Today says "You trained front delts yesterday, and today works it again. Go a little lighter if it feels tired." Worked lately shades the front-delt shape and its screen-reader line says "Under 24 h: front delts" (`src/screens/today/FreshMuscles.tsx:18`) with no "Side delts" caption. The same naming turns a hip abductor's "outer hips" into "glutes". Smallest fix: use the precise primary label from the muscle map (the words under the drawing) in the coach line and on the fresh card.

- MAJOR src/components/muscles/MuscleExercises.tsx:78 — Tapping the lit shoulder on Side Lateral Raise says "Side delts · primary" (`src/components/muscles/MuscleMap.tsx:44`), then the link and the sheet are titled "Front delts" and the subtitle says "Exercises where it does the main work". Side Lateral Raise is in that list because `src/lib/muscleExercises.ts:35` keeps every exercise whose primary region is the shared front-delt shape, so it sits with Overhead Press. Smallest fix: title the sheet with the precise label from the tap, and include only exercises whose primary label is that same label.
