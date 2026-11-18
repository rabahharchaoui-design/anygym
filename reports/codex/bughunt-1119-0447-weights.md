The highest-risk open defects can lose a submitted set or an active run. The weight audit also found paths that can misinterpret a dumbbell range, recommend the wrong stack resistance, or undercount total lifted.

1. **BLOCKER — STILL OPEN: Restoring a backup can erase an active run.**  
   [backup.ts:125](/Users/rabah/projects/anygym/src/db/backup.ts:125), [backup.ts:145](/Users/rabah/projects/anygym/src/db/backup.ts:145)  
   Restore checks for an active workout but not an active run. Replace can clear the run’s database row; if the app closes before another save, the route can be lost. A backup made during a run can also restore an unfinished run as active.  
   **Exact fix:** Coordinate run start and both restore modes. Refuse restore while a run is active, including one whose initial save failed; check durable runs inside the restore transaction and exclude unfinished runs from imported backups.

2. **MAJOR — STILL OPEN: Finishing can omit a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83)  
   If another tab’s journal write fails, a submitted set can exist only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so it can finish and clear recovery input without saving the lift.  
   **Exact fix:** Admit submissions under the session lock. In Finish’s transaction, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and use the reconciled state for Undo.

3. **MAJOR — STILL OPEN: Recovery can discard a different unsaved weight.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Tabs assign revisions independently, but a lower-revision draft is consumed without checking its payload against the saved receipt. A pending **73 lb × 19** can disappear against a saved **53 lb × 10**, even though the former was never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or explicit causal history proves it was superseded. Preserve conflicting drafts regardless of revision ordering.

4. **MAJOR — STILL OPEN: Rapid checks of different rows can leave one set unsaved.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can be claimed before their deferred writes start. The second submission can receive the first row’s in-flight promise and appear successful without writing its own set. The earlier report reproduced the queue behavior; browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and mark a claim landed only when its own submission commits.

5. **MAJOR — STILL OPEN: A stale equipment edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:35](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:35)  
   The dumbbell-range setter does not receive the unit in which the range was entered. If another tab changes the gym to kg before a pending **5–50 lb** range saves, it can be accepted as **5–50 kg**. The picker can then offer and save weights that do not describe the gym’s dumbbells.  
   **Exact fix:** Pass the originating unit to the setter and reject a mismatch inside its transaction. Clear the range fields and cached `lastRange` when the unit changes.

6. **MAJOR — STILL OPEN: A backup can omit a retained weight correction.**  
   [backup.ts:75](/Users/rabah/projects/anygym/src/db/backup.ts:75)  
   Held corrections are captured before the database snapshot. A correction retained between those reads can be absent from the export, leaving the older set weight after restore.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: Changing stack add-ons can trigger a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137)  
   The plateau check compares stack pins without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as hard twice at the same weight, prompting a lighter recommendation even though resistance rose from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

8. **MAJOR — STILL OPEN: Failed run saves are invisible.**  
   [runEngine.ts:75](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:75)  
   Save failures set a retry flag but do not warn the runner. If storage remains unavailable and iOS closes the app, the run and route can disappear without warning.  
   **Exact fix:** Expose initial and autosave failures in engine state, show a persistent actionable warning, keep retrying, and clear the warning only after the latest state is durably saved.

9. **MAJOR — STILL OPEN: Old pace remains visible after GPS stops.**  
   [runEngine.ts:89](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:89), [LiveStats.tsx:40](/Users/rabah/projects/anygym/src/screens/run/LiveStats.tsx:40)  
   GPS state changes on callbacks. If fixes stop arriving, the last rolling pace can remain displayed as current indefinitely.  
   **Exact fix:** Track the age of the last accepted fix on a bounded timer. After the GPS gap threshold, show `--` and a GPS-lost message, restart the watch, and restore pace only after valid fixes return.

10. **MAJOR — STILL OPEN: Loss of the run wake lock is not reported.**  
    [runWake.ts:26](/Users/rabah/projects/anygym/src/hooks/runWake.ts:26)  
    The engine reports the wake lock as on after acquisition but does not listen for a system release. The screen can lock without warning and interrupt GPS tracking.  
    **Exact fix:** Listen for each sentinel’s `release` event, update wake state, and request a new lock when visible and still wanted. Show the existing actionable warning if reacquisition fails.

11. **MINOR — STILL OPEN: Total lifted undercounts reps performed on each side.**  
    [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14)  
    Saved sets do not record whether reps were performed per side. A single-arm row of **20 lb × 10 per arm** contributes **200 lb** to the displayed total instead of **400 lb**.  
    **Exact fix:** Snapshot the repetition-count mode with the set and include the number of performed sides in volume calculations.

This was a read-only source review; I did not edit files or run tests. The earlier single-horn machine finding is excluded because the current implementation asks for the horn count and snapshots it. The race and storage-failure paths need fresh browser and iPhone verification; the cited prior reports’ reproductions were not rerun here.