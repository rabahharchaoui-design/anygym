The highest-impact findings can lose a run or submitted set. The weight-specific findings I could confirm in the current source concern a unit race, stack recommendations, and volume for per-side reps. All findings below were reported previously and are **STILL OPEN**.

1. **BLOCKER — STILL OPEN: Restore can erase an active run.**  
   [backup.ts:125](/Users/rabah/projects/anygym/src/db/backup.ts:125), [backup.ts:145](/Users/rabah/projects/anygym/src/db/backup.ts:145)  
   Restore checks for an active workout but not an active run. Replace can clear the run’s saved row; if the app closes before the next save, the route can be lost.  
   **Exact fix:** Coordinate run start and restore; refuse either restore mode while a run is active, including when its first write failed. Check durable runs in the restore transaction and exclude unfinished runs from imported backups.

2. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If another tab’s journal write fails, a submitted lift can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so it can finish without saving the set.  
   **Exact fix:** Admit submissions under the session lock. In Finish’s transaction, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build Undo from the reconciled state.

3. **MAJOR — STILL OPEN: Rapid checks can leave a set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes start. The second can receive the first row’s in-flight promise and appear successful although its own set was never written. The earlier report reproduced the queue behavior; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and mark each claim landed only after its own submission commits.

4. **MAJOR — STILL OPEN: Recovery can discard a different unsaved weight.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Tabs allocate revisions independently, but a lower-revision draft is discarded without comparing its payload with the committed receipt. A pending **73 lb × 19** can disappear against a saved **53 lb × 10**, even though the former was never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or explicit causal history proves it was superseded. Preserve conflicting drafts regardless of revision order.

5. **MAJOR — STILL OPEN: A stale equipment edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:35](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:35)  
   The range setter does not receive the unit in which the range was entered. If another tab changes the gym to kg before a pending **5–50 lb** dumbbell range saves, it can be accepted as **5–50 kg**. The picker can then offer and save weights that do not describe the gym’s dumbbells.  
   **Exact fix:** Pass the range’s originating unit to the setter and reject a mismatch inside its transaction. Clear the range fields and cached `lastRange` when the unit changes.

6. **MAJOR — STILL OPEN: A backup can omit a retained weight correction.**  
   [backup.ts:75](/Users/rabah/projects/anygym/src/db/backup.ts:75)  
   Held corrections are captured before the database snapshot. A correction retained between those reads can be absent from the export, leaving the older set weight after restore.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge reinserts a clean cached draft whenever its IndexedDB slot is absent, including when another tab deliberately removed it. Old weight and reps can reappear and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137)  
   The plateau check compares pin values without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

9. **MAJOR — STILL OPEN: Failed run saves are invisible.**  
   [runEngine.ts:77](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:77)  
   Save failures set a retry flag but do not warn the runner. If storage remains unavailable and iOS closes the app, the run and route can disappear without warning.  
   **Exact fix:** Expose initial and autosave failures in engine state, show a persistent actionable warning, keep retrying, and clear the warning only after the latest state is durably saved.

10. **MINOR — STILL OPEN: Total lifted undercounts reps prescribed per side.**  
    [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14), [hotel-gym-3-day.json:196](/Users/rabah/projects/anygym/data/plans/hotel-gym-3-day.json:196)  
    Saved sets do not record whether reps were performed per side. A single-arm row of **20 lb × 10 per arm** contributes **200 lb** to the displayed total instead of **400 lb**.  
    **Exact fix:** Snapshot the repetition-count mode with the set and include the number of performed sides in volume calculations.

I reviewed the existing reports and source without editing files. I did not run tests or verify race timing, storage failures, or behavior on a physical iPhone. The earlier single-horn finding is excluded: the current implementation asks for an unknown horn count and snapshots it with the load.