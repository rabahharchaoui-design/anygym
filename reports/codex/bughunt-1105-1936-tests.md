Found **10 findings: 7 MAJOR, 3 MINOR** in completed `[x]` scope. Fixed earlier findings and unfinished 3.4 work are excluded. No files edited. Typecheck passed; in-memory probes reproduced the four product defects below. Full Vitest/Playwright suites and physical iPhone behavior were not run.

1. **MAJOR — NEW: Backup can revive a discarded failed Log.**  
   [src/db/backup.ts:55](/Users/rabah/projects/anygym/src/db/backup.ts:55), [src/db/backup.ts:59](/Users/rabah/projects/anygym/src/db/backup.ts:59)

   Export captures drafts before its database snapshot, but cancellation receipts are neither exported nor used to filter those captured drafts. Discard a failed Log between those reads: restoring the backup offers it as failed again, and Retry adds the discarded set. **Reproduced:** source had no set; destination saved the discarded **53 lb × 19**.

   **Exact fix:** Read cancellation receipts in the snapshot transaction and reconcile captured drafts against them. Exclude canceled submissions or carry validated cancellation receipts through restore.

   **Test to add:** Extend [codex-3.2b.test.ts:216](/Users/rabah/projects/anygym/src/db/__tests__/codex-3.2b.test.ts:216). Capture failed draft A, gate export before its table snapshot, discard A, then resume. Restore into a separate database/storage context. Assert A is never offered as failed and Retry creates no set. Existing coverage checks superseded corrections, rather than failed-Log cancellation.

2. **MAJOR — STILL OPEN, deleted-set variant: Legacy receipts erase conflicting unsaved input.**  
   [src/db/workouts.ts:169](/Users/rabah/projects/anygym/src/db/workouts.ts:169), [src/screens/workout/rowLog.ts:283](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:283), [src/lib/setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)

   The legacy-receipt fix compares payloads only while the saved set exists. After deletion, its receipt lacks a fingerprint and reconciliation falls back to revision equality. **Reproduced:** save A at **53 lb × 10**, remove its fingerprint, delete A, then submit **73 lb × 19** under A/revision 1. Submission returns success, no new set exists, and the pending 19-rep input disappears.

   **Exact fix:** Use the matching tombstone’s payload when available. When neither a fingerprint nor trustworthy saved payload exists, keep reconciliation unresolved. Never consume input solely because its revision matches a legacy receipt.

   **Test to add:** Extend [codex-3.2b.test.ts:116](/Users/rabah/projects/anygym/src/db/__tests__/codex-3.2b.test.ts:116) by deleting the original set before submission. Require the conflicting input to remain recoverable, with no success callback. Repeat after tombstone expiry.

3. **MAJOR — STILL OPEN, equal-revision variant: “Finish without it” discards input the user was never shown.**  
   [src/screens/workout/rowLog.ts:339](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:339), [src/screens/workout/rowLog.ts:353](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:353)

   The unsaved sheet identifies failed Logs by ID and revision only. Two tabs can give different payloads that same identity/revision. **Reproduced through production submission helpers:** A’s sheet represented **10 reps**; B subsequently journaled **19 reps** at the same revision. A’s discard deleted B’s journal, and Finish succeeded without that set.

   **Exact fix:** Snapshot a globally unique operation identity and payload fingerprint in `ShownRow` and the journal. Transactionally discard only the exact operation/payload shown. Changed input must remain unresolved and prompt again.

   **Test to add:** Use separate storage contexts and queues sharing IndexedDB. Fail A’s 10-rep Log, snapshot its shown row, then fail B’s 19-rep Log using the same draft ID/revision. Discard A’s snapshot. Assert B’s payload remains retryable and Finish refuses until it is resolved.

4. **MAJOR — STILL OPEN, SPEC §13.3 test gap: Hard-kill tests avoid write boundaries.**  
   [tests/kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

   The browser is killed after UI assertions and database snapshots. These tests establish settled-state recovery without interrupting journal persistence, transaction commit, or reconciliation.

   **Counterexample:** A settled draft survives, while termination immediately after receipt commit loses another pending row or offers a duplicate. **No current duplication defect is claimed.**

   **Exact fix/test:** Add deterministic gates after journal persistence, before set commit, and after receipt commit/before reconciliation. SIGKILL at each gate and relaunch offline. Require literal pending values **7, 8**, one committed **19-rep** set, and no duplication after Retry. Include group Undo acceptance/restoration boundaries.

5. **MAJOR — STILL OPEN, SPEC §§13.3–13.4 test gap: Default acceptance execution excludes four devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

   Default execution restricts Android and the 320 floor to `@matrix`. Kill and monkey cases are consequently absent from those projects.

   **Counterexample:** A Chromium-only recovery failure cannot fail the standard suite because its recovery test is not selected.

   **Exact fix/test:** Make full-matrix execution the acceptance default; expose the checkpoint subset through a separate command. Add a discovery assertion requiring the applicable functional test IDs—including kill and monkey cases—on all seven projects.

6. **MAJOR — STILL OPEN, mocked interaction: “Swipe” coverage bypasses native touch panning.**  
   [tests/loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [tests/helpers/monkey.ts:181](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:181)

   Wheel coverage assigns `scrollLeft`; monkey swipes use mouse dragging. Neither establishes that a phone’s finger gesture works.

   **Counterexample:** A sheet’s `touch-action` prevents horizontal wheel movement while direct scrolling still passes. **A current device failure is unconfirmed.**

   **Exact fix/test:** Add native touch drags through Chromium touch injection and an iOS simulator/device driver. In Weight and Edit sheets, require actual wheel movement, changed selection, and Done/Save persisting the displayed weight. Test horizontal row deletion and vertical scrolling separately.

7. **MAJOR — NEW, SPEC §13.3 test gap: The fresh-user walkthrough stops before logging and finishing.**  
   [tests/intake-3.3.spec.ts:159](/Users/rabah/projects/anygym/tests/intake-3.3.spec.ts:159), [tests/intake-3.3.spec.ts:183](/Users/rabah/projects/anygym/tests/intake-3.3.spec.ts:183)

   The measured walkthrough ends on entering the workout. Other logging tests normally receive the fixture’s precompleted-intake flags. Elapsed time is annotated without enforcing a duration budget.

   **Counterexample:** A first-use prompt blocks the first Log after onboarding, while onboarding and established-user logging tests both pass. **This is a coverage gap, not an established product defect.**

   **Exact fix/test:** Add one uninterrupted `intake: 'fresh'` test: empty storage → complete questionnaire → Start Day 1 → pick the first weight → log three sets → Finish → reload History. Count all interaction taps and assert one finished session containing the three literal set payloads. Measure onboarding duration directly against §13.3’s stated budget.

8. **MINOR — STILL OPEN, storage-failure variant: A stale tab loses added rows despite working IndexedDB.**  
   [src/lib/extraSets.ts:108](/Users/rabah/projects/anygym/src/lib/extraSets.ts:108), [src/lib/extraSets.ts:133](/Users/rabah/projects/anygym/src/lib/extraSets.ts:133)

   The 3.2a fix refreshes from localStorage. When localStorage rejects writes, each tab still writes its complete cached collection to IndexedDB. **Reproduced:** durable `{squat: 2}` became `{squat: 1, bench: 1}` after a stale tab added bench.

   **Exact fix:** Apply row-count deltas and deletion-marker changes transactionally against the latest IndexedDB value. Publish committed results to memory and localStorage afterward.

   **Mocked-away failure/test:** [codex-stale-tab-row-adjustments.test.ts:5](/Users/rabah/projects/anygym/src/lib/__tests__/codex-stale-tab-row-adjustments.test.ts:5) supplies storage whose writes always succeed. Repeat both tests with throwing localStorage writes, separate hydrated module instances, and working shared IndexedDB. Restart and require both squat additions and every independent deletion marker.

9. **MINOR — STILL OPEN, implementation-repeating assertion: Backup completeness uses production’s whitelist.**  
   [src/db/__tests__/backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73), [src/db/__tests__/backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97)

   Both the snapshot and expected table names come from `TABLE_NAMES`.

   **Counterexample:** Accidentally remove a table from that production list; these completeness assertions remove it from their expectations too.

   **Exact fix/test:** Define an independent literal backup contract. Seed distinct sentinels in every required table plus drafts, rest, extra rows, and pending changes. Export, restore into a fresh context, and assert each destination sentinel directly. Deliberately omitting any required category must fail the test.

10. **MINOR — STILL OPEN, implementation-repeating assertion: Muscle-list expectations call the production filter.**  
    [tests/muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13), [tests/muscles-2.2c.spec.ts:85](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:85)

    Rendered membership and expected membership use `exercisesForRegion()`. Separate unit tests offer protection, but the browser assertion independently establishes no completeness.

    **Counterexample:** The production filter omits a valid exercise; this browser comparison omits it from both sides and passes.

    **Exact fix/test:** Add independently audited literal membership fixtures for quads and front/rear delts, including secondary-only exclusions. Compare rendered IDs directly against those literals without importing the production filter. Verify that deliberately omitting one expected exercise fails.