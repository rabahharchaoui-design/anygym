The highest-risk open issues can lose a submitted set or make an interrupted run difficult to recover. All findings below were reported in earlier Codex reviews and remain **STILL OPEN** on inspection of this checkout. Timing-dependent and storage-failure scenarios are qualified where applicable.

This was a read-only source and test review. I did not edit files, run the suites, or repeat the earlier reproductions on a phone.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks journals and held corrections but does not reconcile submitted drafts in the durable mirror. If a journal write fails in another app context, Finish can close the workout without a checked set. This requires a storage failure and another context.  
   **Exact fix:** Register submissions under the session lock. At Finish, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from that reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks can acknowledge a set without saving it.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77). Two rows can be claimed before deferred writes start. If their writes overlap, the second can receive the first row’s successful promise without its own write running. An earlier audit reproduced the queue interleaving; whether ordinary phone interaction reaches it is unverified.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard different unsaved values.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163) compares payload fingerprints only when revisions match, although separate contexts allocate revisions independently. A revision-1 draft for **73 lb × 19** can be consumed against a revision-5 receipt for **53 lb × 10**, losing the unsaved input.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: Retry can save a different load from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69). A failed row is rebuilt with current equipment settings, while Retry submits its stored draft. An earlier reproduction displayed **125 lb on a women’s bar** while Retry saved **135 lb on an Olympic bar**.  
   **Exact fix:** Display and retry the same canonical submitted payload, including its equipment snapshot. A confirmed correction should replace both the displayed draft and journal payload with a new revision.

5. **MAJOR — STILL OPEN: A failed run-recovery read permits a new run.**  
   [runEngine.ts:216](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:216), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37). A storage read failure is treated as an empty database. Starting another run can replace the shared live snapshot and make the unfinished route unreliable to recover.  
   **Exact fix:** Represent recovery failure separately from an empty database, offer Retry, and block Start until the read succeeds. Store snapshots by run ID and enforce one active run transactionally.

6. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137) compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target even though resistance increased.  
   **Exact fix:** Compare complete saved loads using `sameResistance()` and format the explanation from complete resistance.

7. **MAJOR — STILL OPEN, test blind spot: Queue tests omit overlapping distinct rows.**  
   [logQueue.test.ts:39](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:39) tests duplicate submissions for the same ID; its next-row test waits for the first write to finish. **Counterexample:** row 2 submits while row 1 is blocked, receives row 1’s success, and is never written.  
   **Test to add:** Gate row 1’s real database write, submit a different row ID and values before releasing it, then release both. Assert both IDs and their respective values exist and neither claim succeeds before its own commit.

8. **MAJOR — STILL OPEN, test blind spot: Run recovery assumes successful storage and lifecycle events.**  
   [runEngine-4.3.test.ts:83](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts:83) waits for a successful `pagehide` save in an in-memory database. **Counterexample:** the recovery read rejects once and Start becomes available while the original run remains stored; a process can also die without `pagehide`.  
   **Tests to add:** Reject `readLiveRun` once and assert Start remains unavailable until Retry succeeds. Separately, record a known route in a persistent browser profile, wait for confirmed autosave, kill the process without lifecycle events, and relaunch offline. Assert the run returns paused with the interruption represented.

9. **MAJOR — STILL OPEN, SPEC 13 test gap: The default UI suite omits part of the required device matrix.**  
   [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) selects only `@matrix` tests on Android and the 320-wide project unless `PW_FULL_MATRIX` is set. **Counterexample:** a Chromium-only regression in an untagged recovery test can pass the default suite.  
   **Exact fix/test:** Run every UI spec on all seven projects in the acceptance command. Add a CI check against Playwright’s test listing that every project selects the recovery and primary-flow tests.

10. **MINOR — STILL OPEN, implementation-repeating assertion: Muscle-list completeness uses the production filter as its oracle.**  
    [muscles-2.2c.spec.ts:13](/Users/rabah/projects/anygym/tests/muscles-2.2c.spec.ts:13) calls `exercisesForRegion()` to calculate the expected list used in the UI comparison. **Counterexample:** the helper omits a valid quad exercise; both the UI and expected list omit it, so the completeness assertion passes.  
    **Test to add:** Compare rendered IDs with independently audited literal IDs for representative muscles, including primary and overridden shoulder cases. Verify the test fails when a valid expected exercise is omitted.

11. **MINOR — STILL OPEN, SPEC 13 test gap: Monkey coverage omits Run and uses mouse drags for swipes.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25), [monkey.ts:175](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:175). **Counterexample:** random interactions leave a live run locked, or broken touch handling prevents phone scrolling, while the existing mouse-driven suite passes.  
    **Test to add:** Run seeded 90-second cases on Run start and a live run with simulated GPS. Use engine-supported touch gestures; first prove a touch swipe scrolls a known screen, then assert the live run can be unlocked, paused, and ended without console errors on every matrix device.

12. **MINOR — STILL OPEN, mocked failure: Voice tests do not prove shipped audio decodes and plays.**  
    [voice.ts:40](/Users/rabah/projects/anygym/tests/helpers/voice.ts:40) replaces decoding with a fake buffer. **Counterexample:** an invalid audio file with matching updated metadata can pass the mocked browser checks but fail during an offline cue.  
    **Test to add:** Decode every shipped clip with a real decoder. In a built-app browser test, warm the voice cache, go offline, play a representative multi-clip cue, and assert decoding and playback complete without fallback.