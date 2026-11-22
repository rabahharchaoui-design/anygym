I found six **still-open product issues** in completed features and six test blind spots. The most serious risks concern losing submitted workout data or recovering an interrupted run. These findings were reported earlier; I checked the cited paths against the current source, but did not rerun the earlier reproductions.

## Product findings

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.** [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a Log journal write fails in another app context, a checked row can remain in the durable draft mirror. Finish checks journals and held corrections but does not reconcile that mirror, so the finished workout can omit the set.  
   **Fix:** Register submissions under the session lock. At Finish, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

2. **MAJOR — STILL OPEN: A failed run-recovery read can make an unfinished route unrecoverable.** [runEngine.ts:226](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:226), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37)  
   A storage read failure is treated as an empty recovery result. Starting another run writes the shared live snapshot, so the interrupted run may no longer have its matching snapshot.  
   **Fix:** Keep recovery failure distinct from “no run,” show Retry, and block Start until recovery succeeds. Store snapshots by run ID and enforce one active run transactionally.

3. **MAJOR — STILL OPEN: Retry can save a different load from the one shown.** [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   A failed row is displayed using current equipment settings, while Retry submits its stored draft. An earlier report reproduced **125 lb displayed on a women’s bar while Retry saved 135 lb on an Olympic bar** after the bar selection changed.  
   **Fix:** Display and retry the same canonical submitted load, including its equipment snapshot. A confirmed correction should replace both with a new revision.

4. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.** [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate app contexts can allocate revisions independently, but reconciliation checks for different payloads only when revisions match. A lower-revision draft can therefore be discarded against a higher-revision receipt even when its values never saved.  
   **Fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN, timing-dependent: Rapid checks can acknowledge a set without writing it.** [useLogRow.ts:31](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:31), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Distinct rows can be claimed before their deferred writes begin. If those writes overlap, the second can receive the first row’s successful promise without its own write running. The earlier audit reproduced the queue interleaving; I cannot confirm that normal phone interaction reaches it.  
   **Fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own write commits.

6. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.** [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

## Test blind spots

7. **MAJOR — STILL OPEN: Known data-loss cases are expected to fail.** [codex-cross-tab-submission-evidence.test.ts:47](/Users/rabah/projects/anygym/src/db/__tests__/codex-cross-tab-submission-evidence.test.ts:47), [codex-backup-arriving-correction.test.ts:28](/Users/rabah/projects/anygym/src/db/__tests__/codex-backup-arriving-correction.test.ts:28)  
   **Counterexample:** A conflicting draft is discarded, or a correction arriving during backup is omitted, while the suite remains green because these cases use `it.fails`.  
   **Test to add:** Once fixed, convert these to ordinary passing tests: assert that the conflicting weight and reps survive reload and that an exported backup restores the arriving correction exactly once. Add a CI assertion that these regressions cannot be reintroduced as expected failures.

8. **MAJOR — STILL OPEN: The queue test omits overlapping distinct rows.** [logQueue.test.ts:39](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:39)  
   **Counterexample:** The tests submit the same ID twice, or wait for the first row before submitting the next. They miss row 2 receiving row 1’s success without being written.  
   **Test to add:** Gate row 1’s write, submit a different row ID and values before releasing it, then assert both records exist with their respective values and neither claim succeeds before its own commit.

9. **MAJOR — STILL OPEN: The default Playwright run omits much of the device matrix.** [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45)  
   **Counterexample:** An untagged recovery test can pass on iPhones while a Chromium-only regression breaks that flow on Android. The default Android and 320-wide projects run only `@matrix` tests.  
   **Test to add:** Run every UI spec on all seven projects in the acceptance command, and check Playwright’s test listing in CI to confirm each project includes the recovery and primary-flow tests.

10. **MINOR — STILL OPEN: Muscle-list completeness repeats the production implementation.** [muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13)  
    **Counterexample:** If `exercisesForRegion()` omits a valid quad exercise, both the UI and the test’s expected list omit it, so the comparison passes.  
    **Test to add:** Compare rendered IDs with independently audited literal IDs for representative muscles, including a primary-muscle case and a shoulder override.

11. **MINOR — STILL OPEN: The SPEC 13 monkey test omits Run and native touch movement.** [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25), [monkey.ts:19](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:19)  
    **Counterexample:** A live run can become stuck locked, or touch scrolling can break, while the existing mouse-drag cases pass.  
    **Test to add:** Run seeded 90-second cases on Run start and a live run with simulated GPS. Use an engine-supported touch gesture, first verify that it scrolls a known screen, then assert the run remains unlockable, pausable and endable without console errors.

12. **MINOR — STILL OPEN: Voice tests mock away audio decoding.** [voice.ts:40](/Users/rabah/projects/anygym/tests/helpers/voice.ts:40)  
    **Counterexample:** A corrupted shipped clip can be fetched successfully and turned into a fake buffer in the test, yet fail to decode during an offline run.  
    **Test to add:** Decode every shipped clip with a real decoder. In a built-app browser test, warm the voice cache, go offline, play a representative multi-clip cue, and assert decoding and playback complete without fallback.

This was a read-only review. I made no edits and did not run the suites or repeat the earlier failure-injection reproductions. Physical iPhone behavior and the reachability of the timing-dependent race remain unverified.