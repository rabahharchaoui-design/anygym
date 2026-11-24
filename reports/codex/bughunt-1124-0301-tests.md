The highest-risk findings concern workout data loss and a displayed weight differing from the weight saved. All product findings below were reported earlier and are **STILL OPEN** in the inspected code.

This was a read-only review. I did not run the suites or repeat the earlier failure-injection reproductions; the failure paths below are based on the current source and the existing regression cases. Concurrent-context timing and physical iPhone behavior remain unverified.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks the journal and held corrections, but does not reconcile submitted rows in the durable draft mirror. If a journal write fails in another app context, Finish can save the workout without that checked set.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

2. **MAJOR — STILL OPEN: A failed recovery read permits a new run.**  
   [runEngine.ts:241](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:241) treats a storage error as no unfinished run. Starting another run can overwrite the shared live snapshot, potentially losing the interrupted route.  
   **Exact fix:** Represent recovery failure separately from an empty result, offer Retry, and block Start until recovery succeeds. Key snapshots by run ID and enforce one active run transactionally.

3. **MAJOR — STILL OPEN: Retry can save a different weight from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72) rebuilds a failed row with current equipment settings, while [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69) retries the stored draft. An earlier audit reproduced **125 lb displayed on a women’s bar while Retry saved 135 lb on an Olympic bar** after the bar choice changed.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. A confirmed correction should replace both with a new revision.

4. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163) can treat a higher revision as evidence that a lower-revision draft was saved, although separate contexts allocate revisions independently. A conflicting draft can disappear with values that never committed.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN, timing-dependent: Rapid checks can acknowledge a set without saving it.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34) can claim distinct rows before their deferred writes start. If they overlap, [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77) returns the first write’s promise to the second without running its write. The earlier audit reproduced the queue interleaving; **I am not sure ordinary phone taps can reach it**.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own commit.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:87](/Users/rabah/projects/anygym/src/db/backup.ts:87) captures held corrections before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections; restoring returns the older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals, and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134) compares the selected pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

**Test blind spots**

8. **MAJOR — STILL OPEN: Known data-loss regressions are expected failures.**  
   [codex-cross-tab-submission-evidence.test.ts:47](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:47) and [codex-backup-arriving-correction.test.ts:28](/Users/rabah/projects/anygym/src/db/__tests__/codex-backup-arriving-correction.test.ts:28) use `it.fails` for known defects. **Counterexample:** Finish omits a submitted draft, or a correction arriving during export is omitted, while the suite remains green.  
   **Exact test:** Once fixed, make these ordinary passing tests. Assert that the exact conflicting load and reps survive reload, Finish refuses the unresolved submission, and a restored backup retains and applies the arriving correction exactly once.

9. **MAJOR — STILL OPEN: The queue test misses overlapping distinct rows.**  
   [logQueue.test.ts:39](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:39) submits the same ID twice; its next-row case waits for the first write to finish. **Counterexample:** Row 2 has a different ID and values but receives row 1’s successful promise without its own write.  
   **Exact test:** Gate row 1’s write, submit row 2 before releasing it, then assert each claim succeeds only after its own commit and both exact records exist.

10. **MAJOR — STILL OPEN: The default UI suite skips most Android and 320-wide cases.**  
    [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) limits those projects to tests tagged `@matrix`, while SPEC 13.3 requires every UI test on the matrix. **Counterexample:** An untagged recovery flow passes on iPhone but fails at 320 px without the default suite exercising it there.  
    **Exact test:** Run the acceptance suite with `PW_FULL_MATRIX=1` and have CI check Playwright’s test listing to confirm every project includes the recovery and primary-flow specs.

11. **MINOR — STILL OPEN: The muscle-list assertion repeats production logic.**  
    [muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13) uses `exercisesForRegion()` to calculate the expected result. **Counterexample:** The helper omits a valid quad exercise; both the UI and expected list omit it, so the comparison passes.  
    **Exact test:** Compare rendered exercise IDs with independently audited literal IDs for representative muscles, including a primary-muscle case and a shoulder override.

12. **MINOR — STILL OPEN: The SPEC 13 monkey test misses Run and native touch movement.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25) omits Run, and [monkey.ts:19](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:19) explains that its swipes are mouse drags. **Counterexample:** A live run becomes stuck locked, or native touch scrolling breaks, while the existing monkey cases pass.  
    **Exact test:** Add seeded 90-second cases for Run start and a live run with simulated GPS; exercise a supported native touch gesture, first verify it scrolls a known screen, then assert the run remains unlockable, pausable, and endable without console errors. Use a physical-device test where browser automation cannot produce native touch movement.