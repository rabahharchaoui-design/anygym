I found **eight MAJOR issues** in completed features. All were reported previously and are **STILL OPEN** in the current source. The first four can lose a submitted set or save a different load from the one shown.

1. **MAJOR — STILL OPEN: Retry can save a different weight and bar from the row shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69). After a failed save, the row is rebuilt using current equipment settings, but Retry submits the stored draft. An earlier reproduction showed **125 lb on a women’s bar** while Retry saved **135 lb on an Olympic bar**.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. A confirmed correction must replace both the displayed draft and journal payload with a new revision.

2. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78). If another app context’s journal write fails, a checked set can remain only in the durable draft mirror. Finish checks journals and held corrections without reconciling that mirror, so it can close the workout without the lift.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build Undo from the reconciled state.

3. **MAJOR — STILL OPEN: Rapid checks can leave one set unsaved.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77). Two rows can be claimed before their deferred writes begin. If their writes overlap, the second can receive the first row’s promise without its own set being written. The queue interleaving was reproduced in an earlier report; whether ordinary phone interaction reaches it remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each only after its own write commits.

4. **MAJOR — STILL OPEN: Recovery can discard different unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163). Separate app contexts allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft with different values can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN: Different cable stations share one equipment setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58). Every exercise with “cable” in its name uses the same machine key. If two stations have different stack increments, configuring one changes the picker for the other; the app can offer and save a pin weight unavailable on the station being used.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

6. **MAJOR — STILL OPEN: A dumbbell-range edit can change meaning after a unit change.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30). The range setter receives numbers without their originating unit, and the screen caches a range without its unit. A pending or cached **5–50 lb** range can consequently be stored as **5–50 kg** after the gym changes units, producing a misleading picker.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear the range fields and cached range when the gym unit changes.

7. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194). When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134). The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance rose from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads using `sameResistance()` and format the explanation from complete resistance.

This was a read-only source review; no files were edited. I traced the load construction and relevant saving and display paths, including bar identity, units, plate inventory, machine starting resistance and horn count. I did not rerun the earlier reproductions or test the storage-failure and concurrent-context scenarios on an iPhone, so those timing-dependent findings retain that qualification.