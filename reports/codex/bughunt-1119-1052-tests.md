The highest-risk issues I found can leave a submitted set out of a finished workout or lose recovery data. All 12 findings below were reported earlier and remain **STILL OPEN** in the current source. I did not edit files or run the suites; the race and storage-failure scenarios are source findings, not fresh physical-device reproductions.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If another tab’s journal write fails, its submitted set can remain in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so the workout can finish without the lift.  
   **Exact fix:** Serialize submission admission and Finish under the session lock. During Finish, reconcile submitted drafts with commit and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from the reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks can leave one set unsaved.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes begin. The second can receive the first row’s in-flight promise and appear successful although its own set was not written. The earlier report reproduced the queue interleaving; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct IDs, and mark each claim landed only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard a different unsaved weight.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Tabs assign revisions independently, but recovery compares payload fingerprints only when revisions match. A pending **73 lb × 19** draft at revision 1 can be discarded against a receipt for **53 lb × 10** at revision 5.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or recorded causal history proves it was superseded. Preserve conflicting drafts regardless of revision order.

4. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:87](/Users/rabah/projects/anygym/src/db/backup.ts:87)  
   Held corrections are captured before the database snapshot. A failed correction retained between those reads can be absent from the backup, so restoring it brings back the older weight.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

5. **MAJOR — STILL OPEN: A failed run recovery is treated as no active run.**  
   [runEngine.ts:186](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:186)  
   A transient read or setup failure sets the engine ready to start a new run even if an unfinished run exists. Starting another can overwrite the single live snapshot and make the original run difficult to recover.  
   **Exact fix:** Represent recovery failure separately from an empty database, offer Retry, and block Start until the active-run check succeeds. Store snapshots by run ID and enforce one active run transactionally.

6. **MAJOR — STILL OPEN: The initial run-save failure is silent.**  
   [runEngine.ts:230](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:230)  
   If the first write fails, the catch sets `dirty` but does not set `autosaveFailed`. The runner receives no warning until a later save attempt also fails; an app kill in that interval can lose the run. Periodic failures now do raise a warning, so the earlier broader finding is only partly fixed.  
   **Exact fix:** Set the save-failure state when `startRunRow` rejects, show the warning immediately, retry, and clear it only once the latest run state is durably saved.

The following are test blind spots, each with a counterexample and a test to add:

7. **MAJOR — STILL OPEN: Most UI tests do not run on the full required device matrix by default.**  
   [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) filters Android and the 320-wide project to `@matrix` tests unless `PW_FULL_MATRIX` is set. **Counterexample:** a Chromium-only workout hard-kill regression passes the default suite because `kill.spec.ts` is not selected.  
   **Exact test/configuration change:** Run every UI spec on all seven projects in the acceptance command. Add a CI check of Playwright’s test listing that verifies every project selects the hard-kill and primary-flow tests.

8. **MAJOR — STILL OPEN: There is no hard-kill test for an active run.**  
   [kill.spec.ts:49](/Users/rabah/projects/anygym/tests/kill.spec.ts:49) hard-kills a workout; the run engine recovery test dispatches `pagehide` and waits for a save. **Counterexample:** a process dies without lifecycle events and restores the wrong route or handles the time away incorrectly.  
   **Exact test to add:** Start a run in a persistent profile, deliver a known route, wait for a confirmed autosave, hard-kill without lifecycle events, and relaunch offline. Assert the saved route and distance return, the run is paused, and resuming records the time away as a gap without counting its distance.

9. **MAJOR — STILL OPEN: Initial run-save and recovery-read failures are not covered.**  
   [runEngine-4.3.test.ts:7](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts:7) uses working in-memory IndexedDB. The newer periodic-save failure test does not cover the initial write or failed recovery read. **Counterexample:** `startRunRow` rejects, then the app is killed before the next save; the existing tests pass while the run disappears.  
   **Exact tests to add:** Reject `startRunRow` and assert an immediate visible unsaved warning and subsequent retry. Separately reject `readLiveRun` once and assert Start remains unavailable until Retry succeeds.

10. **MINOR — STILL OPEN: The voice-pack assertion checks metadata against metadata.**  
    [compose-4.4.test.ts:10](/Users/rabah/projects/anygym/src/lib/run/voice/__tests__/compose-4.4.test.ts:10) calls a clip shipped when its ID exists in the manifest. **Counterexample:** delete a referenced `.m4a` but leave its manifest entry; the test passes and the offline cue can fail.  
    **Exact test to add:** Iterate the manifest and verify every corresponding `public/voice` file exists, is nonempty and decodes. Add an offline browser test that plays a representative multi-clip cue from the built cache.

11. **MINOR — STILL OPEN: SPEC 13’s monkey coverage omits Run.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25) enumerates seven screens but neither Run start nor a live run. **Counterexample:** random swipes and control taps leave a live run locked or unresponsive without this suite exercising it.  
    **Exact test to add:** Add seeded 90-second monkey cases for Run start and a live run with simulated GPS. Assert no console errors and use the current UI to unlock, pause and end the run afterward on every matrix device.

12. **MINOR — STILL OPEN: Monkey “swipes” use mouse dragging rather than touch panning.**  
    [monkey.ts:175](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:175) uses `page.mouse` even on mobile projects. **Counterexample:** broken `touch-action` or native touch scrolling leaves a phone screen stuck while mouse drags and the test pass.  
    **Exact test to add:** Drive touch-start, move and end through an engine-supported touch driver. Include a known scrollable screen and assert that the gesture changes its scroll position, then exercise the app’s swipe navigation on each required engine.

This was a targeted read-only review, not an exhaustive audit of every historical report or source file. Physical iPhone behavior and the timing-dependent scenarios still need reproduction.