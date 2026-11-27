The highest-risk issues can lose a checked set or run recovery data, or save a weight different from the one displayed. The findings below concern completed features and were reported before; the relevant code paths remain **STILL OPEN**.

This was a read-only review of the cited paths and tests. I did not run the suites or reproduce the storage and timing failures in this session, so the race-dependent findings retain that qualification.

## Application findings

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks the journal and held corrections, but does not reconcile a submitted row held only in the durable draft mirror. If its journal write failed in another app context, Finish can save the workout without that set.  
   **Exact fix:** Register submissions under the session lock. At Finish, reconcile submitted durable drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

2. **MAJOR — STILL OPEN: A failed recovery read can jeopardize an unfinished run.**  
   [runEngine.ts:249](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:249) treats a storage error as no run to restore. Starting another run can overwrite the shared snapshot in [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37), compromising recovery of the earlier route.  
   **Exact fix:** Distinguish a read failure from an empty result, offer Retry, and block Start until recovery succeeds. Key snapshots by run ID and enforce one active run transactionally.

3. **MAJOR — STILL OPEN: Retry can save a different weight from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72) rebuilds a failed row for display using current equipment settings, while [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69) retries the stored draft. An earlier audit reproduced **125 lb displayed after a bar change while Retry saved 135 lb**.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. Replace both only when the user confirms a correction.

4. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175) compares payloads only when revisions match. Separate contexts can allocate revisions independently, so a lower-revision draft containing values that never saved can be discarded against a higher-revision receipt.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN, timing-dependent: Rapid checks may acknowledge an unsaved set.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55) can claim distinct rows before their deferred writes begin. If the writes overlap, [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77) returns the first write’s promise to the second without executing the second write. An earlier audit reproduced the queue interleaving; I’m not sure ordinary phone taps can reach the required timing.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own write commits.

6. **MAJOR — STILL OPEN: Different cable stations share one setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58) assigns every cable exercise the same machine key. At a gym with stations using different stack increments, configuring one changes the picker for the other, potentially offering a pin weight unavailable on the station in use.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for an exercise, and associate its settings and saved loads with that ID.

7. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137) compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target despite the increase.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

## Test blind spots

8. **MAJOR — STILL OPEN: Run recovery tests give the app a save that a killed process may never get.**  
   The Vitest test dispatches `pagehide` and waits for it at [runEngine-reload-4.4d.test.ts:29](/Users/rabah/projects/anygym/src/hooks/__tests__/runEngine-reload-4.4d.test.ts:29); the Playwright test performs a normal reload at [verify-4.3.spec.ts:390](/Users/rabah/projects/anygym/tests/verify-4.3.spec.ts:390). A process killed without lifecycle events could lose its route while both pass.  
   **Exact test to add:** In a persistent browser profile, start a run with deterministic GPS positions, wait for a confirmed periodic autosave, kill the browser process without `pagehide`, and relaunch offline. Assert the saved route returns paused and resuming records a gap without counting the time away. Separately inject a failed recovery read and assert Start remains unavailable until Retry succeeds.

9. **MAJOR — STILL OPEN: The default suite omits required device coverage.**  
   [playwright.config.ts:47](/Users/rabah/projects/anygym/playwright.config.ts:47) restricts Android and the 320-wide project to `@matrix` tests unless an environment variable is set. An untagged recovery flow could fail at 320 px while the default suite passes, contrary to SPEC 13.3–13.4.  
   **Exact test and fix:** Run the acceptance suite with `PW_FULL_MATRIX=1` in CI. Add a discovery check comparing applicable Playwright test IDs across all seven projects, including primary and recovery flows, and audit explicit skips.

10. **MAJOR — STILL OPEN: Monkey tests do not exercise touch swipes or Run.**  
    [monkey.ts:183](/Users/rabah/projects/anygym/tests/helpers/monkey.ts:183) uses mouse drags, and [monkey.spec.ts:25](/Users/rabah/projects/anygym/tests/monkey.spec.ts:25) has no Run case. Broken touch panning or a live run stuck in pocket lock could pass.  
    **Exact test to add:** Run seeded 90-second cases on Run start and a live run with simulated GPS on every matrix device. Use an engine-supported touch driver for touch-start/move/end, assert a chosen gesture changes scroll position or page, then unlock, pause, and end through the UI without console errors.

11. **MAJOR — STILL OPEN: The migration fixture repeats the schema implementation.**  
    [08-app-update-keeps-data.spec.ts:5](/Users/rabah/projects/anygym/tests/golden/08-app-update-keeps-data.spec.ts:5) imports current source schema definitions to construct the supposed previous database. If a historical definition changes alongside a migration, the fixture changes with it and can miss a failure opening a real older database.  
    **Exact test to add:** Check in an independently frozen previous-release database fixture or schema with representative records. Open it with the current build and assert the original sessions, sets, loads, and new-store behavior survive; do not derive the fixture from current `schema.ts`.

12. **MINOR — STILL OPEN: The plate test checks counts but not the plates drawn.**  
    [05-plate-math.spec.ts:15](/Users/rabah/projects/anygym/tests/golden/05-plate-math.spec.ts:15) checks the total, app-generated math text, and one plate per side after the first addition. A rendering defect could draw a 25 lb plate on one sleeve while the total still says 135 lb.  
    **Exact test to add:** Add 45 lb and 25 lb pairs, inspect each rendered sleeve’s plate identifiers and order independently, and assert both are `[45, 25]`. Independently calculate `45 + 2 × (45 + 25) = 185` and compare it with the visible total; repeat after removing the outer pair.