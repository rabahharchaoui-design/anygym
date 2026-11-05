Codex brief for PLAN item 3.5, written Nov 05 19:02 at commit ff027eb. SPEC.md wins if they disagree; code may have moved since.

Read-only review completed; no files changed or tests run. Scope: [PLAN.md:89](/Users/rabah/projects/anygym/PLAN.md:89), item **3.5**. Paths below are relative to `/Users/rabah/projects/anygym`; proposed APIs are explicitly marked **new**.

**1) Applicable SPEC sections and acceptance checks**

- **§7.2:** reuse movement ladders and equipment eligibility from 3.4; every candidate must exist in the catalog.
- **§7.3:** generate exactly the requested number of training days, with these splits:
- 2 days: full body A/B; 3: full body A/B/C; 4: upper/lower twice.
- 5 days: upper/lower/push/pull/legs; 6: push/pull/legs twice.
- Muscle: compounds 8–12 reps, isolation 10–15; strength: compounds 4–6, accessories 8–10.
- Fat loss: 10–15 plus a 10-minute circuit/cardio finisher; stay fit: 8–12; athletic: compounds 5–8 plus conditioning/power.
- New lifters receive 2–3 sets, under two years 3, experienced lifters 3–4; encode deterministic choices within those ranges.
- **§22:** compounds before isolation; focus muscles earlier without pre-fatiguing helpers; safe pairs only; heaviest compound remains unpaired.
- Check weekly muscle frequency, push/pull balance and leg coverage; target roughly 10–20 weekly hard sets for muscle goals, fewer for beginners.
- Show effort guidance: beginners 2–3 reps left; otherwise compounds 1–2, isolation 0–1.
- **Rest conflict:** §7.3’s short rests conflict with §22. Apply §22 to generated plans: heavy compounds 120–180 seconds, strength heavy compounds at least 180, isolation 60–90.
- Keep both existing curated plans’ prescriptions unchanged; §22 explicitly protects originals.
- **§14 and §15 plan curation:** focus adds 2–4 weekly sets; easy-on filters candidates; love influences eligible choices; never excludes exercises.
- Respect days, session time, equipment and training preferences; reveal explanations must describe changes actually made.
- **§7.5:** ship Hotel Gym 3 Day, No Equipment 3 Day and Beginner Full Body 3 Day as generated, frozen, reviewed JSON.
- **§7.4:** reuse the existing duration estimate for generation; the pre-workout time sheet and session trimming remain item 3.6.
- **§8, §14:** support intake reveal → Start Day 1, Plans → Generate a new plan, and Settings → Rebuild my plan.
- **§0, §2, §4.3, §6, §9:** offline generation, transactional persistence, honest demos/muscles, unchanged history identities, complete backup/restore.
- **§13.3–13.4:** no console errors, double-tap safety, accessible controls, safe areas, 130% text and the full phone matrix.

**2) Files and concrete implementation**

- **Dependencies:** 3.4 and 3.4a are unchecked; neither `data/patterns.json` nor `src/lib/order.ts` exists in this checkout.
- Land those first and consume their tested APIs; do not build another equipment matcher or ordering engine inside the generator.
- **New `src/lib/generator.ts`:** pure `generatePlan(input, dependencies)` returning a normalized `Plan`, applied-reason records and unmet-constraint warnings.
- Keep timestamps, IDs, Dexie, React and JSON imports outside this function; identical inputs must yield identical prescriptions.
- Pipeline: sanitize → map goal/experience → select split/pattern slots → filter candidates → rank preferences → allocate sets → order → budget → validate.
- Hard filters precede preference ranking: equipment, never list and easy-on restrictions must beat love and ladder preference.
- **New `src/lib/generatorRules.ts`:** split templates, goal prescriptions, experience policies, focus allocation and explicit precedence.
- Map all eight `GoalId` values from `src/lib/intake/options.ts`; §7.3 defines only five prescription families.
- Proposed mappings: tone→muscle, health→stay-fit, race→stay-fit strength support, comeback→conservative stay-fit; document and test these product defaults.
- Treat `new`/`months` conservatively, `1_2y` as three sets, `3y` as three–four; returning lifters must not inherit advanced volume automatically.
- **New `src/data/generator.ts`:** assemble catalog, pattern, equipment and exercise-identity adapters for the pure generator.
- Use reviewed requirement metadata from 3.4, including benches, pull-up bars and specific machines; `gymSupports()` in `src/lib/picker.ts` is too coarse.
- **`src/lib/plans.ts`:** reuse `Plan`, `PlanDay`, `PlanBlock`, `PlanItem`, `itemTarget()`, `blockRest()` and `estimateDayMinutes()`.
- Generated plans use `progressionMode: 'double'`, explicit sets/rest and explicit reps versus seconds; extend types only for necessary structured metadata.
- **New `src/db/plans.ts`:** `getPlan(id, db)`, `listSavedPlans(db)` and `saveGeneratedPlan(...)`; resolve shipped plans plus persisted definitions.
- Save immutable generated versions; create IDs through existing `src/db/ids.ts:newId()`, outside the pure engine.
- **`src/db/planState.ts`:** adapt `choosePlan()`, `choosePlanUndoable()`, `setNextDay()` and `planDayOf()` to resolve saved definitions.
- Let `weekFor()` consume the resolved plan; preserve same-plan no-reset behavior and `undoChoosePlan()`’s compare-before-restore guard.
- **`src/db/workouts.ts`:** adapt `startPlanDay()` and `planProgress()`; include plan stores in every transaction that now reads them.
- Preserve `startPlanDay()`’s existing-active-session return, exercise ordering, week capture and Finish/Undo behavior.
- **`src/screens/workout/useWorkout.ts`:** load the saved plan with `useLive()` and include it in readiness/error handling before deriving `dayWorkout()`.
- **`src/screens/TodayScreen.tsx`, `src/screens/workout/FinishScreen.tsx`, `src/ui/ResumeBar.tsx`:** resolve persisted plans before showing days, targets or progress.
- **`src/screens/history/historyWords.ts`:** pass resolved plans into `workoutTitle()` and `exerciseNamer()`; keep these formatting functions synchronous.
- **`src/db/history.ts`:** update `warmUpIds()`/`recentExerciseIds()`; **`src/hooks/usePlanCatalogIds.ts`:** resolve saved plans before extracting catalog IDs.
- **`src/screens/intake/Reveal.tsx`:** preview generated output locally instead of relying on `planById(chosenId)`; retain curated alternatives.
- Persist the selected definition before choosing/starting it; redo retains the existing undoable plan-selection behavior.
- **`src/lib/intake/planPick.ts`:** retain useful `weekOf()` behavior; replace generated-path `explainPick()` with reasons from actual generator decisions.
- **`src/screens/intake/IntakeScreen.tsx`:** replace the equipment-step `pickPlan(...).kind === 'none'` gate with generator feasibility.
- **`src/screens/plans/PlansScreen.tsx`:** add Generate a new plan and saved generated plans; **`PlanViewer.tsx`:** resolve both saved and shipped plans.
- **`src/screens/SettingsScreen.tsx`:** add Rebuild my plan using existing `/welcome?redo=1`; hydrate through `redoAnswers()`.
- **New frozen files:** `data/plans/hotel-gym-3-day.json`, `no-equipment-3-day.json`, `beginner-full-body-3-day.json`.
- Emit the existing raw `days[].blocks[]` format accepted by `normalizePlan()`; register all three in `src/data/plans.ts`.
- **New `scripts/build-generated-plans.ts`:** fixed public inputs and generator version; deterministic output with a check mode for committed JSON.
- Update `data/plan-exercises.json`, `data/exercise-map.json` and `data/plan-exercise-overrides.json` for new exercises without renaming existing IDs.
- `scripts/build-plan-exercises.ts` currently discovers only exercises in plan JSON; extend its inputs if runtime candidates exceed those frozen plans.
- **`src/data/places.ts` / `src/lib/places.ts`:** derive new place tiles from real requirements; correct overly broad eligibility before advertising hotel/bodyweight compatibility.

**3) Data model and Dexie**

- Current schema is **v9**; `plans` and `planDays` already exist, but their row types contain only metadata.
- Recommended storage: extend `src/db/types.ts:Plan` with optional `definition`, `generatorVersion`, sanitized input snapshot and explanation/warning metadata.
- Alias `src/lib/plans.ts:Plan` as `PlanDefinition` to distinguish it from the database row type.
- Store the complete normalized definition on the plan row; avoid duplicating executable prescriptions across `plans` and `planDays`.
- Existing `PlanState.planId` and `Session.planId/dayId` reference immutable versions; rebuilding creates a new version and retains old definitions.
- No new store/index is required, so optional fields need **no Dexie version bump or data rewrite**; confirm after rebasing onto 3.4/3.4a.
- Save definition plus selected pointer transactionally; rollback must leave the previous selection intact.
- **`src/lib/backup.ts`:** extend `RECORD_CHECKS.plans`; validate nested definitions, positive prescriptions, unique day IDs and generated-plan pointer bounds.
- `planStateOk()` must validate against definitions in the backup as well as shipped plans; keep validation pure.
- **`src/db/backup.ts`:** existing `TABLE_NAMES` already exports plans; verify merge/replace preserve definitions and referenced historical versions.
- Never derive an old session’s prescription again from current profile answers, current equipment or a newer generator version.

**4) Tricky edge cases and handling**

- **Two identity systems:** ladders use catalog IDs such as `Dumbbell_Bench_Press`; workouts use slugs such as `dumbbell-bench-press`.
- Reuse 3.4’s explicit bridge. Do not slug catalog names blindly: that can split history, lose overrides or attach the wrong demo.
- Resolve love/never through the same identity bridge and established aliases; never wins when both lists identify the same movement.
- Missing equipment or easy-on restrictions can exhaust a pattern. Report the gap; never invent a pull-up bar, supported row or substitute movement.
- Bodyweight-only training cannot honestly reproduce every pulling pattern; the frozen plan must disclose its coverage limits.
- Equipment is a conjunction: dumbbell bench requires dumbbells **and** a suitable bench; “bodyweight” does not imply equipment-free.
- Unknown machine resistance/bar weight remains unknown; generated plans prescribe reps and sets, never invented starting loads.
- Multiple focus areas must not multiply volume without limit. Allocate within time/volume limits and report focus requests that could not fit.
- A 20-minute request may conflict with two protected compounds and a mandatory 10-minute finisher; return an honest constraint warning.
- Never claim “fits” from rounded-down duration or shorten heavy rests to force feasibility; treat 75+ as open-ended.
- Weekday-count mismatch must preserve every plan day; reuse `weekOf()`’s Day 1…N fallback.
- Explicit goal/focus outrank conflicting “win” answers; style ranks eligible choices; cardio favorites require available equipment.
- Keep reminder timing, optional identity/body details and skipped answers stored; do not fabricate training effects from them or claim starting-weight personalization.
- Existing used gyms are protected by `saveIntake()`; ensure generation uses the equipment actually selected for the intended gym.
- Back navigation/reload must reproduce the preview; double Start/Use must not create duplicate definitions or sessions.
- Rebuilding during an active workout must leave its plan version, pending rows, timers and saved sets untouched.

**5) Tests to write**

- **New `src/lib/__tests__/generator-3.5.test.ts`:** table over days 2–6 × all goals × experience levels; assert exact split, prescriptions and deterministic output.
- Assert every candidate exists, every requirement is satisfied, never/easy-on exclusions hold, and love cannot bypass hard filters.
- Assert focus adds 2–4 feasible weekly sets; baseline-versus-focused comparisons show the exact additions and budget tradeoffs.
- Assert weekly balance/frequency, beginner volume, helper ordering, safe pairing, heavy-rest floors and effort wording.
- Include hotel, machines-first beginner, no-equipment, all-candidates-excluded, conflicting preferences, 20-minute and 75+ cases.
- Add seeded combinatorial/property checks using Vitest; assert invariants across equipment subsets without requiring a new testing library.
- **New `src/lib/__tests__/generated-curated-3.5.test.ts`:** fixed inputs regenerate all three JSON files exactly; every day normalizes and produces valid `dayWorkout()` entries.
- Assert Hotel uses only its specified kit, No Equipment needs no apparatus, and Beginner prefers eligible compound machines.
- **New `src/db/__tests__/generated-plans-3.5.test.ts`:** save/reopen/start/finish/undo retains prescriptions, partial progress and old immutable versions.
- Inject failed writes and concurrent/double selections; assert atomic rollback, no orphan pointer, no reset of the same active plan.
- Extend migration compatibility tests with pre-feature v9 rows; assert all sessions, sets, loads and existing pointers survive unchanged.
- Extend backup tests: merge/replace round-trip definitions; malformed definitions fail without writes; old metadata-only plan rows remain readable.
- **New `tests/generator-3.5.spec.ts`:** import `test`/`expect` from `./fixtures`; fresh intake → generated reveal → Start → log three sets → Finish → History.
- Test Generate/Rebuild, curated override, selection Undo, offline reload, unavailable-pattern explanation and double primary taps.
- Run WebKit projects **`iPhone SE` (375×667)** and **`iPhone 17 Pro Max` (440×956)**; screenshot reveal, viewer and active set table.
- Use `simulateSafeAreas()` and `checkLayout()` from `tests/helpers/layout.ts`; assert reachable CTA, no overlap/horizontal scroll, 48-point targets and 130% text.
- Test reduced motion and rapid Back/forward; use `tests/helpers/kill.ts` for persisted generated-workout recovery.
- Mark core flows `@matrix`; update `tests/helpers/planSeed.ts`, which currently hardcodes only the two existing plans.
- Builder validation: `npm run test`, `npm run typecheck`, build, targeted two-phone Playwright, then required matrix regression checks.

**6) Risks and conflicts with built code**

- Replacing only the reveal leaves generated sessions falling back to quick-workout targets; every static resolver consumer listed above needs coverage.
- Async plan reads inside Finish/Undo require expanded Dexie transaction scopes; preserve the mutation/journal protections recently built in 3.2b.
- `photoEligibility()` deliberately hides unaudited catalog photos; adding a pattern candidate must not silently make its photos eligible.
- Existing place logic collapses machines and omits bench requirements; using it as generator eligibility can falsely promise equipment compatibility.
- Existing tests in `src/lib/__tests__/plans-3.1.test.ts`, `tests/plans-3.1.spec.ts` and intake suites assume two plans/full-gym-only tiles; update those expectations.
- Preserve the original split JSON, Six Week’s 48 weekly prescriptions, current exercise IDs and machine-history separation.
- Full personal progression, automatic weighted warmups, deloads and race-run programming belong to later items; 3.5 should not imply those are implemented.