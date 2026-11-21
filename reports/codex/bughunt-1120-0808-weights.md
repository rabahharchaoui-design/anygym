The most consequential weight finding is that a failed set can show one load and save another on Retry. I also found risks in equipment settings and in recovery of submitted weights. All findings below were reported earlier and are **STILL OPEN** in the current source.

1. **MAJOR — STILL OPEN: Retry can save a different weight and bar from the row shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   After a save fails, the displayed row is rebuilt using current equipment settings, but Retry submits the stored draft. An earlier reproduction showed **125 lb on a women’s bar** while Retry saved **135 lb on an Olympic bar**.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. If the user confirms a correction, replace both the displayed draft and the journal payload with a new revision.

2. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If another app context’s submission journal write fails, the checked set can exist only in the durable draft mirror. Finish checks journals and held corrections but does not reconcile that mirror, so the finished workout can lack the lift.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile submitted drafts against commit and cancellation receipts, refuse to finish while any are unresolved, and build Undo from the reconciled state.

3. **MAJOR — STILL OPEN: Rapid checks can leave one set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can be claimed before their deferred writes begin. If the writes overlap, the second can receive the first row’s promise and appear successful without its own set being written. The earlier report reproduced the queue interleaving; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each only after its own write commits.

4. **MAJOR — STILL OPEN: Recovery can discard a different unsaved weight or rep count.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   App contexts allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft containing different values can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN: Different cable stations share one equipment setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58)  
   Every exercise with “cable” in its name uses the same machine key. If two stations have different stack increments, configuring one changes the picker for the other. The app can offer and save a pin weight unavailable on the station being used.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

6. **MAJOR — STILL OPEN: A pending dumbbell-range edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:35](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:35)  
   The range setter receives numbers without their originating unit. If the gym changes to kg before a pending **5–50 lb** edit commits, it can store **5–50 kg**, producing an incorrect picker.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear the range fields and cached range when the gym unit changes.

7. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance rose from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

9. **MINOR — STILL OPEN: Total lifted can undercount reps performed on each side.**  
   [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14)  
   Sets do not record whether reps were performed per side. If **20 lb × 10** means ten reps on each arm, the displayed total is **200 lb** instead of **400 lb**. The app cannot distinguish that from ten reps total.  
   **Exact fix:** Let the user specify and snapshot the repetition-count mode with the set, then include the number of performed sides in volume calculations.

This was a read-only source review; no files were edited. I did not rerun the earlier reproductions or test the storage-failure and concurrent-context scenarios on an iPhone, so those timing-dependent findings retain that qualification.