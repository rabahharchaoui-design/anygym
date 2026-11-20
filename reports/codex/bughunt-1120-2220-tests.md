I found six product risks and six test blind spots in completed features. The product findings were reported earlier and are **STILL OPEN** on source inspection. The concurrent-context and storage-failure scenarios are qualified below; I did not rerun the earlier reproductions or run the test suites. No files were edited.

## Product findings

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks journals and held corrections, but does not reconcile submitted drafts from another app context. If that context’s journal write fails, Finish can close the workout without a checked set that exists only in the durable draft mirror. This requires a storage failure and another context.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from the reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks can leave a set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77). Two distinct rows can be claimed before their deferred writes start. If the writes overlap, the second receives the first row’s promise without its own write running. The queue interleaving was reproduced in an earlier report; whether ordinary phone interaction reaches the timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring work. Deduplicate only the same submission ID, queue distinct IDs, and acknowledge each only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163) compares payload fingerprints only when revisions match, although separate contexts can allocate revisions independently. A lower-revision draft containing different values can be consumed against a later receipt even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: Retry can save a different load from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69). A failed row is rebuilt using current equipment settings, while Retry submits its stored draft. An earlier reproduction showed **125 lb on a women’s bar** while Retry saved **135 lb on an Olympic bar**.  
   **Exact fix:** Display and retry the same canonical submitted payload, including its equipment snapshot. A confirmed correction should replace both the displayed draft and journal payload with a new revision.

5. **MAJOR — STILL OPEN: A failed run-recovery read permits a new run.**  
   [runEngine.ts:216](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:216) treats a storage read failure as if no run existed and marks the engine ready. Starting another run can replace the live snapshot and make the unfinished route unreliable to recover.  
   **Exact fix:** Represent recovery failure separately from an empty database, offer Retry, and block Start until the read succeeds. Store snapshots by run ID and enforce one active run transactionally.

6. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137) compares pin values without add-ons. Two hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads using `sameResistance()` and format the explanation from complete resistance.

## Test blind spots

7. **MAJOR — STILL OPEN: Queue tests encode the single-write assumption and omit overlapping distinct rows.**  
   [logQueue.test.ts:39](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:39) verifies deduplication for the *same* ID; the next-row test waits for the first write to finish. **Counterexample:** row 2 submits while row 1 is blocked, receives row 1’s success, and is never written.  
   **Test to add:** Gate row 1’s real database write, submit row 2 with a different ID and values before releasing row 1, then release both. Assert both IDs and their respective values exist and neither claim succeeds before its own commit.

8. **MAJOR — STILL OPEN: Run recovery tests assume successful storage and lifecycle events.**  
   [runEngine-4.3.test.ts:83](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts:83) waits for a successful `pagehide` save in an in-memory database. **Counterexample:** the recovery read rejects once and Start becomes available while the original run remains stored; a process can also die without `pagehide`.  
   **Tests to add:** Reject `readLiveRun` once and assert Start remains unavailable until Retry succeeds. Separately, record a known route in a persistent browser profile, wait for confirmed autosave, kill the process without lifecycle events, and relaunch offline. Assert the route returns paused and the interruption is represented.

9. **MAJOR — STILL OPEN: The default UI suite omits part of the required device matrix.**  
   [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) runs only `@matrix` tests on Android and the 320-wide project unless `PW_FULL_MATRIX` is set. **Counterexample:** a Chromium-only regression in an untagged recovery test can pass the default suite, contrary to SPEC 13.3–13.4.  
   **Test and fix:** Run every UI spec on all seven projects in the acceptance command. Add a CI check against Playwright’s test listing that every project selects the recovery and primary-flow tests.

10. **MINOR — STILL OPEN: The monkey suite omits Run.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25) includes neither Run start nor a live run. **Counterexample:** random interactions leave a live run locked or unresponsive while the required main-screen monkey suite remains green.  
    **Test to add:** Run seeded 90-second cases on Run start and a live run with simulated GPS. Assert no console errors, then unlock, pause and end through the UI on every matrix device.

11. **MINOR — STILL OPEN: Monkey “swipes” are mouse drags.**  
    [monkey.ts:175](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:175) uses `page.mouse` for swipes. **Counterexample:** broken touch panning or `touch-action` leaves a phone screen stuck while mouse dragging passes.  
    **Test to add:** Use an engine-supported touch gesture driver. First assert that a touch swipe changes the scroll position of a known scrollable screen, then exercise swipe navigation on each required engine.

12. **MINOR — STILL OPEN: Voice tests mock away actual audio decoding.**  
    [compose-4.4.test.ts:10](/Users/rabah/projects/anygym/src/lib/run/voice/__tests__/compose-4.4.test.ts:10) checks IDs against manifest metadata, while [voice.ts:11](/Users/rabah/projects/anygym/tests/helpers/voice.ts:11) replaces browser audio behavior. **Counterexample:** an invalid audio file with matching updated metadata can pass those checks but fail during an offline cue. A separate version test checks file bytes, so deletion alone is not a valid counterexample.  
    **Test to add:** Decode every shipped clip with a real decoder. In a built-app browser test, warm the voice cache, go offline, play a representative multi-clip cue, and assert decoding and playback complete without fallback.