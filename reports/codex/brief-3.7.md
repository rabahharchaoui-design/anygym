Codex brief for PLAN item 3.7, written Nov 08 01:10 at commit 845b6d1. SPEC.md wins if they disagree; code may have moved since.

[PLAN.md:98](/Users/rabah/projects/anygym/PLAN.md:98) says **“3.7 Session 3 merge gate.”** This is a verification and release item. The current `s3-plans` checkout still has open 3.5b and 3.8 work, including uncommitted coach changes. No files changed; tests were not run.

**1) Applicable SPEC and acceptance checks**

- SPEC §§0–2: offline operation, honest data, exact weights, transactional writes, additive schema upgrades.
- §§3 and 19: gym presets, equipment, units, two-tap switching, and previewed swaps during workouts.
- §§4.3–4.5: exact demo matching and supported muscle mappings; unknown means an honest empty state.
- §§5.4–6: all load arithmetic stays in `src/lib/load.ts`; machine history stays gym-specific.
- §§7.2–7.5: movement ladders, generated prescriptions, curated plans, and time-budget trimming.
- §§9.1–9.3: backup/restore completeness, reviewed import mapping, preserved order, and import idempotency.
- §14: resumable intake, optional personal questions, truthful reveal, and persisted preferences.
- §15: coach recommendations, test sets, warmups, recovery, personal progression, and reversible changes.
- §§20–22: prefilled set rows, quick workouts, tap limits, safe ordering/pairs, and explicit plan changes.
- §§10, 13 and 23: safe areas, readable text, reachable controls, reduced motion, and visual evidence.
- Acceptance: all prerequisite Session 3 items pass their tester checks before marking 3.7 complete.
- Acceptance: full Vitest and Playwright suites pass; no unexplained console errors or promise rejections.
- Acceptance: run every UI spec across the seven-device matrix; default Android coverage is only a subset.
- Acceptance: fresh intake → workout → three logged sets → Finish works, including offline reload.
- Acceptance: existing history, pending writes, generated plans, swaps and plan position survive upgrades.
- Acceptance: independent UX review covers every Session 3 screen; unresolved blockers prevent merging.
- Acceptance: `reports/session-3.md` records results, captures, limitations and a five-minute phone checklist.

**2) Files to create or change**

- Create `tests/gate-s3.spec.ts`: cross-feature journeys joining intake, plans, gym switching, trimming and recovery.
- Create `src/db/__tests__/gate-s3.test.ts`: database integration checks across Session 3 operations.
- Extend `tests/monkey.spec.ts`: existing `SCREENS` covers seven older screens but misses new Session 3 flows.
- Add monkey setups for intake, quick concepts/deck, import review, Gyms and coach sheets.
- Extend `tests/matrix.spec.ts`: capture and audit those screens, including populated and honest empty states.
- Reuse `tests/fixtures.ts`; it supplies network isolation, intake mode and automatic error trapping.
- Reuse `simulateSafeAreas()`, `checkLayout()`, `checkControls()` and `checkActiveWorkout()` from `tests/helpers/layout.ts`.
- Reuse `dbAll()`, `dbPut()`, `usePlan()` and `seedFinished()` from `tests/workout-helpers.ts`.
- Use `tests/helpers/idb.ts` for held writes; use `tests/helpers/kill.ts` for actual process-kill recovery.
- Update `reports/session-3.md` with final commit/build identity, commands, counts, failures and reviewed artifacts.
- Store gate screenshots under `reports/shots/3.7/` and SE/Pro Max flow recordings under `reports/videos/`.
- Update `PLAN.md` only after gate completion; preserve separate completion records for 3.5b and 3.8.
- Append one truthful 3.7 line to `reports/test-now.md` after following its tap path on the deployed build.
- Production edits should fix demonstrated failures in their owning modules; no general refactor is required.
- Plan persistence owners: `saveGeneratedPlan()` / `loadSavedPlans()` in `src/db/savedPlans.ts`.
- Swap owners: `swapExercise()` / `undoSwap()` in `src/db/swaps.ts`.
- Gym owners: `previewGymSwitch()`, `switchGym()` / `undoGymSwitch()` in `src/db/gymSwitch.ts`.
- Trim owners: `setWorkoutTrim()` / `undoWorkoutTrim()` in `src/db/timeBudget.ts`.
- Composition owner: `src/screens/workout/useWorkout.ts`; check combined targets, trims, swaps and row adjustments there.

**3) Data model and Dexie migration**

- Item 3.7 itself needs no new tables, indexes or schema version.
- Current source already declares `SCHEMA_VERSION = 10` in `src/db/schema.ts` for unfinished 3.8.
- V10 adds `coachLifts`, `coachChanges`, `coachCards`, and compound-keyed `efforts`.
- Preserve shipped V1–V9 definitions; retain the existing V9→V10 test in `src/db/__tests__/coach-3.8.test.ts`.
- Session 3 otherwise uses additive fields: intake/dislikes, plan definitions, swaps, trims, quick targets and gym metadata.
- Verify `WorkoutSet.gymId` retains the original machine context after a mid-workout gym switch.
- Verify `Session.weekIndex`, `rowAdjust`, `swaps`, `trim` and `targets` survive backup and restoration.
- `src/lib/backup.ts` excludes coach tables from `TABLE_NAMES`, while profile coach settings are included.
- Before release, define coach restore behavior explicitly: preserve it consistently or reset derived state transactionally.
- Minimal current fix: include all four coach tables in `restoreReplace()`’s transaction and clear them during replacement.
- Adding optional outcome-learning fields needs no index migration; validate legacy rows with those fields absent.
- Any migration introduced by gate fixes must open the preceding schema and compare preserved records, including sets.

**4) Tricky edge cases and handling**

- Intake redo must retain history and existing gym edits; choosing a new plan must not rewrite an older definition.
- Generated plans must register after cold startup and restore through `loadSavedPlans()` before resolving their workouts.
- Unknown imported names retain their original identity and uncertainty; never attach a guessed demo or muscle map.
- Importing the same synthetic file twice must add nothing the second time, including after reviewed remapping.
- A gym switch followed immediately by Start must use the newly active gym without requiring reload.
- Mid-workout switching must leave logged sets intact and re-evaluate only the remaining work.
- If a workout changes after the switch preview, handle `SwitchStaleError` by rebuilding the preview.
- A swap/trim must not hide a journaled write, correction, or deleted set with an available Undo.
- Trim after swap must operate on original slots through `slotOf()`; restored exercises return to plan order.
- Logged exercises remain; impossible budgets show `fitWords()`’s honest shortest result.
- Changed pair counts must split unequal pairs; warmups and drops must not inflate completion or progression.
- Old Undo receipts must not overwrite newer work; exercise-specific coach Undo must preserve later targets.
- Cross-unit targets must be loadable in the active gym; use `load.ts`, including dumbbell each-hand semantics.
- Freshness requires dated, logged working sets and known muscles; missing history cannot establish recovery.
- A killed app must recover pending rows exactly once; a reload alone is insufficient evidence.
- During updates, `src/pwa.ts` must still defer reload for active workouts/runs and recheck immediately before reload.

**5) Tests to write, extend and run**

- Vitest gate integration: save a generated plan, reopen the database, register it, and resolve the same day/prescriptions.
- Vitest gate integration: swap → trim → Undo; assert sets unchanged, valid pairs and restored slot order.
- Vitest gate integration: switch gyms after logging; assert original set gym IDs and machine-history separation.
- Vitest migration extension: include generated definitions, trims, quick targets and pending recovery records in preserved data.
- Vitest backup regression: seed coach targets/cards/efforts, replace history, and assert no stale coach state survives.
- Vitest coach regression: recovery signals suppress both manual raises and `autoApply`.
- Vitest coach regression: an accepted lighter target remains active across subsequent Today evaluations.
- Vitest coach regression: two Hard sessions at the same load produce a plateau action even at top reps.
- Vitest coach regression: the automatic-change notification survives training the lift again until dismissed.
- Vitest learning regression: a missed raise remains learned after its workout leaves the retained history window.
- Retain `src/lib/__tests__/coach/synthetic-3.8.test.ts`: four synthetic users over twelve weeks, bounded/loadable adaptations.
- Extend quick-workout property tests after 3.5b lands: diversity, duration/counts, rotation and inclusive equipment-safe choices.
- Playwright fresh journey: explicitly use `test.use({ intake: 'fresh' })`; default fixtures bypass intake.
- Assert Main/Also persistence, reveal claims matching applied customization, and one session after double-tapping Start.
- Playwright integrated journey: generated plan → hotel switch → trim → log → offline reload → Finish → History.
- Assert rendered targets match persisted loads, sets exist once, and completion advances the plan correctly.
- Playwright quick journey: exercise removal names the removed move, changes the estimate, and Undo restores preferences/items.
- Playwright coach journey: real example → enable Auto level up → stored change → See changes → per-lift Undo.
- Playwright failure journey: hold a set write, attempt swap/trim/Finish, then release; input remains recoverable.
- Run new gate tests on WebKit `--project="iPhone SE"` and `--project="iPhone 17 Pro Max"`.
- At both sizes, test normal and 130% text, safe areas, nested sheets, keyboard-open forms and reduced motion.
- Assert no horizontal overflow, reachable primary actions, readable Undo, and visible active rows before scrolling.
- Keep `tests/tapcount.spec.ts`: plan squat ≤6 taps; weight change ≤3 extra; manual quick exercise/three sets ≤7.
- Keep existing Session 3 suites; update obsolete expectations only when requirements changed.
- Extend monkey coverage to 90 seconds per added screen; assert meaningful reactions and no stuck navigation.
- Run `npm run build`, `npm run test`, and `npm run test:coverage`; preserve configured coverage thresholds.
- Final UI gate: `PW_FULL_MATRIX=1 npx playwright test`; record retries and investigated flakes explicitly.

**6) Current risks, conflicts and release order**

- **Open prerequisites:** 3.5b and 3.8 precede 3.7 in the current queue; do not certify their partial implementations.
- **Requirement conflict:** 3.5b requests four richer concepts; SPEC §20.3 still says three, and §13.1 limits visible choices.
- Reconcile that wording before final acceptance; replace stale three-card tests with the agreed four-card behavior.
- **Duration conflict:** §14 allows about two minutes for intake; §13.3 still says under sixty seconds. Record both measurements.
- **Rest conflict:** §7.3’s muscle compound rest differs from §22; current generator follows §22, already noted in PLAN.
- **Coach recovery bug:** `src/lib/coach/today.ts:candidates()` can compute raises while higher-priority recovery cards exist.
- **Coach plateau bug:** `src/lib/coach/recovery.ts:plateauOf()` returns for top reps before evaluating `hardTwice`.
- **Coach notification bug:** “Leveled up” depends on current `weeklyLevelUp()` eligibility instead of persisted automatic changes.
- **Learning risk:** `src/lib/coach/outcome.ts:learnedScale()` reconstructs from retained history instead of durable resolved outcomes.
- **Restore bug:** `src/db/backup.ts:restoreReplace()` currently leaves excluded coach tables untouched.
- These five issues are documented in `reports/codex/3.8.md` and remain visible in the inspected source.
- **Quick feedback bug:** `QuickScreen.tsx:never()` omits the removed name when no replacement fits; see `reports/codex/ui-3.5a.md`.
- **Concurrency risk:** PLAN 3.2c explicitly leaves transactional revision allocation across tabs unresolved; test real shared-context tabs.
- **Evidence risk:** `reports/session-3.md` contains stale intermediate failures and stale-preview incidents; produce fresh gate evidence.
- Give the UX critic every touched screen, including coach/quick/gyms/import sheets; require SE and Pro Max recordings.
- Follow `PROMPT.md`’s gate: fix blockers, recheck, then merge without fast-forward, smoke-test master and deploy.
- Verify the tested build is actually served; confirm Pages success, run `npm run test:live`, then publish the report/test-now evidence.
- Phone-only checks remain explicit: Home Screen safe areas, keyboard behavior, edge gestures and haptics; do not claim browser emulation proves them.