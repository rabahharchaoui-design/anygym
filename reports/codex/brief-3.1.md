Codex brief for PLAN item 3.1, written Nov 01 03:36 at commit e05ce2e. SPEC.md wins if they disagree; code may have moved since.

Item [3.1, PLAN.md:70](/Users/rabah/projects/anygym/PLAN.md:70) is mostly built. The main remaining UI gap is catalog thumbnails in the workout day list; exercise-view demos already work.
No files changed. This brief is based on source inspection; tests were not run.

**1) Applicable SPEC sections and acceptance checks**

- SPEC 0, 2: preserve saved workouts, transactional writes, offline operation, and honest unknown states.
- SPEC 4.1–4.3: resolve plan exercises through `data/exercise-map.json`; never infer a demo from a similar name.
- SPEC 4.3: `exact` shows the mapped movement; `variant` shows its difference cue; `none` shows no exercise photos.
- SPEC 4.4–4.5: reuse the existing demo, muscle map, sourced cues, and full exercise sheet.
- SPEC 6, especially rule 6: weekly prescriptions control sets/reps; the existing progression engine supplies load suggestions.
- SPEC 7.5: ship the two existing JSON plans, preserving their exercise order, notes, pairs, and prescriptions.
- SPEC 8.1, 8.6: retain Plans → viewer → “Use this plan” → Today → Start.
- SPEC 20.1: day-list rows show catalog thumbnails when available, sets/reps, stated rest, progress, and pair rails.
- SPEC 20.2, 21.1: opening a row retains the compact demo, LAST TIME, prefilled rows, one-tap checks, and rest behavior.
- SPEC 20.4: seeded squat flow remains at most six taps: Start, exercise row, four checks.
- SPEC 13.3–13.5: no console errors, duplicate sessions, horizontal overflow, or scrolling needed to reach the current set on SE.
- SPEC 10, 23: use existing tokens, navigation, sheets, reduced-motion behavior, and safe-area handling.
- Acceptance: both plans start the correct ordered day, and reload preserves the session’s original week and pending rows.
- Acceptance: all six weekly table columns match JSON, including irregular increments and interval rounds.
- Acceptance: browsing a different week changes the preview only; it must not change the active plan pointer.

**2) Files to create/change and existing functions to reuse**

- [src/data/plans.ts](/Users/rabah/projects/anygym/src/data/plans.ts): keep `PLANS`, `planById()`, and `resolvePlanExercise()` as the curated-plan entry points.
- Existing files are `data/plans/five-day-split.json` and `data/plans/six-week-volume.json`; do not recreate or rename them.
- Keep the public title “Classic 5 Day Split”; the older OhRabah wording in item 3.1 is stale.
- [src/screens/workout/DayList.tsx](/Users/rabah/projects/anygym/src/screens/workout/DayList.tsx): replace unconditional `Thumb` rendering with mapped-photo-or-placeholder rendering.
- Resolve each row using `infoForPlan(e.exerciseId, notes)`; retain `data-row`, row labels, progress indicators, and existing click handling.
- Preserve the row’s `ex-hero` transition assignment; only the selected thumbnail should own that transition name.
- Create `src/components/exercise/ExerciseThumb.tsx`, exporting proposed `ExerciseThumb()`: a static start-photo tile with WebP/JPG sources and a supplied fallback.
- Create its CSS module: reserve dimensions before loading, support the existing 64px row footprint, and avoid image-driven layout shifts.
- Prefer static list thumbnails; dozens of simultaneous two-photo animations add work without helping exercise selection.
- [src/data/exerciseInfo.ts](/Users/rabah/projects/anygym/src/data/exerciseInfo.ts): reuse `infoForPlan()` and `assetUrl()`; add no parallel mapping implementation.
- [src/screens/workout/ExerciseView.tsx](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx): retain existing `FormDemo`, `firstLine()`, and `ExerciseSheet` wiring.
- `src/components/exercise/FormDemo.tsx`: retain the existing full demo and compact hero behavior; change only if shared image-failure handling requires it.
- `src/screens/plans/PlanViewer.tsx`, `PlanDayList.tsx`, `Plans.module.css`: the viewer, week buttons, notes, and pair grouping already exist.
- No second viewer or new Start route is needed; `TodayScreen.startDay()` already calls `startPlanDay()`.
- [src/lib/plans.ts](/Users/rabah/projects/anygym/src/lib/plans.ts): retain `normalizePlan()`, `itemTarget()`, `itemLine()`, and `estimateDayMinutes()`.
- [src/lib/planWorkout.ts](/Users/rabah/projects/anygym/src/lib/planWorkout.ts): retain `dayWorkout()`, `nextCurrent()`, and `restAfter()` for prescriptions and pairs.
- `src/screens/workout/useWorkout.ts`: retain `session.weekIndex` and the `progressionOf()` call passing `entry.prescription`.
- Change `data/exercise-map.json` only for evidence-backed corrections; update cues, muscle overrides, assets, and `CATALOG_REPORT.md` together when affected.
- Existing generation commands are `npm run plan-exercises` and `npm run catalog`; the catalog-report generation lives in `scripts/build-catalog.ts`.

**3) Data model and Dexie migration**

- No Dexie migration is needed for thumbnail wiring or completing existing curated-plan integration.
- Current schema is v9 in [src/db/schema.ts](/Users/rabah/projects/anygym/src/db/schema.ts); leave shipped schema versions untouched.
- Curated plan definitions are static imports; do not populate the legacy `plans`/`planDays` tables with duplicate definitions.
- `PlanState` already stores `planId`, `weekIndex`, `nextDayIndex`, `doneDays`, and partial completion.
- `Session` already snapshots `planId`, `dayId`, `weekIndex`, and ordered `exerciseIds`.
- Keep persisted exercise IDs as current plan slugs, such as `barbell-back-squat`; catalog IDs are lookup targets for this item.
- Replacing saved slugs with upstream IDs would affect sets, settings, drafts, history, journals, and import compatibility.
- Do not store demo paths, catalog objects, or preview-week selections in session records.
- If scope expands into identity migration, require an additive v10 migration, backup compatibility changes, and v9-data preservation tests first.

**4) Tricky edge cases and handling**

- The map currently contains 37 `exact`, eight `variant`, and 41 `none` entries, including three finishers; missing demos are intentional.
- Preserve the 2.5 audit downgrades for `elbow-plank`, `plank`, and `narrow-grip-lat-pulldown`.
- A known load picker does not prove a photo match: `Bicep Curl` has a dumbbell override but an intentionally ambiguous demo mapping.
- For `none`, retain the neutral equipment/initials tile and “Demo coming soon” sheet with plan notes only.
- Five load types remain unknown: `28-method-squat`, `forearm-finger-roll`, `single-leg-romanian-deadlift`, `wide-lunge`, and `wrist-twist`.
- Resolve those only with authoritative implement information; otherwise preserve the existing ask-once behavior and record the SPEC 20.1 exception.
- Six Week `Plank` and `Spider Plank` prescribe reps; `planItemLoadType()` must continue overriding the timed-name rule.
- `30 Second Interval Sprint` uses 30-second efforts and 10→20 rounds; rounds must never become reps or minutes.
- Keep unusual table values exactly: Deadlift ends at 14 reps, Hip Thrust at 18, and single-leg RDL contains repeated values.
- Leg Extension/Leg Curl explicitly state ten-second rest in notes; do not replace that with generic coaching defaults.
- Pairs alternate A1→B1→rest→A2→B2; warmup pairs remain warmups and do not inflate working-set progression.
- Starting another day during an active workout must return the existing session through `startPlanDay()`, preserving its gym and week.
- Changing the active plan or preview week must not rebuild an already-running workout from the new selection.
- Photos are cached on first view, not precached; cached demos must work offline, and uncached ones need a clean unavailable state.

**5) Tests to write or extend**

- Extend `src/lib/__tests__/catalog.test.ts`: every plan slug and finisher has exactly one valid map entry.
- Assert every non-`none` target exists and has both image frames; every `variant` has its difference cue.
- Extend `src/lib/__tests__/exerciseInfo.test.ts`: missing mappings/catalog records produce no demo or muscles; plan notes survive.
- Add regression assertions protecting the three 2.5 audit downgrades from accidental photo restoration.
- Extend `src/lib/__tests__/plans.test.ts`: compare every normalized weekly row against its source JSON, across all days and six weeks.
- Assert exact preservation of sets, reps, rounds, each-side flags, notes, warmups, pair membership, and finishers.
- Extend `src/lib/__tests__/planWorkout.test.ts`: each week produces the prescribed row counts and `prescription` values.
- Assert pair alternation and rest timing, including warmup pairs and the working incline-press pair.
- Extend `src/lib/__tests__/progression.test.ts`: weekly reps/count override targets while load increase, reset, and hold rules still apply.
- Cover no-history weekly exercises: prescription is present, but no invented starting weight appears.
- Extend `src/db/__tests__/planState.test.ts`: selected week is captured at start and remains unchanged after later pointer changes.
- Assert final-day completion advances one week, week six clamps, and Finish→Undo restores the exact prior position.
- Reuse existing tests for below-60% repetition and partial completion; avoid introducing another completion policy.
- Create `tests/curated-plans-3.1.spec.ts`, importing `test` and `expect` from `./fixtures`.
- Test both plans through viewer→Use→Today→Start; assert session identity, ordered exercises, targets, notes, and pair groups.
- Test mapped day-list thumbnails and correct image URLs under `/anygym/ex/`; verify images actually decode.
- Test an exact exercise, squat variant cue, and `none` exercise through row→exercise view→full form sheet.
- Extend `tests/plans.spec.ts` for week-preview isolation and week-one/week-six prescriptions in real workout rows.
- Update `tests/verify-1.10.spec.ts`: its blanket assertion that the day list contains zero images becomes invalid.
- Retain targeted no-image assertions for `none` exercises; do not remove the honesty checks wholesale.
- Reuse `seedFinished()`, `seedWorkingSets()`, and database helpers; retain `tests/tapcount.spec.ts`’s six-tap squat check.
- Add double-Start, reload-with-draft, active-plan-switch, and cached-demo-offline regressions.
- Run the new UI suite in WebKit projects `"iPhone SE"` and `"iPhone 17 Pro Max"`; SE means 375×667 here.
- Use `checkActiveWorkout()` before scrolling; verify current row/check remain uncovered during rest and after closing form sheets.
- Check 130% text, long names, reduced motion, safe areas, and no horizontal overflow; tag core flows `@matrix`.
- Record before/after screenshots and flow videos on SE and Pro Max under `reports/shots/3.1/` and `reports/videos/`.
- Builder validation: `npm run test`, `npm run build`, targeted two-phone Playwright, then the required broader device matrix.

**6) Risks and conflicts with already-built code**

- Sessions 1.10 and 2.3 already implement most requirements; rebuilding those flows risks regressions in durable logging and Finish/Undo.
- PLAN’s old plan name conflicts with SPEC 7.5/22 and the v5 rename migration; retain `five-day-split`.
- “Catalog mapping” must not silently become persisted-ID replacement; PLAN 3.2 separately addresses imported-exercise remapping.
- SPEC 20.1’s no-load-question requirement conflicts with five genuinely unresolved exercises; guessing would violate SPEC 0/4.3.
- Some existing override reasons assume an implement; do not use those assumptions as evidence for new demo mappings.
- `progress()` compares history against the current rep range; rising weekly targets can look like consecutive misses. Reproduce and document before changing semantics.
- Current week advancement follows the final day and completion threshold, rather than requiring all earlier days completed; preserve that established behavior.
- SPEC 0’s broad offline promise conflicts with the explicit 2.3 decision to cache photos only after viewing; disclose this limitation in acceptance evidence.
- Curated orders, rests, and intentional pairs stay as written; coach tuning belongs to 3.4a, swaps to 3.4, and generated plans to 3.5.
- Session 2’s merge gate and several real-device checks remain pending in PLAN; source inspection does not establish their runtime status.