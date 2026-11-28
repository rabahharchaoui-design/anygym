The highest-risk open issues can lose workout input or make the saved weight differ from the weight shown. The findings below concern built features and were reported earlier; each is **STILL OPEN** in the current source.

This was a targeted, read-only review. I did not run the suites or reproduce the earlier failure-injection scenarios in this session, and I did not exhaustively review every source file, test, or historical report. Several saving issues require a storage failure, overlapping app contexts, or both.

### Application findings

1. **MAJOR — STILL OPEN: Finish can omit a checked set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks journals and held corrections, but not a submitted row held only in the durable draft mirror. If its journal write fails in another context, Finish can save the workout without that set.  
   **Fix:** Register submissions under the session lock. During Finish, reconcile submitted durable drafts against commit and cancellation receipts, refuse unresolved submissions, and include that state in the Undo snapshot.

2. **MAJOR — STILL OPEN: A failed read can jeopardize an unfinished run.**  
   [runEngine.ts:249](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:249) treats a recovery read error as no run to restore. Starting another run can overwrite the shared snapshot in [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37), compromising recovery of the earlier route.  
   **Fix:** Distinguish a read error from an empty result, offer Retry, and block Start until recovery succeeds. Key snapshots by run ID and enforce one active run transactionally.

3. **MAJOR — STILL OPEN: Retry can save a different weight from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72) rebuilds a failed row using current equipment settings, while [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69) retries the stored draft. An earlier report reproduced **125 lb displayed after a bar change while Retry saved 135 lb**.  
   **Fix:** Display and retry the same canonical submitted load, including its equipment snapshot. Replace both only after the user confirms a correction.

4. **MAJOR — STILL OPEN: Rapid checks can acknowledge an unwritten set.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55) claims a row before its deferred write begins; [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77) returns an existing exercise write’s promise even for a different submission ID. Two overlapping claims can therefore report success for one write. An earlier audit reproduced the queue interleaving; **I’m not sure ordinary phone taps can reach the required timing**.  
   **Fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each only after its own write commits.

5. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175) checks for a different payload only when revisions match. Contexts allocate revisions independently, so a lower-revision draft containing values that never saved can be discarded against a higher-revision receipt.  
   **Fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

6. **MAJOR — STILL OPEN: Discard and Undo can lose a failed submission.**  
   [discard.ts:10](/Users/rabah/projects/anygym/src/db/discard.ts:10) can consider a workout empty when a failed submission exists only as a draft. [discardWorkout.ts:21](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:21) restores the session and drafts separately and reports success without waiting for a durable draft write. A subsequent write failure and app kill can leave the restored workout without the input.  
   **Fix:** Refuse Discard while submissions or corrections are unresolved. Restore the session, counter, drafts and associated live state in one transaction, and report Undo success only after commit.

7. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210) can reinsert a clean cached draft when its IndexedDB slot is absent. With localStorage unavailable, that includes a draft deliberately removed in another context; old weight and reps can return as a pending row.  
   **Fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:87](/Users/rabah/projects/anygym/src/db/backup.ts:87) captures held corrections before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections; restoring the backup returns older values.  
   **Fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

### Test blind spots

9. **MAJOR — STILL OPEN: Run recovery tests allow a save that a killed process may never get.**  
   The Vitest test dispatches `pagehide` and waits in [runEngine-reload-4.4d.test.ts:29](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-reload-4.4d.test.ts:29); the Playwright test performs a normal reload in [verify-4.3.spec.ts:390](/Users/rabah/projects/anygym/tests/verify-4.3.spec.ts:390). **Counterexample:** iOS kills the process without a lifecycle event; both tests pass even if recovery fails.  
   **Test to add:** In a persistent browser profile, start a run with deterministic positions, wait for a confirmed periodic autosave, kill the browser process without `pagehide`, and relaunch offline. Assert the saved route returns paused and resuming records a gap without counting time away. Separately inject a recovery read failure and assert Start remains unavailable until Retry succeeds. A real iPhone kill test is still needed for iOS behavior.

10. **MAJOR — STILL OPEN: The default Playwright suite omits required device coverage.**  
    [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47) restricts Android and the 320-wide project to `@matrix` tests unless `PW_FULL_MATRIX` is set. **Counterexample:** an untagged recovery flow clips its primary action at 320 px while the default suite passes, contrary to SPEC 13.3–13.4.  
    **Test and fix:** Run the acceptance suite with `PW_FULL_MATRIX=1` in CI. Add a discovery check comparing applicable test IDs across all seven projects, and audit explicit skips.

11. **MAJOR — STILL OPEN: Monkey testing omits Run and substitutes mouse drags for touch swipes.**  
    [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25) has no Run case, and [monkey.ts:183](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:183) generates mouse events for swipes. **Counterexample:** touch panning or unlocking a live run breaks while the existing monkey tests pass.  
    **Test to add:** Run seeded 90-second cases on Run start and a live run with simulated GPS on every matrix device. Use touch start, move and end through an engine-supported driver; verify a gesture changes the page or scroll position, then unlock, pause and end through the UI without console errors.

12. **MAJOR — STILL OPEN: The migration fixture repeats the current schema implementation.**  
    [08-app-update-keeps-data.spec.ts:5](/Users/rabah/projects/anygym/tests/golden/08-app-update-keeps-data.spec.ts:5) imports current schema definitions to construct the supposed previous database. **Counterexample:** a historical definition changes alongside a migration, so the fixture changes too and misses a failure to open a real older database.  
    **Test to add:** Check in an independently frozen previous-release database fixture or schema with representative records. Open it with the current build and assert that sessions, sets and loads survive and the new store works; do not derive the fixture from current `schema.ts`.