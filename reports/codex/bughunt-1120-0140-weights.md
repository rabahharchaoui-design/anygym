The most direct weight risks are shared machine settings, a unit-change race, and a failed-set retry that can save a different load from the one displayed. The findings below were reported earlier and are **STILL OPEN** in the current source.

1. **MAJOR — STILL OPEN: Retry can save a different load from the displayed row.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   After a save fails, the row is rebuilt using current equipment settings, but Retry submits the stored draft. An earlier report reproduced a row showing **125 lb on a women’s bar** while Retry saved **135 lb on an Olympic bar** after the bar choice changed.  
   **Exact fix:** Display and retry the same canonical submitted payload, including its equipment snapshot. A confirmed correction must replace both the displayed draft and the journal with a new revision.

2. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If another app context’s journal write fails, a submitted set can remain only in the durable draft mirror. Finish checks journals and held corrections without reconciling that mirror, so it can close the workout without the lift.  
   **Exact fix:** Admit submissions under the session lock. In the Finish transaction, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build Undo from the reconciled state.

3. **MAJOR — STILL OPEN: Rapid checks can leave one set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes start. If those writes overlap, the second can receive the first row’s promise and appear successful without its own set being written. An earlier audit reproduced the queue interleaving; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each only after its own write commits.

4. **MAJOR — STILL OPEN: Recovery can discard different unsaved weight and reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   App contexts allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft with different values can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads regardless of revision order and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN: Different cable stations share one equipment setting.**  
   [exerciseLoad.ts:57](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:57)  
   Every exercise with “cable” in its name uses `cable_station`. If two stations have different stack increments, configuring one changes the picker for the other. The app can offer and save a pin weight unavailable on the station the user is using.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

6. **MAJOR — STILL OPEN: A pending dumbbell-range edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:35](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:35)  
   The range setter receives numbers without their originating unit. If the gym changes to kg before a pending **5–50 lb** edit commits, those numbers can be stored as **5–50 kg**, causing the picker to offer the wrong weights.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear the range fields and cached `lastRange` when the gym unit changes.

7. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: Stack add-ons can cause a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

9. **MAJOR — STILL OPEN: A failed run-recovery read permits a new run.**  
   [runEngine.ts:189](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:189)  
   A storage read failure is treated as though there is no run to recover. Starting another run can replace the live snapshot and make the unfinished route unreliable to recover.  
   **Exact fix:** Represent recovery failure separately from “no active run,” offer Retry, and block starting until the check succeeds. Store snapshots by run ID and enforce one active run transactionally.

10. **MINOR — STILL OPEN: Total lifted can undercount work performed on each side.**  
    [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14)  
    Saved sets do not record whether reps were performed per side. If **20 lb × 10** means ten reps on each arm, the displayed total is **200 lb** rather than **400 lb**. The app cannot distinguish that from ten reps total.  
    **Exact fix:** Let the user specify and snapshot the repetition-count mode with the set, then include the number of performed sides in volume calculations.

This was a read-only review; no files were edited. I checked the current source for these previously reported paths, but did not rerun the earlier reproductions or verify storage-failure and race conditions on an iPhone.