**12 findings: six product defects and six test blind spots, all STILL OPEN.** Reviewed completed `[x]` work only; excluded fixed earlier findings. No files edited.

TypeScript checking passed. In-memory production-code probes confirmed findings 1–6. Full Vitest, Playwright and physical-device tests were not run.

1. **MAJOR — STILL OPEN: Finish silently omits a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83)

   Another tab’s failed Log can survive only in the durable draft mirror. Finish checks journals and held corrections, overlooks that submission, and succeeds. **Reproduced:** pending **73 lb × 19** was omitted; Finish reported one saved set.

   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against commit and cancellation receipts; reject unresolved submissions. Build the Undo snapshot from that reconciled state.

   **Test:** Promote [codex-cross-tab-submission-evidence.test.ts:85](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:85) from `it.fails` to an ordinary test. Extend through restart → Retry → exactly one saved **73 lb × 19** set. Currently, the expected-failure declaration permits this defect in a green suite.

2. **MAJOR — STILL OPEN: Discard → Undo loses the failed first set.**  
   [discard.ts:14](/Users/rabah/projects/anygym/src/db/discard.ts:14), [TodayScreen.tsx:200](/Users/rabah/projects/anygym/src/screens/TodayScreen.tsx:200)

   A failed first Log can leave a submitted draft without a journal or saved set. Discard treats the workout as empty and clears its drafts; Undo restores only the session and counter. **Reproduced:** Undo returned zero sets and no draft. Ordinary pending picks are also lost.

   **Exact fix:** Under the session lock, refuse discard while submitted drafts or held corrections remain unresolved. Transactionally capture drafts, extra rows and rest alongside the discarded session; Undo must restore their durable records and runtime stores.

   **Test:** Fail the first journal write after picking **73 lb × 19**. Return to Today, Discard, Undo and restart. Assert either discard was refused or the exact input remains recoverable. Repeat with an ordinary unsubmitted pick.

3. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)

   Different payloads receive protection only when revisions are equal, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against another payload’s revision-5 receipt.

   **Exact fix:** Consume a draft only with matching committed payload evidence or explicit causal supersession. Preserve mismatching fingerprints at every revision under a distinct recoverable identity; coordinate revision allocation transactionally.

   **Test:** Promote the cases at [codex-cross-tab-submission-evidence.test.ts:47](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:47) from `it.fails.each`. Assert both payloads survive restart, resubmission saves the conflict once, and matching stale payloads still deduplicate.

4. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:80](/Users/rabah/projects/anygym/src/db/backup.ts:80), [backup.ts:102](/Users/rabah/projects/anygym/src/db/backup.ts:102)

   Held corrections are captured before the database snapshot. A failed edit retained during that gap appears in neither exported sets nor pending changes. **Reproduced:** backup contained the original set and a later committed set, while omitting the source’s durable correction.

   **Exact fix:** Read durable held corrections inside the same snapshot transaction as sets, journals and supersession receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

   **Test:** Promote the “at snapshot” case at [codex-backup-arriving-correction.test.ts:28](/Users/rabah/projects/anygym/src/db/__tests__/codex-backup-arriving-correction.test.ts:28). Restore into a fresh database, restart, Retry twice and Finish; assert the exact correction survives and commits once.

5. **MAJOR — STILL OPEN: Logging resurrects deliberately removed input.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)

   The durable merge reinserts clean cached drafts whenever IndexedDB lacks their slot, including deliberate removals by another tab. **Reproduced:** a clean cached **73 lb × 19** draft returned to storage after its durable removal.

   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence. Refresh memory from the successful transaction’s merged result.

   **Test:** Use two isolated module contexts sharing IndexedDB with localStorage blocked. Hydrate the same draft in both, remove it in A, then log a different row in B. Restart and assert the removed identity stays absent while B’s set exists once.

6. **MAJOR — STILL OPEN: Beginner targets ignore stack add-on resistance.**  
   [useWorkout.ts:282](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:282)

   `pickedWeight()` supplies the pin value to the test-set calculation; reconstruction omits the add-on. **Reproduced:** **100 lb pin + 50 lb added**, lifted for ten reps, produces a **110 lb** working target for eight reps—below the resistance just lifted.

   **Exact fix:** Estimate strength and apply increase limits using complete resistance through `load.ts`. Explicitly decide whether the target retains the add-on or replaces it with pin resistance, then reconstruct the same intended total.

   **Test:** Extend the beginner browser test at [coach-3.8.spec.ts:269](/Users/rabah/projects/anygym/tests/coach-3.8.spec.ts:269) with stack add-ons in lb and kg. For the example above, assert the target totals **165 lb** under the current formula and five-pound steps, and the logged resistance equals the displayed target.

7. **MAJOR — STILL OPEN, test gap: Hard-kill coverage misses interrupted writes.**  
   [kill.spec.ts:85](/Users/rabah/projects/anygym/tests/kill.spec.ts:85)

   Tests capture settled UI/database snapshots before killing. SPEC 13.3’s interrupted-write boundaries remain untested.

   **Counterexample:** termination after a submission receipt commits but before draft reconciliation could duplicate a lift or lose another pending row. A current device failure is unconfirmed.

   **Exact fix/test:** Add deterministic gates after journal commit, during the set transaction, and after receipt commit/before reconciliation. SIGKILL at each gate, relaunch offline, Retry, and assert exact pending payloads plus one committed submission. Include interrupted Undo acceptance and restoration.

8. **MAJOR — STILL OPEN, test gap: Default acceptance omits required devices.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47)

   Android projects and the 320-wide floor select only `@matrix` tests. Kill and monkey cases therefore do not receive SPEC 13.3–13.4’s required default coverage.

   **Counterexample:** a Chromium-only recovery regression can pass default acceptance because its recovery test is never selected.

   **Exact fix/test:** Make full-matrix execution the acceptance default and retain a separate fast checkpoint mode. Add a test-discovery check requiring kill and monkey cases on all seven projects, including checks for internal skips.

9. **MAJOR — STILL OPEN, suppressed failure: The fixture hides application CSP errors.**  
   [fixtures.ts:184](/Users/rabah/projects/anygym/tests/fixtures.ts:184)

   `quietHarnessStyleNoise()` suppresses matching stylesheet errors from every console listener, even outside screenshot operations.

   **Counterexample:** opening a sheet inserts a forbidden stylesheet; styling breaks while SPEC 13.3’s console gate passes. No current component failure is claimed.

   **Exact fix/test:** Collect `securitypolicyviolation` events globally; exempt only positively attributed screenshot operations. Add a harness test inserting a forbidden `<style>` without taking a screenshot and require the collector to record it. Retain a screenshot-noise control.

10. **MAJOR — STILL OPEN, simulated interaction: Swipe tests bypass native gesture behavior.**  
    [loads.spec.ts:58](/Users/rabah/projects/anygym/tests/loads.spec.ts:58), [touch.ts:24](/Users/rabah/projects/anygym/tests/helpers/touch.ts:24)

    Wheel tests assign `scrollLeft` or use mouse drags. The newer touch helper dispatches untrusted DOM events, which cannot verify native scrolling and gesture arbitration.

    **Counterexample:** incorrect `touch-action` blocks finger scrolling inside a sheet while these tests pass. Physical-device failure is unconfirmed.

    **Exact fix/test:** Add native Chromium touch injection and an iOS simulator/device gesture test. Drag a wheel inside Weight/Edit sheets, immediately confirm, and assert saved weight equals the displayed selection. Also verify vertical scrolling never triggers row deletion.

11. **MINOR — STILL OPEN, repeating assertion: Backup completeness uses production’s whitelist.**  
    [backup.test.ts:73](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:73), [backup.test.ts:97](/Users/rabah/projects/anygym/src/db/__tests__/backup.test.ts:97)

    Both the snapshot and expected exported table names derive from production `TABLE_NAMES`.

    **Counterexample:** removing `exerciseSettings` from that list removes it from both actual and expected snapshots; the completeness assertion still passes despite lost bar choices and rest settings.

    **Exact fix/test:** Define an independent literal backup contract. Seed distinct sentinels in every required category, restore into a fresh database, and directly assert destination records and live state. Removing any required export category must fail.

12. **MINOR — STILL OPEN, inactive coverage: Newly mounted controls escape 130% text checks.**  
    [codex-se-lifecycle.spec.ts:40](/Users/rabah/projects/anygym/tests/codex-se-lifecycle.spec.ts:40), [codex-se-offline-dynamic-text.spec.ts:33](/Users/rabah/projects/anygym/tests/codex-se-offline-dynamic-text.spec.ts:33)

    The active test enlarges existing elements once, then mounts reps/rest controls. The regression that enlarges newly mounted controls remains skipped.

    **Counterexample:** a newly mounted fixed-size Done or rest label overlaps at 130%, while acceptance checks its normal-size rendering. Current overlap is unconfirmed.

    **Exact fix/test:** Enable baseline-preserving scaling for newly mounted controls and unskip the regression. Assert each new label computes to 1.3× baseline, then check clipping, overlap, 48-point targets and current-row visibility.