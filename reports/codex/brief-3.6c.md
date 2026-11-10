Codex brief for PLAN item 3.6c, written Nov 11 00:24 at commit cac4473e. SPEC.md wins if they disagree; code may have moved since.

**3.6c is an audit and fix-queue task.** [PLAN.md:105](/Users/rabah/projects/anygym/PLAN.md:105) requires the `fable-auditor`, a ranked report, and follow-up items before the Session 3 merge gate.
Baseline inspected: branch `s3-plans`, HEAD `cac4473e93c95834ee7ba597ba282661e2f8d053`.
No files edited; no builds or tests executed for this brief.

**1) Applicable SPEC sections and acceptance checks**

- SPEC 0: verify honest data, exact numbers, offline operation, uncluttered screens, and preservation of saved workouts.
- SPEC 1: audit the production build under `/anygym/`, hash routing, installation assets, and update behavior.
- SPEC 2: inspect transaction boundaries and recovery paths; every submitted set must remain saved or recoverable.
- SPEC 3 and 19: exercise equipment, units, machine settings, gym switching, and switch Undo must remain gym-specific.
- SPEC 4.3–4.5: demos match the exact movement and implement; unknown demos and muscles produce honest empty states.
- SPEC 5.2–5.6: inspect every load input; rendered plates, displayed totals, collars, and stored loads agree.
- SPEC 6: machine history stays gym-specific; free-weight history travels; conversions affect suggestions without rewriting history.
- SPEC 7.2–7.5 and 22: verify swaps, prescriptions, ordering, pairing, time estimates, and preservation of curated plans.
- SPEC 8–10 and 14: walk intake, Today, plans, workouts, finish, History, Settings, backup/import, and owner Review.
- SPEC 13.1–13.5: plain language, reachable controls, zero unexpected errors, recovery, responsive layouts, and active-set visibility.
- SPEC 15: inspect first-time targets, warm-ups, effort answers, coach priority, progression, and per-lift Undo.
- SPEC 20–21: verify prefilled rows, work-set Last time alignment, automatic navigation, rest behavior, and finish totals.
- SPEC 20.4 acceptance: four target squat sets take ≤6 taps; changing weight adds ≤3; manual quick workout takes ≤7.
- SPEC 23: inspect shared motion, reduced motion, navigation, sheets, and SE/17 Pro Max recordings.
- SPEC 24: verify report redaction, offline queuing, crash preference, and separation from workout data.
- Audit acceptance: examine every implemented screen as a fresh user and a returning traveler; record untested states explicitly.
- Deliver ≤25 ranked findings, each tagged BLOCKER/MAJOR/POLISH with evidence, user impact, specific fix, and S/M/L size.
- End the report with the five highest-impact improvements; map every BLOCKER/MAJOR to a numbered follow-up.
- Route flagship-screen fixes to the designer, other fixes/tests to the builder; consolidate POLISH into `3.6z`.
- Do not begin `3.7` with an open BLOCKER.

**2) Files to create/change and source entry points**

- Create `reports/audit-fable-2026-11-11.md` when the audit runs that day; otherwise use its actual execution date.
- Include audited SHA, dirty-file list, build command, device/browser profiles, fixture descriptions, and executed test results.
- Give findings stable IDs such as `F01`; include reproduction steps, expected/actual behavior, source function, evidence, and verification.
- Change `PLAN.md`: insert `3.6d`, `3.6e`, etc. before `3.7`, referencing report IDs, assignee, scope, and acceptance tests.
- Add one `3.6z` item for POLISH; mark `3.6c` complete only after the report and queue mapping exist.
- Store synthetic screenshots under `reports/shots/audit-fable-<date>/`; put flow recordings under `reports/videos/`.
- Use [.claude/agents/fable-auditor.md](/Users/rabah/projects/anygym/.claude/agents/fable-auditor.md): it reviews code and the running app and writes one report.
- Its `model: inherit` relies on the orchestrator’s model; `run-overnight.sh` currently selects `claude-fable-5-2`.
- No production-source changes belong in the audit item; assign any demonstrated defect to its follow-up.
- Route inventory: `src/App.tsx`, `App()` defines public screens, workout routes, owner Review, and gated developer tools.
- Intake: inspect `src/screens/intake/IntakeScreen.tsx`, `IntakeScreen()`, and `src/screens/intake/Reveal.tsx`, `Reveal()`.
- Today: inspect `src/screens/TodayScreen.tsx`, `TodayScreen()`, including `startPlanDay()`, `applyLighterWeek()`, and `applyNextStart()`.
- Quick workout: inspect `src/screens/quick/QuickScreen.tsx`, `QuickScreen()`, and `src/screens/quick/Deck.tsx`.
- Trace generation through `src/lib/quick.ts`: `buildIdeas()`, `distinctCards()`, `fitPlanDay()`, `safePairs()`, and `nextSwap()`.
- Trace atomic starts through `src/db/quick.ts`, `startBuilt()`; inspect active-gym input in `src/screens/quick/quickInput.ts`, `baseInput()`.
- Logging: inspect `src/screens/workout/WorkoutScreen.tsx`, `WorkoutScreen()`, and `src/screens/workout/ExerciseView.tsx`.
- Trace `src/screens/workout/rowLog.ts`: `submitRow()`, `reconcileSession()`, `retryFailed()`, `discardFailed()`, and `prepareFinish()`.
- Persistence: inspect `src/db/workouts.ts`, `logSet()`, `finishWorkout()`, and `reopenWorkoutWithPending()`.
- Corrections: inspect `src/db/mutations.ts`, `saveMutation()` and `retryMutations()`; inspect `src/lib/setTable.ts`, `reconcileRows()`.
- Gym changes: inspect `src/db/gymSwitch.ts`, `switchGym()`/`undoGymSwitch()`, and `src/db/equipment.ts`, `setGymUnit()`.
- Time/order: inspect `src/lib/plans.ts`, `estimateDayMinutes()`; `src/lib/timeBudget.ts`, `trimDay()`/`applyTrim()`; `src/lib/order.ts`, `orderUnits()`/`canPair()`.
- Demo eligibility: inspect `src/data/exerciseInfo.ts`, `photoEligibility()`/`demoFor()`, and `src/data/quick.ts`’s `usable` predicate.
- Recovery/export: inspect `src/db/backup.ts`, `exportBackup()`, `restoreMerge()`, and `restoreReplace()`.
- Finish/Review: inspect `src/screens/workout/FinishScreen.tsx`, `FinishScreen()`, and `src/screens/review/ReviewScreen.tsx`, `ReviewScreen()`.
- Shared behavior: inspect `src/ui/Sheet.tsx`, `Sheet()`, and `src/lib/pwaUpdate.ts`, `applyUpdate()`/`reloadWhenIdle()`.

**3) Data model and Dexie migrations**

- None required for `3.6c`; findings and queue ownership belong in Markdown.
- Current `src/db/schema.ts`: `AnyGymDB`, `SCHEMA_VERSION = 10`, with additive versions 1–10.
- Exercises are shipped JSON, not a Dexie exercises table; do not introduce catalog storage for this audit.
- Audit sessions/sets together with `submissions`, `journal`, `tombstones`, and durable `kv` recovery evidence.
- A count-only comparison is insufficient: verify IDs, payloads, ordering, gym stamps, and pending operations.
- Current coach tables are `coachLifts`, `coachChanges`, `coachCards`, and `efforts`.
- `src/db/backup.ts` deliberately excludes those coach tables from backup and clears them during replace restore.
- Record that behavior against SPEC 9.1’s “everything” requirement; do not silently change the backup contract.
- Any follow-up needing indexes/tables must append a migration and update `SCHEMA_VERSION`; preserve shipped schemas.
- Extend `src/db/__tests__/migration.test.ts` from the actual preceding version, asserting every original set and load survives reopening.
- Update backup validation/restore only when a follow-up changes persisted data; assess `src/lib/backup.ts` alongside the DB implementation.

**4) Tricky edge cases and handling**

- Fresh-user tests must use `test.use({ intake: 'fresh' })`; `tests/fixtures.ts` otherwise bypasses intake by default.
- Audit full gym, hotel, home, dumbbells-only, bodyweight, and outdoors with real equipment constraints and both units.
- Separate unavailable catalog coverage from generator defects; never solve sparse choices by permitting uncertain demos.
- Compare suggestions against logged work, not scheduled workouts; test empty, warm-up-only, imported, and future-dated history.
- Test unknown Smith/bar/machine starting weights; no guessed total or unusable coach target may appear.
- Double-tap Start, Apply, Log, Finish, and Undo; assert one durable result and no activation beneath a closing sheet.
- Interrupt writes at deterministic boundaries; reload-after-settlement does not establish hard-kill safety.
- Preserve exact submitted values after Retry failure, correction failure, deletion, gym changes, and restart.
- Exercise effort prompts must remain optional and must not delay the established completion return or hide the set table.
- Check warm-ups separately: Last time shows `–`, work-set numbering stays aligned, and normal lift rest does not start.
- Test trimming/swapping unequal pair counts; split invalid pairs and preserve already logged sets.
- Run 100% and 130% text checks after opening sheets and mounting new controls, before helpers scroll them into view.
- Treat simulated safe areas and pointer drags as limited evidence; record standalone iOS and native-touch checks separately.
- Distinguish confirmed failures, suspected defects, coverage gaps, and already scheduled work in the report.

**5) Tests to write and assertions**

- `3.6c` adds evidence and proposed regressions; commit each behavioral regression with its corresponding fix item.
- Use existing Vitest suites first; add a failing test only for a demonstrated defect or a specific uncovered invariant.
- Extend `src/db/__tests__/codex-3.2b.test.ts`: interrupt backup capture with a newly retained correction; restore its literal payload as retryable.
- Add `src/db/__tests__/audit-fable-retry.test.ts`: reject replacement journal and fallback writes during Retry.
- Assert the previous durable correction survives reopen, retains its exact values, and continues blocking Finish.
- Extend `src/db/__tests__/codex-cross-tab-submission-evidence.test.ts` if that finding is accepted into scope.
- Promote its `it.fails` cases when fixed: differing payloads survive reconciliation and unresolved durable submissions prevent Finish.
- Extend `src/db/__tests__/codex-3.2c.test.ts`: identical IDs/revisions/operations with different payloads cannot discard unseen input.
- Extend `src/lib/__tests__/timeBudget-3.6.test.ts`: trimming protects the first two compounds and splits invalid pairs.
- Extend `src/lib/__tests__/quick-3.5d.test.ts`: explicit fixtures prove beginner rules, recent-muscle exclusions, and feasible distinct choices.
- Reuse `src/db/__tests__/codex-built-workout-commit.test.ts`: failed trim/second swap leaves no partial session; Retry reproduces the chosen deck.
- Keep load/progression tests independent of UI arithmetic; expected totals must be literal or independently derived.
- Add `tests/audit-fable-3.6c.spec.ts` only for missing cross-screen acceptance coverage; import `test`/`expect` from `./fixtures`.
- Fresh flow: intake → reveal → Start → three work sets → Finish → History; assert exact saved values and one finished session.
- Traveler flow: switch to a kg hotel gym, inspect substitutions, log a set, Undo where valid; assert history retains its original identity.
- Layout flow: Today, quick cards/deck, active set, weight/Edit sheets, finish, History, and Settings at normal and 130% text.
- Use `simulateSafeAreas()`, `checkActiveWorkout()`, `checkLayout()`, `checkControls()`, and `matrixShot()` from `tests/helpers/layout.ts`.
- Assert current-set visibility before helper scrolling, no horizontal overflow, unobscured primary actions, and 48-point targets.
- Extend `tests/kill.spec.ts` using `tests/helpers/kill.ts`: gate persistence, `killHard()`, `relaunchOffline()`, Retry; assert exactly one committed submission.
- `tests/helpers/idb.ts` already provides `addIdbSeams()`, `holdNextSetWrite()`, and `releaseSetWrite()`; extend seams only where necessary.
- Reuse `tests/helpers/history-fixture.ts`, `seedHistory()`, for 104 weeks of synthetic history; assert usable navigation and correct selected-session contents.
- Rerun `tests/tapcount.spec.ts`, `tests/time-3.6.spec.ts`, `tests/quick-3.5d.spec.ts`, and coach regressions.
- Run new/affected specs on WebKit projects `"iPhone SE"` (375×667) and `"iPhone 17 Pro Max"` (440×956).
- The auditor also requests an iPhone 15 Pro walkthrough; the configured `"iPhone 15"` project is a different profile.
- Before gate: `npm run build`, `npm run test`, then `PW_FULL_MATRIX=1 npx playwright test`; retain failure traces and inspect screenshots.

**6) Risks and conflicts with built code**

- `3.5e` and `3.5f` precede `3.6c` and remain unchecked; audit their resulting build or explicitly mark this baseline provisional.
- Existing dirty changes include `PLAN.md`, `PROMPT.md`, `run-overnight.sh`, new agent definitions, and audit-related evidence; preserve them.
- `reports/codex/bughunt-1111-0011-tests.md` reports five saving defects plus test blind spots; revalidate and deduplicate against audit findings.
- That report’s probes are prior evidence; its Playwright and physical-iPhone scenarios were not executed.
- PLAN 3.8b explicitly deferred multi-tab variants; record that decision when triaging cross-tab findings instead of silently reversing it.
- `estimateDayMinutes()` sees plan blocks; coach auto-warm-ups are added separately. PLAN already acknowledges their omission from estimates.
- `workSetCount()` excludes warm-ups but includes drop sets; progression has different eligibility rules. Do not reuse it indiscriminately.
- Demo availability currently follows exercise-map eligibility plus `data/catalog-demos.json`; `reviewed` alone is not the suggestion gate.
- SPEC 4.1’s 120–180 catalog target conflicts with 3.5e’s roughly 400; record the requirement mismatch for resolution.
- SPEC 7.3 and 22 prescribe different compound rest defaults; identify affected behavior and resolve explicitly before changing expectations.
- SPEC 13 requires 48-point controls while 23 permits 44; use the stricter general acceptance threshold and flag specific exceptions.
- Playwright’s default Android/320 projects run only `@matrix`; a default green run does not prove full SPEC 13 coverage.
- `quietHarnessStyleNoise()` in `tests/fixtures.ts` broadly filters CSP-style messages; investigate before treating zero-console results as conclusive.
- `tests/helpers/quick.ts`, `swipe()`, uses mouse events; it cannot establish native iPhone gesture correctness.
- `src/screens/RunScreen.tsx`, `RunScreen()`, is a placeholder; GPS, passport, accounts, and later sessions are planned scope, not missing Session 3 implementations.
- The whole-build audit supplements the existing tester and ux-critic gates; it does not replace their verification.