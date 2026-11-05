Codex brief for PLAN item 3.4, written Nov 05 16:34 at commit 62f556a. SPEC.md wins if they disagree; code may have moved since.

Read-only review completed; no files edited or tests run. Target: [PLAN.md:85](/Users/rabah/projects/anygym/PLAN.md:85), “3.4 Movement pattern ladders and swap engine.”

**1) Applicable SPEC sections and acceptance checks**

- **7.2:** ship `data/patterns.json` covering all 17 named movement patterns, with ordered candidates and explicit equipment requirements.
- Patterns: squat, hinge, lunge, horizontal/vertical push, horizontal/vertical pull, chest isolation, lateral/rear delt, biceps, triceps, quads/hamstrings isolation, glutes, calves, core.
- Every candidate ID must exist in `data/catalog.json`; candidate order defines preference.
- Select the first supported candidate; manual Swap offers up to four supported alternatives, excluding the current exercise.
- Show a concrete reason such as “No barbell here”; distinguish equipment-driven swaps from voluntary replacements.
- **7.5:** starting a curated day at a gym missing equipment automatically replaces unavailable exercises and displays a small “Swapped” tag.
- Supported original exercises stay unchanged; “best first” must not silently replace an available curated exercise.
- **0, 4.2–4.4:** unknown equipment or movement classification produces an honest unresolved state, never an invented match or demonstration.
- **3:** use the actual `Gym.equipment` and dumbbell range, rather than assuming a gym’s preset still applies.
- **5.2–5.5:** replacement uses its own load input and bar/machine setup; numerical load calculations remain in `src/lib/load.ts`.
- **6:** replacement history belongs to that exercise; machines, cables and Smith remain gym-specific.
- **20.1–20.4, 21.1:** Swap belongs in the existing exercise ⋯ menu; preserve targets, pair position, rest behavior and ordinary logging tap counts.
- **2, 9.1–9.2:** session changes are transactional and survive reload, backup, restore and Finish → Undo.
- **13.1–13.5, 23:** plain labels, Undo, accessible sheets, 48-point targets, 130% text, reduced motion and visible current logging row.
- **19:** expose reusable adaptation logic for later gym switching; completing the gym-switching UI belongs to 3.9.
- Generator construction, exercise ordering and time trimming remain separate items: 3.5, 3.4a and 3.6.

**2) Files to create/change and implementation contents**

- **Create `data/patterns.json`:** canonical ladders, candidate metadata and explicit plan-exercise-to-pattern assignments.
- Suggested structure: `ladders: Record<Pattern, string[]>`, `exercises: Record<catalogId, CandidateMetadata>`, `planPatterns: Record<planExerciseId, Pattern>`.
- Candidate metadata needs equipment requirement alternatives, load type, optional bar identity, count mode and unilateral handling.
- Requirements must express AND/OR: dumbbell bench requires dumbbells AND either flat or adjustable bench.
- **Create `src/lib/patterns.ts`:** exported `Pattern`, requirement/candidate types and pure `validatePatterns()`.
- **Create `src/lib/swaps.ts`:** pure `supportsExercise()`, `swapAlternatives()` and `adaptWorkout()`; names here are proposed new APIs.
- Return structured results: supported, replacement, unknown requirements, unmapped pattern or no supported alternative.
- Evaluate support before ranking; preserve ladder order and remove duplicates deterministically.
- Accept excluded exercise IDs as an argument so later generator/intake integration can reuse the engine.
- **Create `src/data/patterns.ts`:** load committed JSON and resolve plan IDs through `EXERCISE_MAP` plus explicit overrides.
- Reuse an existing equivalent workout ID only when movement and implement are certain; otherwise retain the catalog ID.
- **Change `scripts/build-catalog.ts`:** feed canonical ladder IDs into existing `selectedCatalogIds()` and update report generation.
- Migrate consumers of `data/catalog-ladder.json`, including `src/lib/__tests__/catalog.test.ts`; remove the duplicate file once unused.
- **Change [src/db/workouts.ts](/Users/rabah/projects/anygym/src/db/workouts.ts):** adapt within `startPlanDay()` before committing the new session.
- Add `db.gyms` to that transaction and read the requested gym there; preserve the existing “return active session” behavior.
- Add transactional `swapExercise()` with expected-current-ID checking, active-session validation and durable swap metadata.
- **Change [src/lib/planWorkout.ts](/Users/rabah/projects/anygym/src/lib/planWorkout.ts):** add shared resolution of original plan slots, replacements and completed earlier work.
- Preserve `dayWorkout()` as the unmodified curated prescription; adapt its output instead of modifying shipped plan JSON.
- **Change [src/screens/workout/useWorkout.ts](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts):** resolve replacement entries before `orderEntries()`/`adjustEntries()`.
- Update `nameOf()`, `loadTypeOf()` and `barOf()` to support candidate catalog IDs while preserving user settings precedence.
- **Change `src/screens/workout/ExerciseMenu.tsx`:** add `'swap'` to `MenuAction` and a working “Swap exercise” row.
- **Create `src/screens/workout/SwapSheet.tsx` and `SwapSheet.module.css`:** existing `Sheet`, up to four alternatives, reason, empty state and pending/error feedback.
- **Change `src/screens/workout/WorkoutScreen.tsx`:** handle Swap in `menuAction()`, track the mutation through `logQueue.mutate()`, navigate after commit and offer guarded Undo.
- **Change `DayList.tsx`, `ExerciseView.tsx` and their CSS:** display “Swapped”; expose original name/reason without crowding the set table.
- **Change `src/data/exerciseInfo.ts`:** add workout-ID dispatch helpers using existing `infoForPlan()`/`infoForCatalog()` and photo eligibility.
- Replace plan-only demo lookups in `DayList.tsx` and `ExerciseView.tsx`; never synthesize an exact photo match.
- **Change `src/db/workouts.ts::planProgress()` and `FinishScreen.tsx`:** consume the same slot-aware progress calculation.
- **Review `src/screens/history/historyWords.ts::exerciseNamer()`:** its existing `exerciseNameOf()` fallback already handles catalog names; preserve original and replacement names.
- Audit Remove/Reorder/Undo paths in `WorkoutScreen.tsx` so swap metadata stays consistent with `session.exerciseIds`.

**3) Data model and Dexie changes**

- Recommended additive field in [src/db/types.ts](/Users/rabah/projects/anygym/src/db/types.ts): `Session.swaps?: Record<string, SessionSwap>`.
- Key each record by the original plan slot’s exercise ID; quick workouts use the exercise being replaced as the initial slot.
- `SessionSwap` should contain `currentId`, ordered unique `memberIds`, `pattern`, `reason` and `automatic`.
- Include the source ID in `memberIds`; retain previous replacements so already logged work remains attributable to the slot.
- Store actual performed IDs in sets, submissions and journal rows; never relabel old sets as the replacement.
- Keep actual exercise IDs in `Session.exerciseIds`; retain earlier members with logged work and insert the replacement at the source position.
- Derive targets from the original slot and its adjustment history; earlier completed work reduces the replacement’s remaining rows.
- Count one original slot for “lifts finished”; cap combined member work at that slot’s target for day completion.
- This grouping is proposed behavior for swaps after logging; SPEC does not define that case explicitly.
- Current [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts) is **version 9**; optional, unindexed session metadata needs no schema bump.
- Old sessions without `swaps` must retain their current behavior; do not backfill or rewrite historical sets.
- Extend `src/lib/backup.ts::RECORD_CHECKS.sessions` to validate the new nested shape and reject malformed membership.
- Verify both `src/db/backup.ts::restoreMerge()` and `restoreReplace()` preserve it; no new backup table is needed.
- If implementation introduces a store/index instead, append v10 and prove v9 → v10 preserves every saved record.

**4) Tricky edge cases and handling**

- **Catalog equipment is incomplete:** `Pullups` says “body only” but requires `pull_up_bar`; dips need `dip_station`.
- Bench, incline bench, preacher support and machine identity need explicit requirements; broad “machine” or “cable” labels are insufficient.
- **Unrepresented equipment:** trap bars, ab rollers and some specialized machines lack dedicated `EquipmentId`s; mark unknown/unavailable rather than infer ownership.
- **Unknown weight ≠ missing equipment:** an available Smith with unknown bar weight remains eligible and uses the existing first-use prompt.
- **Dumbbell limits:** validate range configuration, but never infer a safe replacement weight from the original barbell total.
- **No candidate:** retain an honest unresolved row with a next action; do not substitute another pattern merely to make adaptation succeed.
- **Count compatibility:** do not replace a timed plank with rep-based crunches while carrying seconds across.
- Prefer candidates matching the source count mode; otherwise report no compatible alternative until a deliberate target-conversion policy exists.
- **Unilateral replacement:** use candidate `eachSide` metadata and rebuild target text; do not blindly inherit the original movement’s wording.
- Preserve set count, compatible rep/hold prescription, rest and pair position; remove source-specific technique cues from the replacement.
- **Already logged sets:** retain them unchanged and visibly accessible; only remaining planned work moves to the replacement.
- **Duplicate destination:** exclude IDs already used by another slot, including proven aliases; select the next supported candidate.
- If exclusions exhaust a ladder, report the conflict rather than merging two prescriptions into one exercise-keyed table.
- **Pending writes:** settle in-flight logs, inspect failed journals/mutations and unresolved deletes, then revalidate inside the swap transaction.
- Do not hide a failed source log behind the replacement; surface recovery before committing the swap.
- **Drafts:** do not copy source weight, running hold or submitted draft IDs to the replacement; retain source drafts for recovery/Undo.
- Undo must compare the expected swap state and refuse to overwrite later replacement work; swapping back after logging follows normal preserved-history behavior.
- **Reload/retry:** stored swaps are authoritative; do not rerun adaptation whenever `useWorkout()` renders.
- Repeated swaps, removed rows and restored sets must resolve membership once, without double-counting adjustment values.

**5) Tests to write**

- **`src/lib/__tests__/patterns-3.4.test.ts`:** exactly 17 patterns, valid IDs, unique candidates, valid requirement/load/count metadata and valid source assignments.
- Assert the intended horizontal-push preference order explicitly; the existing squat ladder currently starts with bodyweight.
- **`src/lib/__tests__/swaps-3.4.test.ts`:** table-driven support checks for full, hotel, dumbbells-only, bands and empty equipment.
- Assert bench dependencies, pull-up/dip equipment, Smith availability, specific machines and unknown special equipment.
- Assert first supported selection, supported-original preservation, four-result limit, exclusion of current/duplicate IDs and deterministic reasons.
- Assert missing-pattern, unknown-equipment, exhausted-ladder and rep/seconds incompatibility results are honest.
- **`src/lib/__tests__/planWorkout-3.4.test.ts`:** targets, pair metadata, warmup status, weekly prescriptions and replacement-specific cues survive correctly.
- Assert two completed source sets plus remaining replacement sets count toward one slot and one original denominator.
- Assert + Add set, Remove set, delete/Undo and repeated swaps do not inflate planned work.
- **`src/db/__tests__/swaps-3.4.test.ts`:** `startPlanDay()` adapts atomically, double starts return one session and existing active sessions remain untouched.
- Assert swap failure rolls back; stale/concurrent swaps cannot overwrite each other or a finished workout.
- Assert old sets/receipts remain identical, logged replacement sets use its ID and Finish advances at the existing 60% threshold.
- Assert Finish → Undo and database close/reopen preserve swap state and remaining targets.
- **Backup tests:** round-trip active/finished swaps through export, merge and replace; reject malformed metadata; accept legacy backups.
- **Photo/history regression tests:** unaudited candidates have no public photos; replacement progression excludes the source lift and respects gym-specific history.
- **`tests/swaps-3.4.spec.ts`:** import `test`/`expect` from `./fixtures`; use `dbPut()`, `dbAll()` and `watchErrors()`.
- On **iPhone SE** and **iPhone 17 Pro Max**, start a curated day with missing equipment; assert replacement, reason, “Swapped” tag and correct picker.
- Exercise manual Swap in plan and Quick workouts; cancel, choose, double-tap, Undo, reload and navigate back/forward.
- Log source work, swap, log replacement work, finish and inspect History; assert both actual lifts and correct plan completion.
- Cover offline reload, no alternatives, unknown requirements, long names, kg/lb, 130% text and reduced motion.
- Use `simulateSafeAreas()`, `checkLayout()`, `checkControls()` and `checkActiveWorkout()`; assert zero console/page errors.
- Capture sheet and post-swap screenshots on both requested phones; mark core cases `@matrix` for the configured wider device matrix.
- Builder checks: `npm run test`, `npm run build`, then targeted Playwright projects `--project="iPhone SE" --project="iPhone 17 Pro Max"`.

**6) Risks and conflicts with built code**

- The working tree contains unfinished **3.3** changes, including intake persistence, `planPick.ts`, `load.ts`, screens and tests; PLAN still marks 3.3 incomplete.
- Build against that finalized baseline; do not overwrite its edits or mix its completion into 3.4.
- Existing `data/catalog-ladder.json` already supplies **17 patterns / 122 catalog references**, all present in the **138-exercise catalog**; reuse these assets.
- It is a catalog-selection list, not yet reviewed ranking or equipment-support data.
- `src/lib/picker.ts::gymSupports()` is too coarse: it treats timed/bodyweight as universally available and stack loads as cable-dependent.
- `src/lib/places.ts::exerciseNeed()` and intake `needsCovered()` also describe broad categories; neither can authorize automatic swaps.
- `useWorkout()` currently falls back to `quickEntry()` for an unfamiliar replacement ID, losing curated targets; shared resolution is essential.
- Finish currently rebuilds the original `dayWorkout()` independently; changing only the live screen would undercount swapped work and misadvance the plan.
- `photoEligibility()` deliberately limits public demos to audited mappings; do not relax it to make ladder candidates look complete.
- `fittingPlans()` still rejects equipment-incompatible plans before workout start; retain that conservative intake behavior unless adaptation-aware eligibility is explicitly included and tested.
- Broadening place tiles/intake recommendations requires evaluating every day, including unmapped warmups and finishers; one successfully adapted day proves insufficient.
- The largest implementation risk is interaction with durable logs, drafts, deletion Undo and Finish—not the ranking function. Keep their identities intact.