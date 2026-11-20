The highest-risk weight bug is a failed set that can **show one load and save another on Retry**. I found the following issues in completed features; each was reported in an earlier Codex audit and remains open in the current source.

1. **MAJOR — STILL OPEN: Retry can save a different bar and weight from the row shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69). After a save fails, the row is rebuilt using current equipment settings, while Retry submits the stored draft. An earlier audit reproduced **125 lb displayed on a women’s bar but 135 lb saved on an Olympic bar** after the bar choice changed.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. When the user confirms a correction, replace both the displayed draft and journal payload with a new revision.

2. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78). If a journal write fails in another app context, a checked set can remain only in the durable draft mirror. Finish checks journals and held corrections but does not reconcile that mirror, so it can close the workout without the lift.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build Undo from the reconciled state.

3. **MAJOR — STILL OPEN: Rapid checks can leave one set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77). Two rows can be claimed before their deferred writes start. If their writes overlap, the second can receive the first row’s successful promise without its own set being written. The queue interleaving was reproduced in an earlier report; whether ordinary phone interaction reaches it remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each only after its own write commits.

4. **MAJOR — STILL OPEN: Recovery can discard different unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163). Separate app contexts allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft with different values can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN: Different cable stations share one equipment setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58). Every exercise with “cable” in its name uses the same machine key. If two stations have different stack increments, configuring one changes the picker for the other. The app can offer and save a pin weight unavailable on the station being used.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

6. **MAJOR — STILL OPEN: A dumbbell-range edit can change pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30). The setter receives range numbers without their originating unit, and the screen caches a range without its unit. A pending or cached **5–50 lb** range can be stored as **5–50 kg** after a unit change, producing a misleading picker.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear the range fields and cached range when the gym unit changes.

7. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194). When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: A failed run-recovery read permits a new run.**  
   [runEngine.ts:216](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:216), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37). A storage read failure is treated as no run to recover. Starting another run can replace the shared live snapshot, making the unfinished route unreliable to recover.  
   **Exact fix:** Represent recovery failure separately from an empty database, offer Retry, and block Start until the read succeeds. Store snapshots by run ID and enforce one active run transactionally.

9. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82). Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections, so restoring the backup returns the older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

10. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
    [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134). The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance rose from **125 to 150 lb**.  
    **Exact fix:** Compare complete saved loads using `sameResistance()` and format the explanation from complete resistance.

11. **MINOR — STILL OPEN: Total lifted can undercount reps performed on each side.**  
    [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14). Sets do not record whether reps were performed per side. If **20 lb × 10** means ten reps on each arm, the displayed total is **200 lb** rather than **400 lb**; the app cannot distinguish that from ten reps total.  
    **Exact fix:** Let the user specify and snapshot the repetition-count mode with the set, then include the number of performed sides in volume calculations.

This was a read-only source review; no files were edited. I did not rerun the earlier reproductions or test storage failures and concurrent-context timing on an iPhone. Those scenarios remain qualified accordingly.