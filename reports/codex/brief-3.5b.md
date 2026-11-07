Codex brief for PLAN item 3.5b, written Nov 08 02:14 at commit cd74b85. SPEC.md wins if they disagree; code may have moved since.

Read-only brief for [PLAN.md:97](/Users/rabah/projects/anygym/PLAN.md:97), item **3.5b**. No files edited; no tests run.

**1) Applicable SPEC and acceptance checks**

- [SPEC §20.3](/Users/rabah/projects/anygym/SPEC.md:483): retain time chips, intake defaults, curation deck, learned dislikes, same-pattern swaps, and manual picker.
- 3.5b extends that flow to four style-based ideas; SPEC still explicitly says three cards. Reconcile that discrepancy when implementing.
- Card 1: “Your plan, short,” using the active plan’s next day, current week, gym adaptations, and time trim.
- Card 2: “Hit what’s fresh,” based on logged training within 72 hours; never infer freshness from scheduled exercises.
- Remaining cards rotate among the seven styles named in 3.5b; names must describe the actual workout.
- No pair of cards may share more than half their primary muscles; measure actual selected exercises, not template labels.
- Styles completed in the last two quick workouts rank behind other eligible styles.
- Consecutive idea batches must differ when the available candidate pool permits another valid combination.
- Density targets: 15 minutes → 3–4 moves in a circuit; 30 → 5–6 moves with two pairs; 45 → 6–7; 60 → 7–9.
- Cards show actual exercise count, pair count, shared estimated minutes, style, required equipment, effort dots, and mini muscle map.
- “More ideas” replaces only card 4; “Pick exercises myself” remains underneath.
- Beginner or Go easy on intake requires an eligible Easy start/Low impact option.
- SPEC §§0, 3, 4.3–4.5: offline, supported equipment, verified demos, sure muscles; never pad with unsuitable exercises.
- SPEC §§7.2–7.4, 14–15, 22: preserve preferences, prescriptions, safe ordering, equal-set pairs, and heavy-lift rest.
- SPEC §§13.1–13.4, 23: 48-point controls, 130% text, safe areas, reduced motion, responsive layout; 3.5b requires ux-critic ≥9.
- Preserve §20.3’s default path under four taps and §20.4’s existing manual-workout tap limits.

**2) Files and implementation responsibilities**

- [src/lib/quick.ts](/Users/rabah/projects/anygym/src/lib/quick.ts): replace body-part `FALLBACK_ORDER`/`TEMPLATES` selection with explicit style candidates.
- Extend `Concept`, `ConceptId`, `QuickInput`, and `QuickItem` with style identity, group membership, equipment, effort, and history context.
- Distinguish concept identity (`plan`, `fresh`) from training style; rotation must track style rather than display title.
- Add proposed pure helpers `primaryMusclesOf()`, `compatibleConcepts()`, and `selectConceptBatch()`.
- Build several candidates per style, then select compatible combinations; greedy selection can prevent a valid fourth card.
- Keep `buildConcepts()` as the public entry point; return the selected batch plus available card-4 replacements.
- Update `planConcept()` title to “Your plan, short”; put the real day/plan name in its explanation.
- Pass Go easy on restrictions into `planConcept()`; its current eligibility predicate checks never/demo/gear but omits `easyOnAvoids()`.
- Preserve `nextSwap()`, `rankSoft()`, `withDislikes()`, canonical-ID exclusion, and exhausted-swap behavior.
- Make `quickDayOf()` and `conceptMinutes()` retain groups; currently every generated quick exercise becomes a straight-set block.
- [src/lib/generator.ts](/Users/rabah/projects/anygym/src/lib/generator.ts): extend `generateDay()` with optional quick-style construction parameters.
- Its current `DayResult` contains flat items, and `generateDay()` explicitly disables pairs; return grouping information as well.
- Reuse `pairUp()`, `splitUnequalPairs()`, `orderUnits()`, `canPair()`, `heaviestOf()`, and existing prescriptions.
- Add quick-specific density targets; changing shared `movesFor()` in `src/lib/generatorRules.ts` would also change generated plans.
- [src/lib/plans.ts](/Users/rabah/projects/anygym/src/lib/plans.ts): keep `estimateDayMinutes()` as the sole estimator.
- Existing multi-item blocks already charge rest once per round; add explicit circuit metadata for presentation and execution.
- [src/lib/planWorkout.ts](/Users/rabah/projects/anygym/src/lib/planWorkout.ts): carry quick group identity through `WorkoutEntry`/`dayWorkout()`.
- Implement grouped quick-workout round/rest behavior explicitly; preserve curated-plan behavior in `restAfter()` and `advancesAfterLog()`.
- [src/db/quick.ts](/Users/rabah/projects/anygym/src/db/quick.ts): add proposed `readQuickContext()` for per-muscle dates, recent completed styles, and rotation state.
- Extend `startBuilt()` to persist style and the exact grouped workout; preserve its existing-active-session return behavior.
- `readRecentMuscles()` and `readRecentAt()` cannot currently produce per-muscle “rested 4 days” explanations.
- [src/data/quick.ts](/Users/rabah/projects/anygym/src/data/quick.ts): bind verified primary-muscle and equipment facts into `QUICK_DEPS`.
- Use `workoutMuscles()` for the visible map; do not use its merged primary-plus-secondary regions as the diversity metric.
- [src/screens/quick/QuickScreen.tsx](/Users/rabah/projects/anygym/src/screens/quick/QuickScreen.tsx): load context once, render four skeletons/cards, and add More ideas.
- Keep a batch stable during selection, rerenders, and chip changes; advance rotation once per visit, not during render.
- Update `ConceptCard()` with style chip, accessible effort label, equipment drawings, specific why, and group-aware metadata.
- Reuse `EquipmentArt()` from `src/screens/intake/EquipmentArt.tsx` and `EQUIPMENT_LABEL` from `src/lib/intake/options.ts`.
- Resolve each requirement’s supported alternative before drawing equipment; an either/or requirement must not imply both are required.
- `src/screens/quick/Quick.module.css`: fit richer cards into a useful tall-screen composition; allow natural scrolling on SE and larger text.
- `src/screens/quick/Deck.tsx`: show group context and keep group membership intact across Keep/Swap/Never.
- `src/screens/workout/useWorkout.ts`: reconstruct grouped entries and estimate from the persisted quick definition.
- `src/screens/workout/DayList.tsx` and `ExerciseView.tsx`: distinguish circuits from two-exercise pairs in labels.
- `src/db/gymSwitch.ts`: update `workoutAtGym()` to reconstruct the same grouped entries used by `useWorkout()`.
- `src/screens/TodayScreen.tsx`: retain the `canBuild()` gate; its answer must agree with the new builder’s availability.

**3) Data model and Dexie**

- [src/db/types.ts](/Users/rabah/projects/anygym/src/db/types.ts): add optional session fields for quick style and grouped workout definition.
- Recommended shape: `quickStyle?: QuickStyleId`, `quickDay?: PlanDay`; existing `exerciseIds` and `targets` remain compatible.
- Store the performed IDs after deck curation; later replacements continue through existing `SessionSwap` slot handling.
- Add optional circuit metadata to `PlanBlock`; do not overload `warmup` or `mobility` to represent circuits.
- Add optional profile rotation state, for example `quickIdeas?: { cursor: number; lastSignature: string[] }`.
- Persist rotation transactionally, once per issued batch; account for React StrictMode effect replay and multiple tabs.
- Derive the last two completed styles from non-imported sessions with `endedAt` and actual logged work.
- Opening a deck, starting then abandoning, or finishing an empty session must not count as completing that style.
- Legacy sessions without style metadata remain unknown; do not classify them from exercise names.
- [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) is version 10. Optional, unindexed fields need no Dexie migration.
- No history rewrite or backfill is needed; missing fields preserve the existing straight-set behavior.
- Update `RECORD_CHECKS` in `src/lib/backup.ts` to validate new optional fields, group membership, and positive prescriptions.
- Test export, replace, and merge through `src/db/backup.ts`; new metadata must survive alongside the original sets.
- Plan-derived concepts retain `planId`, `dayId`, week, trim, swaps, and existing plan-completion semantics.

**4) Difficult edge cases and handling**

- Define overlap explicitly: proposed conservative rule is `2 × |A ∩ B| ≤ min(|A|, |B|)`.
- `A` and `B` are deduplicated primary-muscle sets from sure exercise data; empty/unknown sets cannot establish diversity.
- This interpretation can make four cards impossible, especially when a pinned full-body plan overlaps every alternative.
- Return an explicit shortage reason; never silently relax diversity or display renamed duplicates.
- Mandatory plan/fresh placement versus diversity needs a documented precedence before acceptance can be unconditional.
- With no dated history, say “No logged training yet”; never invent a rest duration.
- With dated older history, use the most recent training date for each named muscle; group wording uses the least-rested member.
- Exclude imported pseudo-dates and future dates; define the exact 72-hour boundary and freeze `now` for each batch.
- Preserve helper-muscle avoidance: current Quick freshness deliberately avoids offering triceps immediately after bench.
- Keep conservative recovery exclusions separate from the primary-only diversity calculation.
- After a swap, revalidate group compatibility, effort, equipment, and estimate; same pattern alone does not guarantee a safe pair.
- After Never removes a member, dissolve incomplete groups and recompute count/time; Undo restores the exact previous grouping.
- Recheck gym/equipment/preferences before Start if another tab changed them; do not start stale unsupported exercises.
- More ideas must satisfy diversity against cards 1–3; unavailable styles need a truthful reason.
- Strength focus must preserve heavy rest and suitable reps; never fill density targets by shortening heavy-lift recovery.

**5) Tests to write**

- Create `src/lib/__tests__/quick-3.5b.test.ts`; use deterministic seeded property cases, matching existing repo practice.
- Assert every displayed pair satisfies the overlap formula, every ID is canonical-unique, and each style description is true.
- Assert four cards when a valid combination exists; use an independent small exhaustive selector to catch greedy-selection failures.
- Assert mandatory-plan ordering, freshness placement, beginner inclusion, recent-style ranking, and changed consecutive signatures.
- Cover every `QUICK_MINUTES` value across `GYM_PRESETS`, plus custom dumbbell-only gyms and restrictive intake combinations.
- Assert density ranges and two real pairs at 30 minutes where feasible; unsupported presets return explicit shortages.
- Assert paired partners have equal sets, no conflicting muscles/helpers, and exclude the heaviest compound.
- Add hand-calculated estimator fixtures: straight sets, two pairs, circuit rounds, timed holds, transitions, and warmups.
- Assert card, deck, persisted workout, and header estimates agree before/after Swap, Never, Undo, and reload.
- Add freshness cases at 72 hours ±1 ms, older dates, imports, future dates, warmups, uncertain sets, and unlogged sessions.
- Create `src/db/__tests__/quick-3.5b.test.ts` with `fake-indexeddb`: exact persistence, active-session reuse, transactional failure, and rotation races.
- Extend backup tests for new-field round trips, malformed groups, legacy backups, merge, and replace.
- Update obsolete three-card/title assertions in `src/lib/__tests__/quick-3.5a.test.ts`, preserving its safety regressions.
- Create `tests/quick-3.5b.spec.ts`, importing `test`/`expect` from `tests/fixtures.ts`.
- Reuse `pastIntake()`, `counter()`, `swipe()`, `longPress()`, `dbPut()`, and `dbAll()` from existing helpers.
- Assert four rich cards, truthful metadata, card-4-only replacement, stable cards 1–3, and unchanged manual-picker access.
- Assert grouped execution/rest, offline start/reload, gym switching, double Start/Keep, and exact removal Undo.
- Check SE 375×667 and 17 Pro Max 440×956 through the existing WebKit projects; include iPhone 15 for PLAN’s visual requirement.
- Use `checkLayout()`, `checkControls()`, and `fullyShown()`; test 130% root text, long names, reduced motion, and no horizontal overflow.
- Record screenshots/video under `reports/shots/3.5b/` and `reports/videos/3.5b/`; obtain ux-critic ≥9.
- Run `npm test`, `npm run build`, then focused Playwright with `--project="iPhone SE" --project="iPhone 17 Pro Max"`; retain `@matrix` coverage.

**6) Existing-code conflicts and delivery risks**

- Catalog feasibility is the largest risk: no eligible stretching demos exist; Mobility reset cannot currently be delivered honestly.
- `Rope_Jumping` has eligible photos but sits outside the 17 movement ladders; cardio needs explicit requirements, profiles, and swap handling.
- No-equipment gyms currently have too few eligible moves for the builder’s three-move minimum; four full cards cannot be universal.
- New verified assets/pools may be necessary; never expand `data/catalog-demos.json` without inspecting both photos.
- SPEC §13.1 limits visible choices and avoids “Superset”; 3.5b explicitly requests four cards and that terminology. Align the written rules.
- Density targets conflict with “fewer moves” Strength focus and some trimmed plan days; document exceptions instead of misreporting counts.
- Existing `restAfter()` starts rest after every paired set, while the estimator charges once per round; grouping needs executable behavior.
- Coach auto warmups are currently omitted from the 3.6 estimate; tight quick-workout budgets must address that known gap.
- Avoid changing default generator output: frozen-plan equality tests and 3.6a isolation/pair regressions must remain green.
- Pending 3.8a also changes `QuickScreen.tsx` Never notices; preserve its named-exercise copy, wrapping, and adjacent Undo.
- Existing 3.5a UI tests hard-code three cards, old titles, and metadata regexes; update expectations without weakening demo/equipment checks.