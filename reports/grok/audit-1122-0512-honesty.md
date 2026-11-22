STATUS: HANDLED fix item H1 (2 major, both real)
Grok Build honesty audit, written Nov 22 05:26 at 3555fe95. A second opinion, not orders: SPEC.md wins.

I'll start with the spec, plan, and the newest audit reports so this honesty pass only covers what's already built and doesn't repeat known findings.

The last honesty pass found nothing new, and the open weight and run bugs are already in the newest reports. I'll look only at built surfaces those reports do not cover.

I'll confirm the two open honesty cases in the muscle sheet and the Quick "trained" lines, then write only new findings.

# Grok honesty audit

- MAJOR src/components/muscles/MuscleMap.tsx:329 — On Hip Abductor, the tap line says "Outer hips · primary", then the list opens titled "Glutes" with "Exercises where it does the main work" and includes Barbell Hip Thrust, whose main muscle is glutes. On Lat Machine Wide Grip Pulldown the tap line says "Lats · primary", then the list is titled "Upper back" and includes Seated Cable Rows and Bent Over Barbell Row, whose main muscle is mid back. The workout pair and the full map (lines 168, 199, and 341) pass `ownShoulderLabel`, which is null for these shapes, so the title falls back to the coarse region name (`src/components/muscles/MuscleExercises.tsx:20`) and `exercisesForRegion` (`src/lib/muscleExercises.ts:37`) lists every exercise that lights that shape. Smallest fix: pass that exercise's primary labels for the tapped shape, the same words as `pickLine`, into the link and the sheet; title the sheet with those words; keep a row only when one of its primary labels is one of those words.

- MAJOR src/db/training.ts:31 — Log one working set of barbell bench and open Quick. Hit what's fresh says "Skips chest and triceps (trained today)" (`src/lib/quickCards.ts:190`, shown at `src/screens/quick/ConceptCard.tsx:58`). Bench's primary muscle is chest; triceps is only a helper (`src/lib/order.ts:74`). The same stamp supplies "Leaves out … triceps (trained today)" and "Triceps trained today" (`src/lib/quickWhy.ts:87` and `:99`). Four bench sets on a plan whose remaining days are only chest, shoulders, and arms make Today's recovery line name shoulders and triceps as trained (`src/lib/plan/scheduleWords.ts:33`). Smallest fix: `musclesOf` returns only the profile's primary targets. A helper may still keep a later suggestion off the list, but no sentence may call that helper trained.
