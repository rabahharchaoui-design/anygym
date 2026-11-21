The highest-risk open findings concern sets that can appear submitted but are not saved, and recovery paths that can discard or misrepresent user input. All findings below were reported previously and remain **STILL OPEN** on inspection of the current source.

This was a read-only review. I did not edit files or run the suites or earlier reproductions. The concurrent-action and storage-failure findings are source-traced risks; their exact timing has not been freshly reproduced on an iPhone.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks the journal and held corrections, but does not reconcile submitted drafts from another app context. If that context’s journal write fails, Finish can close the workout without the checked set.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from the reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks can leave one set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77). Two different rows can be claimed before their deferred writes start. If they overlap, the second can receive the first row’s promise without its own write running. The queue behavior is clear in code; whether the required timing occurs in normal phone interaction remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring work. Deduplicate only the same submission ID, queue different IDs, and acknowledge each only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard different unsaved values.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163) compares payload fingerprints only when revisions match, although separate contexts can allocate revisions independently. A draft for **73 lb × 19** at revision 1 can be consumed against a receipt for **53 lb × 10** at revision 5.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: Retry can save a different load from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69). A failed row is rebuilt with current equipment settings, while Retry submits the stored draft. An earlier report reproduced **125 lb on a women’s bar** displayed while Retry saved **135 lb on an Olympic bar**.  
   **Exact fix:** Display and retry the same canonical submitted payload, including its equipment snapshot. A confirmed correction should replace both the displayed draft and journal payload with a new revision.

5. **MAJOR — STILL OPEN: A failed run-recovery read permits a new run.**  
   [runEngine.ts:216](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:216) catches a storage read failure and sets the engine ready as though no run existed. Starting another run can replace the live snapshot and make the unfinished route unreliable to recover.  
   **Exact fix:** Represent a recovery failure separately from an empty database, offer Retry, and block Start until the read succeeds. Store snapshots by run ID and enforce one active run transactionally.

6. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137) compares pin values without their add-ons. Two hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads using `sameResistance()` and format the explanation from complete resistance.

7. **MAJOR — STILL OPEN, test blind spot: Queue tests do not overlap distinct rows.**  
   [logQueue.test.ts:55](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:55) waits for the first write before submitting the next row. **Counterexample:** row 2 reaches `submit` while row 1 is blocked, receives row 1’s success, and is never written.  
   **Test to add:** Gate row 1’s real database write, submit a different row ID before releasing it, then release both. Assert both IDs and their respective values exist, and neither claim succeeds before its own commit.

8. **MAJOR — STILL OPEN, test blind spot: Run recovery assumes a successful save and read.**  
   [runEngine-4.3.test.ts:83](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts:83) waits for a successful `pagehide` save in an in-memory database. **Counterexample:** the recovery read rejects once and Start becomes available while the original run is still stored; a process may also die without `pagehide`.  
   **Tests to add:** Reject `readLiveRun` once and assert Start remains unavailable until Retry succeeds. Separately, record a known route in a persistent browser profile, wait for confirmed autosave, kill the process without lifecycle events, and relaunch offline; assert the route returns paused and the interruption is represented.

9. **MAJOR — STILL OPEN, test blind spot: The default UI suite omits part of the required device matrix.**  
   [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) runs only `@matrix` tests on Android and the 320-wide project unless `PW_FULL_MATRIX` is set. **Counterexample:** a Chromium-only recovery regression in an untagged test can pass the default suite.  
   **Test and fix:** Run every UI spec on all seven projects in the acceptance command. Add a CI check against Playwright’s test listing that each project selects the recovery and primary-flow tests.

10. **MINOR — STILL OPEN, test blind spot: The monkey suite omits Run.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25) includes neither Run start nor a live run. **Counterexample:** random interactions leave a live run locked or unresponsive while this suite remains green.  
    **Test to add:** Run seeded 90-second cases on Run start and a live run with simulated GPS. Assert no console errors, then unlock, pause and end through the UI on every matrix device.

11. **MINOR — STILL OPEN, test blind spot: Monkey “swipes” are mouse drags.**  
    [monkey.ts:175](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:175) uses `page.mouse` for swipes. **Counterexample:** broken touch panning or `touch-action` leaves a phone screen stuck while mouse dragging passes.  
    **Test to add:** Use an engine-supported touch gesture driver. First assert that a touch swipe changes the scroll position of a known scrollable screen, then exercise swipe navigation on each required engine.

12. **MINOR — STILL OPEN, test blind spot: Voice tests do not prove the shipped audio plays.**  
    [compose-4.4.test.ts:10](/Users/rabah/projects/anygym/src/lib/run/voice/__tests__/compose-4.4.test.ts:10) checks IDs against manifest metadata, while the browser helper replaces decoding with a fake in [voice.ts:40](/Users/rabah/projects/anygym/tests/helpers/voice.ts:40). **Counterexample:** a file with matching updated metadata but invalid audio can pass those checks and fail during an offline cue. A separate version test does check file bytes, so deletion alone is not a valid counterexample.  
    **Test to add:** Decode every shipped clip with a real decoder. In a built-app browser test, warm the voice cache, go offline, play a representative multi-clip cue, and assert decoding and playback complete without fallback.