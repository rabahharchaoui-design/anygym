I found eight MAJOR issues in completed features. Each has been reported before and is **STILL OPEN** in the current source. The save and recovery findings depend on storage failures or concurrent use; I did not reproduce those conditions during this read-only review.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If another tab’s journal write fails, a submitted set can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so it can close the workout without the set.  
   **Exact fix:** Admit submissions under the session lock. In the Finish transaction, reconcile submitted drafts against commit and cancellation receipts, reject unresolved submissions, and build Undo from the reconciled state.

2. **MAJOR — STILL OPEN: Rapidly checking two rows can leave one set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes start. If their writes overlap, the second can receive the first row’s promise and appear successful without its own set being written. An earlier report reproduced the queue behavior; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can erase different unsaved weight and reps.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Tabs allocate revisions independently, but reconciliation compares payloads only when their revisions match. A lower-revision draft with different values can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads regardless of revision order.

4. **MAJOR — STILL OPEN: A failed run-recovery read permits a new run.**  
   [runEngine.ts:189](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:189)  
   A storage read failure is treated as though there is no run to recover. Starting another run can replace the live snapshot and make the unfinished route unreliable to recover.  
   **Exact fix:** Represent recovery failure separately from “no active run,” offer Retry, and block starting until the check succeeds. Store snapshots by run ID and enforce one active run transactionally.

5. **MAJOR — STILL OPEN: Retry can save a different load from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   The displayed failed row is rebuilt using current equipment settings, while Retry submits its stored draft. An earlier report reproduced a row showing **125 lb on a women’s bar** while Retry saved **135 lb on an Olympic bar** after the bar choice changed.  
   **Exact fix:** Display and retry one canonical submitted payload, including its equipment snapshot. An explicitly confirmed correction should replace both the draft and journal with a new revision.

6. **MAJOR — STILL OPEN: Different cable stations share one setting.**  
   [exerciseLoad.ts:57](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:57)  
   Every exercise with “cable” in its name uses the same machine key. If a gym has stations with different stack increments, configuring one changes the picker for the other; the app can offer and save a weight unavailable on the station used.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

7. **MAJOR — STILL OPEN: A pending equipment edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56)  
   The dumbbell-range setter receives numbers without their originating unit. If the gym changes to kg before a pending **5–50 lb** edit commits, those numbers can be stored as **5–50 kg**, producing an incorrect picker.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear the range fields and cached range when the gym unit changes.

8. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

This was a read-only source review; no files were edited. I did not rerun the earlier reproductions or test failure and race paths on a physical iPhone.