I found six product defects and six test blind spots in completed features. All twelve were identified in earlier reports and remain present in the current source. The race and storage-failure findings are source-traced; I did not reproduce them in a browser or on a physical iPhone.

### Product findings

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks the journal and held corrections but does not reconcile submitted drafts held by another app context. If that context’s journal write fails, Finish can close the workout without the checked set.  
   **Exact fix:** Admit submissions under the session lock. During Finish, reconcile durable submitted drafts against commit and cancellation receipts, reject unresolved submissions, and build the Undo snapshot from the reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks can leave one set unsaved.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77). Two different rows can be claimed before their deferred writes begin. If those writes overlap, the second can receive the first row’s promise and appear successful without its own set being written. An earlier audit reproduced the queue behavior; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard a different unsaved weight and reps.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170) compares payload fingerprints only when revisions match. Since separate contexts can allocate revisions independently, a draft of **73 lb × 19** at revision 1 can be discarded against a receipt for **53 lb × 10** at revision 5.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or recorded causal history proves it was superseded. Preserve conflicting payloads regardless of revision order.

4. **MAJOR — STILL OPEN: Failed run recovery permits a new run.**  
   [runEngine.ts:189](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:189), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37). A failed storage read is treated as no active run. Starting another run can replace the single live snapshot, making the original route difficult to recover.  
   **Exact fix:** Represent recovery failure separately from an empty database, offer Retry, and block Start until the active-run check succeeds. Store snapshots by run ID and enforce one active run transactionally.

5. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82) captures held corrections before taking the database snapshot. A failed correction retained between those reads can be absent from both the exported set and the retryable corrections; restoring returns the older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

6. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134) compares selected pin values without add-ons. Two hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target even though resistance increased.  
   **Exact fix:** Compare complete saved loads using `sameResistance()` and format the explanation from complete resistance.

### Test blind spots

7. **MAJOR — STILL OPEN: Queue tests miss overlapping submissions for distinct rows.**  
   [logQueue.test.ts:55](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:55) waits for row 1 before submitting row 2; [line 209](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:209) tests claims with independent callbacks rather than the submission path.  
   **Counterexample:** Row 2 reaches `submit` while row 1’s write is blocked and receives row 1’s success without being saved.  
   **Test to add:** Gate row 1’s real `submitRow` write, submit row 2 before releasing it, then release both. Assert that two distinct IDs with their respective values exist in IndexedDB and that neither claim succeeds before its own commit.

8. **MAJOR — STILL OPEN: Run recovery tests mock away failed reads and abrupt termination.**  
   [runEngine-4.3.test.ts:83](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts:83) dispatches `pagehide` and waits for a successful save in an in-memory database.  
   **Counterexample:** `readLiveRun` rejects once, after which a new run is allowed while the original remains stored. A process can also die without `pagehide`.  
   **Tests to add:** Reject the recovery read once and assert Start remains unavailable until Retry succeeds. Separately, start a run in a persistent browser profile, feed a known route, wait for a confirmed autosave, kill the process without lifecycle events, and relaunch offline. Assert that the saved route returns paused and time away is recorded as a gap.

9. **MAJOR — STILL OPEN: Most UI tests miss part of the required device matrix.**  
   [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) selects only `@matrix` tests on Android and the 320-wide project unless `PW_FULL_MATRIX` is set.  
   **Counterexample:** A Chromium-only regression in a workout recovery test without that tag can pass the default suite.  
   **Exact change and test:** Run every UI spec on all seven projects in the acceptance command. Add a CI assertion against Playwright’s test listing that every project selects the hard-kill and primary-flow tests.

10. **MINOR — STILL OPEN: The voice-pack assertion checks metadata against metadata.**  
    [compose-4.4.test.ts:10](/Users/rabah/projects/anygym/src/lib/run/voice/__tests__/compose-4.4.test.ts:10) calls a clip shipped when its ID exists in the manifest.  
    **Counterexample:** Delete a referenced `.m4a` while retaining its manifest entry: the assertion passes, but the offline cue can fail.  
    **Test to add:** Verify every manifest file exists, is nonempty and decodes. In a built-app browser test, warm the voice cache, go offline and play a representative multi-clip cue.

11. **MINOR — STILL OPEN: The SPEC 13 monkey suite omits Run.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25) includes neither Run start nor a live run.  
    **Counterexample:** Random swipes and control taps leave a live run locked or unresponsive while the suite stays green.  
    **Test to add:** Add seeded 90-second cases for Run start and a live run with simulated GPS. Assert no console errors, then use the UI to unlock, pause and end the run on each matrix device.

12. **MINOR — STILL OPEN: Monkey “swipes” use mouse drags.**  
    [monkey.ts:175](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:175) uses `page.mouse` for mobile swipes.  
    **Counterexample:** Broken touch panning or `touch-action` can leave a phone screen stuck while mouse dragging passes.  
    **Test to add:** Use an engine-supported touch gesture driver. First assert that a touch swipe changes the scroll position of a known scrollable screen, then exercise swipe navigation on each required engine.

This was a targeted, read-only review. No files were edited, and I did not run the test suites.