The highest-risk open issues can erase an active run or leave a submitted set unsaved. All product findings below were reported earlier and are **still open** in the current source.

1. **BLOCKER — STILL OPEN: Restoring a backup can erase an active run.**  
   [backup.ts:125](/Users/rabah/projects/anygym/src/db/backup.ts:125), [backup.ts:145](/Users/rabah/projects/anygym/src/db/backup.ts:145)  
   Restore checks for an active workout, but not an active run. A replace restore can clear the run’s stored row; if the app closes before another save, the route can be lost.  
   **Exact fix:** Coordinate run start and restore, including an in-memory run whose initial save failed. Refuse both restore modes while a run is active, check durable runs inside the restore transaction, and exclude unfinished runs from imported backups.

2. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83)  
   If another tab’s journal write fails, its submitted row can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so the workout can finish without the lift.  
   **Exact fix:** Admit submissions under the session lock. During Finish, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and construct the Undo snapshot from the reconciled state.

3. **MAJOR — STILL OPEN: Rapid checks on two rows can leave one set unsaved.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Distinct rows can be claimed before their deferred writes start. The second submission can receive the first row’s in-flight promise and appear successful without saving its own set. The earlier report reproduced the queue interleaving; its timing through the browser UI remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and mark a claim landed only when its own write commits.

4. **MAJOR — STILL OPEN: Recovery can discard a different unsaved weight.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Tabs assign revisions independently, but recovery compares payload fingerprints only when revisions match. A pending 73 lb × 19 draft at revision 1 can be consumed by a receipt for a different 53 lb × 10 set at revision 5.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or recorded causal history proves it was superseded. Preserve conflicting drafts regardless of revision order.

5. **MAJOR — STILL OPEN: Failed run saves are invisible during the run.**  
   [runEngine.ts:75](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:75), [runEngine.ts:174](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:174)  
   Initial and periodic save failures set a retry flag without warning the runner. If storage remains unavailable and iOS closes the app, the run and route can disappear.  
   **Exact fix:** Expose save failures in engine state, show a persistent actionable warning, retry, and clear the warning only after the latest state is durably saved. Use an independent durable fallback where available.

6. **MAJOR — STILL OPEN: A failed run restore is treated as an empty database.**  
   [runEngine.ts:144](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:144)  
   A transient read failure enables a new run even if an unfinished one exists. Starting again can overwrite the single live snapshot, making the original run difficult to recover.  
   **Exact fix:** Represent restore failure separately from “no active run,” offer Retry, and block Start until the check succeeds. Store snapshots by run ID and enforce one active run transactionally.

**Test blind spots**

7. **MAJOR — STILL OPEN: Most UI tests do not run on the full required matrix.**  
   [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) filters Android and the 320-wide project to `@matrix` tests by default. **Counterexample:** a Chromium-only hard-kill recovery regression can pass the default suite because `kill.spec.ts` is not selected.  
   **Exact test/configuration change:** Make the acceptance command run every UI spec on all seven projects. Add a CI check against Playwright’s test listing that verifies each project selects the hard-kill and primary-flow tests.

8. **MAJOR — STILL OPEN: Run storage failures are absent from the engine tests.**  
   [runEngine-4.3.test.ts:7](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-4.3.test.ts:7) uses working in-memory IndexedDB; its restore case waits for a successful save before reopening. **Counterexample:** the initial write rejects, the runner continues, and the app is killed before storage recovers—the test remains green while the run disappears.  
   **Exact test to add:** Reject `startRunRow` and `saveLiveRun`, assert an immediate visible unsaved warning, then restart a fresh engine and verify recovery or an explicit recovery failure. Separately reject `readLiveRun` once and assert Start remains unavailable until Retry succeeds.

9. **MAJOR: The hard-kill test covers workouts, but not the SPEC 13 mid-run case.**  
   [kill.spec.ts:49](/Users/rabah/projects/anygym/tests/kill.spec.ts:49) kills a persistent browser mid-workout. The run test uses a reload, and the engine test explicitly dispatches `pagehide` and waits for the save. **Counterexample:** a process dies without `pagehide`, leaving the latest run snapshot or gap handling incorrect.  
   **Exact test to add:** Start a run in a persistent profile, deliver a known route, wait for a confirmed autosave, hard-kill the browser without lifecycle events, and relaunch offline. Assert the saved route and distance return, the run is paused, and resuming after the time away records a gap without counting its distance.

10. **MINOR — STILL OPEN: The voice-pack “shipped” assertion checks the manifest against itself.**  
    [compose-4.4.test.ts:10](/Users/rabah/projects/anygym/src/lib/run/voice/__tests__/compose-4.4.test.ts:10) treats a clip as shipped when its ID is in the manifest. **Counterexample:** remove a referenced `.m4a` while retaining its manifest entry; the test passes, but an offline cue can fail.  
    **Exact test to add:** Iterate the manifest and verify every corresponding `public/voice` file exists, is nonempty, and decodes. Add an offline browser test that plays a representative multi-clip cue from the built cache.

11. **MINOR — STILL OPEN: The monkey suite omits Run.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25) lists seven screens but neither Run start nor an active run. **Counterexample:** random swipes and control taps leave a live run locked or unresponsive without this suite exercising it.  
    **Exact test to add:** Add seeded 90-second monkey cases for Run start and a live run with simulated GPS. After each, assert no console errors and use the current UI to unlock, pause, and end the run on every matrix device.

This was a read-only review; I did not edit files or run the suites. The race and storage-failure paths were checked in source, not freshly reproduced on a physical iPhone.