The most direct weight risks are shared machine settings, a stale unit on equipment edits, and a failed-save retry that can save a different load from the one displayed. All findings below were reported earlier and remain present in the current source.

1. **MAJOR — STILL OPEN: Different cable stations share one equipment setting.**  
   [exerciseLoad.ts:57](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:57) assigns every exercise with “cable” in its name to `cable_station`. If two stations at the same gym have different stack increments, configuring one changes the picker for the other. The app can offer and save a pin weight unavailable on the machine used.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

2. **MAJOR — STILL OPEN: A pending dumbbell-range edit can change pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:35](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:35). The range setter receives numbers without their originating unit. If the gym changes to kg before a pending **5–50 lb** edit commits, those numbers can be stored as **5–50 kg**. The picker can then offer weights that do not represent the available dumbbells.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear the range fields and `lastRange` when the gym unit changes.

3. **MAJOR — STILL OPEN: Retry can save a different weight and bar from the displayed row.**  
   [useExerciseRows.ts:76](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:76), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69). A failed row is displayed after rebuilding it with current equipment settings, but Retry submits its stored draft. An earlier report reproduced a row showing **125 lb on a women’s bar** while Retry saved **135 lb on an Olympic bar** after the bar choice changed.  
   **Exact fix:** Display and retry one canonical submitted payload, including its equipment snapshot. An explicitly confirmed correction should replace both the draft and journal with a new revision.

4. **MAJOR — STILL OPEN: Rapidly checking two rows can leave one set unsaved.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77). Two distinct rows can be claimed before their deferred writes start; the second submission can receive the first row’s in-flight promise instead of writing its own set. The earlier report reproduced the queue behavior, though the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each only after its own write commits.

5. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78). If another tab’s journal write fails, a submitted lift can remain only in the durable draft mirror. Finish checks journals and held corrections without reconciling that mirror, so it can close the workout without the set.  
   **Exact fix:** Admit submissions under the session lock. In the Finish transaction, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build Undo from the reconciled state.

6. **MAJOR — STILL OPEN: Recovery can erase a different unsaved weight.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170). Tabs allocate revisions independently, but reconciliation compares payloads only when revisions match. A pending **73 lb × 19** at a lower revision can be discarded against a saved **53 lb × 10**, although those pending values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads regardless of revision order.

7. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194). When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another tab deliberately removed it. Old weight and reps can return as a pending row.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: Stack add-ons can cause a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134). The plateau check compares pin values without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, even though resistance increased from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

9. **MINOR — STILL OPEN: Total lifted can undercount work performed on each side.**  
   [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14). Saved sets do not record whether reps were performed per side. If **20 lb × 10** means ten reps on each arm, the displayed total is **200 lb** rather than **400 lb**. The app cannot distinguish that from ten reps in total.  
   **Exact fix:** Let the user specify and snapshot the repetition-count mode with the set, then include the number of performed sides in volume calculations.

This was a read-only source review; no files were edited. I did not rerun the earlier reproductions or test the race and storage-failure paths on an iPhone.