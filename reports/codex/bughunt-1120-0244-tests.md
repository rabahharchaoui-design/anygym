I found six product risks in completed features and six test blind spots. All were reported earlier and remain **STILL OPEN** in the current source. The product findings involving concurrent contexts or storage failures are source-traced risks; I did not reproduce them in a browser or on an iPhone during this read-only review.

1. **MAJOR — STILL OPEN: Finishing can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks journals and held corrections but does not reconcile submitted drafts from another app context. If that context’s journal write fails, Finish can close the workout without the checked set.  
   **Exact fix:** Admit submissions under the session lock. In the Finish transaction, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build Undo from the reconciled state.

2. **MAJOR — STILL OPEN: Rapidly checking different rows can leave one unsaved.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77). Different rows can be claimed before their deferred writes start. If the writes overlap, the second receives the first row’s promise and can appear successful without being written. The queue behavior follows from the code; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard different unsaved values.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163) compares payload fingerprints only when revisions match, although contexts allocate revisions independently. A draft for **73 lb × 19** at revision 1 can be discarded against a receipt for **53 lb × 10** at revision 5.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads regardless of revision order and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: Failed run recovery permits a new run.**  
   [runEngine.ts:189](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:189) treats a storage-read failure as no run to recover. Starting another run can replace the shared live snapshot, making the unfinished route unreliable to recover.  
   **Exact fix:** Represent recovery failure separately from an empty database, offer Retry, and block Start until the check succeeds. Store snapshots by run ID and enforce one active run transactionally.

5. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82) captures held corrections before taking the database snapshot. A failed edit retained between those reads can be absent from both the exported set and retryable corrections; restoring returns the older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

6. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137) compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target even though resistance increased.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation using complete resistance.

7. **MAJOR — STILL OPEN, test gap: Queue coverage misses overlapping distinct rows.**  
   [logQueue.test.ts:55](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:55) waits for the first write before submitting the next row. **Counterexample:** row 2 reaches `submit` while row 1 is blocked, receives row 1’s success, and is never written.  
   **Test to add:** Gate row 1’s real write, submit row 2 before releasing it, then release both. Assert IndexedDB contains both distinct IDs and their respective values, and neither claim succeeds before its own commit.

8. **MAJOR — STILL OPEN, test gap: Run recovery assumes a successful save and read.**  
   [runEngine-4.3.test.ts:83](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts:83) dispatches `pagehide` and waits for a successful save in an in-memory database. **Counterexample:** `readLiveRun` rejects once and Start becomes available while the original run remains stored; a process can also die without `pagehide`.  
   **Tests to add:** Reject the recovery read once and assert Start stays unavailable until Retry succeeds. Separately, feed a known route in a persistent browser profile, wait for a confirmed autosave, kill the process without lifecycle events, and relaunch offline. Assert the route returns paused and the time away is recorded as a gap.

9. **MAJOR — STILL OPEN, test gap: The default UI suite skips part of the required device matrix.**  
   [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) selects only `@matrix` tests on Android and the 320-wide project unless `PW_FULL_MATRIX` is set. **Counterexample:** a Chromium-only recovery regression in an untagged spec passes the default suite.  
   **Exact fix and test:** Run every UI spec on all seven projects in the acceptance command. Add a CI assertion against Playwright’s test listing that every project selects the recovery and primary-flow tests.

10. **MINOR — STILL OPEN, test gap: Voice-pack assertions check metadata against metadata.**  
    [compose-4.4.test.ts:10](/Users/rabah/projects/anygym/src/lib/run/voice/__tests__/compose-4.4.test.ts:10) considers a clip shipped when its ID exists in the manifest. **Counterexample:** deleting a referenced audio file while retaining its manifest entry leaves the assertion green, while the offline cue can fail.  
    **Test to add:** Verify every manifest file exists, is nonempty and decodes. In a built-app browser test, warm the voice cache, go offline and play a representative multi-clip cue.

11. **MINOR — STILL OPEN, test gap: The SPEC 13 monkey suite omits Run.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25) includes neither Run start nor a live run. **Counterexample:** random interactions leave a live run locked or unresponsive while the suite stays green.  
    **Test to add:** Add seeded 90-second cases for Run start and a live run with simulated GPS. Assert no console errors, then use the UI to unlock, pause and end the run on every matrix device.

12. **MINOR — STILL OPEN, test gap: Monkey “swipes” use mouse drags.**  
    [monkey.ts:175](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:175) drives swipes with `page.mouse`. **Counterexample:** broken touch panning or `touch-action` leaves a phone screen stuck while mouse dragging passes.  
    **Test to add:** Use an engine-supported touch gesture driver. First assert that a touch swipe changes the scroll position of a known scrollable screen, then exercise swipe navigation on each required engine.

No files were edited. I inspected the tests and current code but did not run the suites or the earlier reproductions.