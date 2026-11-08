Found **12 findings in completed `[x]` scope**. All remain **STILL OPEN** from earlier reports; fixed findings are excluded. No files edited.

TypeScript passes. Four data-integrity failures were reproduced with production helpers and in-memory IndexedDB. Vitest could not execute because the read-only sandbox blocked its temporary directory. Playwright tests were reviewed statically.

1. **MAJOR — STILL OPEN: Workout controls have zero-height hit boxes.**  
   [SetTable.module.css:442](/Users/rabah/projects/anygym/src/screens/workout/SetTable.module.css:442), also lines 221 and 642.

   The actual check button, set-type button and inline Done button have `height: 0px`. The check’s child circle remains visible, concealing the collapsed button. The latest report records WebKit tap failures. **Physical finger behavior was not reverified**, but these controls violate the 48 pt requirement.

   **Exact fix:** Restore `height: 48px; min-height: 48px` on `.check`, `.checkDone`, `.setNo` and `.stepperDone`; retain the inner circle’s 46 px size.

   **Test:** In `tests/workout.spec.ts`, assert each actual button’s bounding box is at least 48 × 48, then use `.tap()` to log, change type and close the reps editor. Run without forced clicks or skips.

2. **MAJOR — STILL OPEN: Finish overlooks submitted lifts stored only in the durable draft mirror.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [rowLog.ts:302](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:302).

   When another tab’s journal write fails, its submitted lift can survive in `kv` while Finish sees only cached drafts and journal entries. **Reproduced:** durable pending **73 lb × 19**; `prepareFinish()` returned no failures; Finish saved only the earlier set. The screen subsequently clears drafts.

   **Exact fix:** Coordinate Log registration and Finish with the session lock. Inside Finish’s transaction, reconcile authoritative durable drafts against submission/cancellation receipts, reject unresolved submissions, and build the Undo snapshot from that merged state.

   **Test:** Add two isolated runtimes sharing IndexedDB. Fail B’s journal write while retaining its submitted draft durably; Finish from stale A must refuse. Restart, Retry, and require the lift exactly once.

3. **MAJOR — STILL OPEN: Lower revision numbers erase conflicting input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175).

   Fingerprints protect different payloads only when revisions match. Tabs allocate revisions independently. **Reproduced:** reconciling pending **73 lb × 19, revision 1** against committed **53 lb × 10, revision 5** removed the pending row entirely.

   **Exact fix:** Treat differing fingerprints as unresolved conflicts regardless of tab-local revision ordering. Use immutable operation identities and transactionally coordinated revisions; preserve conflicting input until resolved.

   **Blind spot/test:** [codex-duplicate-revision-receipts.test.ts:30](/Users/rabah/projects/anygym/src/screens/workout/__tests__/codex-duplicate-revision-receipts.test.ts:30) covers a newer pending revision. Add the inverse: committed revision 5 versus conflicting pending revision 1. After reconciliation and restart, require saved 53 × 10 and recoverable 73 × 19.

4. **MAJOR — STILL OPEN: Toast Retry lets “Finish without it” discard different values from those shown.**  
   [ExerciseView.tsx:313](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:313), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363).

   Toast Retry reuses the previous operation ID. Two tabs can therefore submit different values under identical ID, revision and operation. **Reproduced:** the sheet represented 17 reps; the journal subsequently held 19; discarding the sheet deleted that journal and allowed Finish.

   **Exact fix:** Give every toast Retry `op: newId()`. Include the submitted payload fingerprint in `ShownRow`, and transactionally compare it before discarding.

   **Blind spot/test:** [codex-3.2c.test.ts:48](/Users/rabah/projects/anygym/src/db/__tests__/codex-3.2c.test.ts:48) manually supplies different operation IDs, bypassing this UI path. Add the same-operation/different-payload interleaving; the 19-rep submission must remain retryable and block Finish.

5. **MAJOR — STILL OPEN: Backup can omit a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101).

   Held corrections are captured before the table snapshot. A correction retained in `kv` during that gap enters neither exported sets nor pending changes. **Reproduced:** backup contained old **53 lb × 10** and a later **83 lb** set, while omitting the source’s pending **73 lb × 19** correction.

   **Exact fix:** Read durable held corrections inside the same snapshot transaction as sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

   **Test:** Extend [codex-3.2b.test.ts:217](/Users/rabah/projects/anygym/src/db/__tests__/codex-3.2b.test.ts:217): gate export before its table snapshot, retain a new failed correction and commit another set, then resume. Restore into a fresh context; require the correction to remain retryable and save its exact values once.

6. **MAJOR — STILL OPEN, SPEC 13.3 test gap: Hard-kill coverage avoids in-flight writes.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85).

   The browser is killed after visible state settles and a database snapshot completes. Unit “relaunch” helpers reopen an in-memory database after awaited operations.

   **Counterexample:** settled drafts recover, but termination after receipt commit and before reconciliation loses another draft or permits duplication. **That browser defect is not established by this review.**

   **Exact test:** Add deterministic gates after journal commit, during the set transaction, and after receipt commit/before reconciliation. SIGKILL at each gate, reopen offline, Retry, and assert literal pending values plus exactly one committed lift. Include Undo acceptance/restoration boundaries.

7. **MAJOR — STILL OPEN, SPEC 13.3–13.4 test gap: Default acceptance excludes four devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47).

   Android projects and the 320-wide floor run only `@matrix` tests by default. Kill and monkey tests are excluded.

   **Counterexample:** a Chromium-only recovery regression cannot fail the normal suite because that recovery test is never selected. No specific Android defect is claimed.

   **Exact fix/test:** Make full-matrix execution the acceptance default; expose checkpoint subsets separately. Add a discovery check comparing applicable test IDs across all seven projects and explicitly requiring kill and monkey cases. Audit internal browser/device skips too.

8. **MAJOR — STILL OPEN, mocked interaction: Swipe coverage bypasses native touch panning.**  
   [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [polish-2.2d.spec.ts:44](/Users/rabah/projects/anygym/tests/polish-2.2d.spec.ts:44), [monkey.ts:183](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:183).

   Wheel “swipes” assign `scrollLeft`; row and monkey swipes use mouse dragging.

   **Counterexample:** incorrect `touch-action` causes native finger scrolling to cancel, while programmatic scrolling and mouse drags pass. A current physical-device failure is unconfirmed.

   **Exact test:** Add native touch drags using Chromium touch injection and an iOS simulator/device driver. Swipe wheels inside Weight/Edit sheets, confirm Done/Save preserves the displayed selection, and verify horizontal row deletion versus vertical scrolling without deletion.

9. **MAJOR — STILL OPEN, SPEC 13.3 test gap: The fresh-user walkthrough ends before logging and finishing.**  
   [intake-3.3.spec.ts:182](/Users/rabah/projects/anygym/tests/intake-3.3.spec.ts:182), [fixtures.ts:248](/Users/rabah/projects/anygym/tests/fixtures.ts:248).

   The measured walkthrough stops upon entering the workout. Other logger tests normally receive precompleted-intake flags or seeded profiles. Elapsed time is annotated without enforcing the stated budget.

   **Counterexample:** onboarding saves an incompatible goal/equipment combination that breaks the first exercise, while separate intake and seeded logger tests pass.

   **Exact test:** With `intake: 'fresh'` and no seeded records, complete onboarding, start its revealed day, choose the first weight, log three sets, Finish and reload. Assert exact saved sets and History, count every interaction, and enforce the onboarding duration budget.

10. **MINOR — STILL OPEN, implementation-repeating assertion: Backup completeness uses production’s whitelist.**  
    [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73), [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97).

    Both the snapshot and expected table names derive from `TABLE_NAMES`.

    **Counterexample:** removing a required category from that production list removes it from these expectations too, allowing an incomplete backup to pass.

    **Exact test:** Define an independent literal backup contract. Seed distinct sentinels in every required table plus drafts, rest, extra rows and pending changes; restore into a fresh database/storage context and assert each destination sentinel directly. Deliberately omitting any category must fail.

11. **MINOR — STILL OPEN, implementation-repeating assertion: Muscle-list expectations call the production filter.**  
    [muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13).

    The expected membership and rendered list both use `exercisesForRegion()`.

    **Counterexample:** the helper accidentally omits a valid quad exercise; both sides omit it and the equality passes. Existing sample assertions provide partial protection.

    **Exact test:** Add independently audited literal exercise-ID sets for representative muscles, including shoulder overrides and secondary-only exclusions. Compare rendered membership against those literals without calling the production filter. Removing an expected exercise must fail.

12. **MINOR — STILL OPEN, SPEC 13 accessibility gap: Newly mounted controls escape 130% text scaling.**  
    [codex-se-lifecycle.spec.ts:40](/Users/rabah/projects/anygym/tests/codex-se-lifecycle.spec.ts:40), [muscles-2.2c.spec.ts:180](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:180).

    These tests enlarge existing elements once, then mount the reps editor, rest controls or muscle-list sheet. Newly created text does not reliably receive the same enlargement.

    **Counterexample:** enlarged Done/rest labels overlap, but the interaction test passes with those labels at normal size. No current overlap is claimed.

    **Exact test:** Keep a scaling fixture active for newly mounted elements, preserving baseline sizes to prevent repeated scaling. First assert new labels compute to 1.3× baseline; then check clipping, overlap, 48 pt targets and current-set visibility before scrolling.