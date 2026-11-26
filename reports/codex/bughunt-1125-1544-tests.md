The highest-risk open issues can lose workout or run data, or show a weight different from the one saved. The findings below are limited to completed work in `PLAN.md`; **STILL OPEN** means the issue was reported earlier and its relevant code path remains present.

This was a read-only source and test review. I did not run the test suites or reproduce the timing and storage-failure scenarios on a phone, so the impacts below are based on the code paths and, where noted, earlier reproductions.

1. **MAJOR — STILL OPEN: Finish can omit a checked set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks the journal and held corrections, but does not reconcile submitted rows that exist only in the durable draft mirror. If a Log journal write fails in another app context, Finish can save the workout without the checked set.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile submitted durable drafts against commit and cancellation receipts, refuse unresolved submissions, and include that state in the Undo snapshot.

2. **MAJOR — STILL OPEN: Retry can save a different weight from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72) rebuilds the displayed row using current equipment settings, while [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69) retries the stored draft. An earlier audit reproduced 125 lb displayed after a bar change while Retry saved the original 135 lb.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. A confirmed correction must replace both with a new revision.

3. **MAJOR — STILL OPEN: A failed recovery read permits another run.**  
   [runEngine.ts:241](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:241) treats a storage error as no unfinished run. Starting a new run writes the shared snapshot key in [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37), jeopardizing recovery of the earlier route.  
   **Exact fix:** Distinguish a failed read from an empty result, offer Retry, and block Start until recovery succeeds. Key snapshots by run ID and enforce one active run transactionally.

4. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175) compares draft and receipt payloads only when their revisions are equal. Separate contexts can allocate revisions independently, so a lower-revision draft with different values can be consumed even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN: Rapid checks may acknowledge a set without saving it.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34) can claim distinct rows before their deferred writes begin. If they overlap, [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77) returns the first write’s promise to the second without executing the second write. An earlier audit reproduced the queue interleaving; **I’m not sure ordinary phone taps can reach the timing**.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own commit.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:87](/Users/rabah/projects/anygym/src/db/backup.ts:87) captures held corrections before reading the database snapshot. A failed edit retained between those reads can be absent from both the exported set and the retryable corrections, so restoring the backup returns older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals, and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: Stack add-ons can produce a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137) compares pin values without add-ons. Two hard workouts at 100 + 25 lb and 100 + 50 lb can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

**Test blind spots**

8. **MAJOR — STILL OPEN: The recovery tests provide a successful save that a killed app may never get.**  
   [runEngine-reload-4.4d.test.ts:29](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-reload-4.4d.test.ts:29) dispatches `pagehide` and waits for saving; [verify-4.3.spec.ts:390](/Users/rabah/projects/anygym/tests/verify-4.3.spec.ts:390) reloads normally. A process killed without lifecycle events could lose its route despite both passing.  
   **Exact test to add:** In a persistent browser profile, start a run with deterministic GPS positions, wait for a confirmed periodic autosave, kill the browser process without `pagehide`, and relaunch offline. Assert the saved route returns paused and resuming records a gap without counting the time away. Also inject one failed recovery read and assert Start stays unavailable until Retry succeeds. The existing workout process-kill tests provide a starting harness.

9. **MAJOR — STILL OPEN: The default UI suite omits much of the required device matrix.**  
   [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) runs only `@matrix` tests on Android and the 320-wide project by default. An untagged recovery flow can pass on iPhone while failing at 320 px without the default suite exercising it, contrary to SPEC §13.3–13.4.  
   **Exact fix and test:** Run the acceptance suite with `PW_FULL_MATRIX=1` in CI. Add a discovery check that compares the applicable Playwright test IDs across all seven projects, including recovery and primary-flow tests, and audits internal skips.

10. **MAJOR — STILL OPEN: The monkey test does not exercise native touch swipes or Run.**  
    [monkey.ts:183](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:183) sends mouse drags for swipes; the current monkey cases omit the Run screen. Broken touch panning or a live run stuck in pocket lock could therefore pass.  
    **Exact test to add:** Run seeded 90-second cases on Run start and a live run with simulated GPS on every matrix device. Generate touch-start/move/end gestures with an engine-supported touch driver; assert a chosen scroll or page gesture actually changes position, then unlock, pause, and end through the UI without console errors.

11. **MAJOR — Migration test constructs its old database from the implementation under test.**  
    [08-app-update-keeps-data.spec.ts:5](/Users/rabah/projects/anygym/tests/golden/08-app-update-keeps-data.spec.ts:5) imports schema definitions from the current source to construct the “previous” database. If a historical definition is accidentally changed alongside a migration, the fixture changes with it and can miss a failure opening a real older database.  
    **Exact test to add:** Check in an independently frozen previous-version database fixture or schema and representative records, created by the actual prior release. Open it with the current build and assert the original session, sets, loads, and new-store behavior survive. Do not derive the fixture’s schema from current `schema.ts`.

12. **MINOR — STILL OPEN: The plate UI test checks counts, not the drawn plate values.**  
    [05-plate-math.spec.ts:15](/Users/rabah/projects/anygym/tests/golden/05-plate-math.spec.ts:15) checks the total, the app-generated `data-math`, and one plate per side after the first addition. A rendering bug could draw a 25 lb plate on one sleeve while the total and math text still say 45 lb.  
    **Exact test to add:** Add 45 lb and 25 lb pairs, inspect each rendered sleeve’s plate identifiers and order independently, and assert both are `[45, 25]`; independently calculate `45 + 2 × (45 + 25) = 185` and compare it with the visible total. Repeat after removing the outer pair.