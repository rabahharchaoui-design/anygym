The highest-risk findings are possible loss of submitted workout data and an interrupted run. All six product findings below were reported earlier and are **STILL OPEN** in the current source. Several require a storage failure or overlapping app contexts; the rapid-tap race is timing-dependent.

This was a read-only source review. I did not run the suites or repeat the earlier failure-injection reproductions, so the conclusions below are based on the current code and existing regression cases.

### Product findings

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.** [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a Log journal write fails in another app context, its checked set can remain only in the durable draft mirror. Finish checks the journal and held corrections, but not that mirror, so it can finish without the set. **Fix:** Register submissions under the session lock; in Finish’s transaction reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in Undo.

2. **MAJOR — STILL OPEN: A failed recovery read permits starting another run.** [runEngine.ts:226](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:226), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37)  
   A read error is treated as “nothing to bring back.” A new run then overwrites the shared live snapshot, potentially making the interrupted route unrecoverable. **Fix:** Represent read failure separately from an empty result, offer Retry, and block Start until recovery succeeds. Key snapshots by run ID and enforce one active run transactionally.

3. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.** [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate contexts can allocate revisions independently. A draft with a lower revision and different values is discarded against a higher-revision receipt even if those values never saved. **Fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: Retry can save a different weight from the one displayed.** [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   A failed row is rebuilt using current equipment settings, while Retry submits the stored draft. An earlier reproduction showed **125 lb** on a women’s bar while Retry saved **135 lb** on an Olympic bar. **Fix:** Display and retry the same canonical submitted load, including its equipment snapshot; an explicitly confirmed correction must replace both with a new revision.

5. **MAJOR — STILL OPEN, timing-dependent: Two rapid checks can acknowledge one set without writing it.** [useLogRow.ts:31](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:31), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Distinct rows can be claimed before their deferred writes begin. If their writes overlap, the second submission receives the first write’s promise without running its own write. The queue interleaving was reproduced in an earlier report; I cannot confirm normal phone interaction reaches the timing. **Fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own commit.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.** [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections, so restoring returns the older values. **Fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts; coordinate fallback and memory capture with mutation registration under the session lock.

### Test blind spots

7. **MAJOR — STILL OPEN: Known data-loss regressions are expected failures.** [codex-cross-tab-submission-evidence.test.ts:47](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:47), [codex-backup-arriving-correction.test.ts:28](/Users/rabah/projects/anygym/src/db/__tests__/codex-backup-arriving-correction.test.ts:28)  
   **Counterexample:** A conflicting draft is discarded, Finish omits a submitted draft, or a correction arriving during export is omitted while the suite remains green because the cases use `it.fails`. **Test to add:** Once fixed, turn these into ordinary passing tests. Assert the draft’s exact load and reps survive reload, Finish refuses the unresolved submission, and the restored backup retains and applies the arriving correction exactly once.

8. **MAJOR — STILL OPEN: The queue test misses overlapping distinct rows.** [logQueue.test.ts:39](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:39)  
   **Counterexample:** The test submits the same ID twice, then tests the next ID only after the first write completes. Two different IDs overlapping can therefore share the first result. **Test to add:** Gate row 1’s write, submit row 2 with different values before releasing it, and assert neither claim succeeds before its own commit and both exact records exist afterward.

9. **MAJOR — STILL OPEN: The default UI run skips most Android and 320-wide cases.** [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45)  
   **Counterexample:** An untagged recovery test passes on iPhones while the same flow fails on Android; the default command runs only `@matrix` cases on those projects, contrary to SPEC 13.3. **Test to add:** Make the acceptance command run with `PW_FULL_MATRIX=1`, and check Playwright’s test listing in CI to verify that each project includes the recovery and primary-flow specs.

10. **MINOR — STILL OPEN: The muscle-list assertion repeats production logic.** [muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13)  
    **Counterexample:** If `exercisesForRegion()` omits a valid quad exercise, both the UI and its calculated expected list omit it and the comparison passes. **Test to add:** Compare rendered exercise IDs against independently audited literal IDs for representative muscles, including a primary-muscle case and a shoulder override.

11. **MINOR — STILL OPEN: The SPEC 13 monkey test misses Run and native touch movement.** [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25), [monkey.ts:19](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:19)  
    **Counterexample:** A live run can become stuck locked, or touch scrolling can break, while the existing screens and mouse drags pass. **Test to add:** Run seeded 90-second cases on Run start and a live run with simulated GPS. Use a supported native touch gesture, verify it scrolls a known screen first, then assert the run remains unlockable, pausable and endable without console errors. A physical-device test is needed where the browser automation cannot produce native touch movement.

12. **MINOR — STILL OPEN: Voice tests mock away audio decoding.** [voice.ts:40](/Users/rabah/projects/anygym/tests/helpers/voice.ts:40)  
    **Counterexample:** A corrupt shipped clip can be fetched and converted into a fake buffer in the test yet fail to decode during an offline run. **Test to add:** Decode every shipped clip with a real decoder. In a built-app browser test, warm the voice cache, go offline, play a representative multi-clip cue, and assert decoding and playback complete without fallback.