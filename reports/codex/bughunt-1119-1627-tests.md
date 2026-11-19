The highest-risk open paths can lose a submitted set or make an unfinished run difficult to recover. The findings below were reported previously and are **STILL OPEN** in the source I inspected. The timing and storage-failure scenarios are source-review findings; I did not reproduce them in a browser or on an iPhone.

### Product findings

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If another tab’s journal write fails, a checked set can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so it can close the workout without the set.  
   **Exact fix:** Serialize submission admission and Finish under the session lock. In the Finish transaction, reconcile submitted drafts against commit and cancellation receipts, reject unresolved submissions, and build the Undo snapshot from the reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks can leave a set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes start. When they overlap, the second can receive the first row’s promise and appear successful without its own set being written. The queue interleaving was reproduced in an earlier audit; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct IDs, and mark each claim successful only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard a different unsaved weight.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Tabs assign revisions independently, but recovery compares fingerprints only when revisions match. A draft of **73 lb × 19** at revision 1 can be discarded against a receipt for **53 lb × 10** at revision 5, even though the draft’s values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or recorded causal history proves it was superseded. Preserve conflicting payloads regardless of revision order.

4. **MAJOR — STILL OPEN: Failed run recovery permits a new run.**  
   [runEngine.ts:189](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:189), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37)  
   A transient storage read or setup failure is treated as “no active run.” Starting another run can replace the single live snapshot, making the original route difficult to recover.  
   **Exact fix:** Represent recovery failure separately from an empty database, offer Retry, and block Start until the active-run check succeeds. Store snapshots by run ID and enforce one active run transactionally.

5. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. If a failed correction is retained between those reads, it can be absent from both the saved set and the exported retryable corrections. Restoring the backup returns the older weight.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

6. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without add-ons. Two hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

### Test blind spots

7. **MAJOR — STILL OPEN: The queue tests miss the overlapping distinct-row path.**  
   [logQueue.test.ts:55](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:55), [logQueue.test.ts:209](/Users/rabah/projects/anygym/src/lib/__tests__/logQueue.test.ts:209)  
   The first test submits row 2 only after row 1 completes; the second tests claims with independent callbacks rather than the real `submit` path. **Counterexample:** two distinct claims reach `submit` while row 1’s write is blocked; row 2 receives row 1’s success without being saved.  
   **Test to add:** Gate row 1’s real `submitRow` write, submit row 2 before releasing it, then release both. Assert two distinct IDs and their respective values exist in IndexedDB, and neither claim reports success before its own commit.

8. **MAJOR — STILL OPEN: Run recovery tests mock away failed reads and process death.**  
   [runEngine-4.3.test.ts:83](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts:83)  
   The test dispatches `pagehide` and waits for a successful save using in-memory IndexedDB. **Counterexample:** a process dies without lifecycle events, or `readLiveRun` rejects once; a new run is allowed while the old run still exists.  
   **Tests to add:** Reject the recovery read once and assert Start stays unavailable until Retry succeeds. Separately, start a run in a persistent browser profile, feed a known route, wait for a confirmed autosave, kill the process without lifecycle events, and relaunch offline. Assert the saved route returns paused and the time away is a gap.

9. **MAJOR — STILL OPEN: Most UI tests do not run on the full required matrix by default.**  
   [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45)  
   Android and the 320-wide project select only `@matrix` tests unless `PW_FULL_MATRIX` is set. **Counterexample:** a Chromium-only workout recovery regression in `kill.spec.ts` passes the default suite because that spec is not selected there.  
   **Exact change and test:** Run every UI spec on all seven projects in the acceptance command. Add a CI assertion against Playwright’s test listing that every project selects the hard-kill and primary-flow tests.

10. **MINOR — STILL OPEN: The voice-pack test checks metadata against metadata.**  
    [compose-4.4.test.ts:10](/Users/rabah/projects/anygym/src/lib/run/voice/__tests__/compose-4.4.test.ts:10)  
    A clip counts as shipped when its ID is in the manifest. **Counterexample:** delete a referenced `.m4a` while leaving the manifest entry; the assertion passes, but an offline cue can fail.  
    **Test to add:** Verify every manifest file exists, is nonempty and decodes. In a built-app browser test, warm the voice cache, go offline, and play a representative multi-clip cue.

11. **MINOR — STILL OPEN: The monkey suite omits Run.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25)  
    The screen list includes neither Run start nor a live run. **Counterexample:** random swipes and control taps leave a run locked or unresponsive while the suite remains green.  
    **Test to add:** Add seeded 90-second cases for Run start and a live run with simulated GPS. Assert no console errors, then use the UI to unlock, pause and end the run on every matrix device.

12. **MINOR — STILL OPEN: Monkey “swipes” are mouse drags.**  
    [monkey.ts:175](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:175)  
    Mobile projects use `page.mouse` for swipes. **Counterexample:** broken touch panning or `touch-action` leaves a phone screen stuck while mouse dragging passes.  
    **Test to add:** Use an engine-supported touch gesture driver. First assert a touch swipe changes the scroll position of a known scrollable screen, then exercise swipe navigation on each required engine.

This was a targeted read-only review. No files were edited and I did not run the test suites or verify physical-device behavior.