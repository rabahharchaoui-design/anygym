I found **10 MAJOR issues** in completed features. Each appeared in an earlier report and is **STILL OPEN** in the current source. Several depend on storage failures or multiple app contexts; the rapid-check issue also depends on timing.

1. **MAJOR — STILL OPEN: Retry can save a different weight from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   A failed row is displayed using current equipment settings, but Retry submits its stored draft. An earlier report reproduced **125 lb displayed on a women’s bar while Retry saved 135 lb on an Olympic bar** after the bar choice changed.  
   **Fix:** Display and retry the same canonical submitted load, including its equipment snapshot. A confirmed correction should replace both with a new revision.

2. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a journal write fails in another app context, a checked set can remain in the durable draft mirror. Finish checks journals and held corrections but does not reconcile that mirror, so the finished workout can omit the set.  
   **Fix:** Register submissions under the session lock. During Finish, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in Undo.

3. **MAJOR — STILL OPEN, timing-dependent: Rapid checks can leave a set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can be claimed before their deferred writes start. If the writes overlap, the second can receive the first row’s successful promise without its own write running. An earlier report reproduced the queue interleaving; whether normal phone interaction reaches it remains uncertain.  
   **Fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own write commits.

4. **MAJOR — STILL OPEN: Recovery can discard different unsaved values.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate app contexts allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft with different weight or reps can therefore be discarded even though those values never saved.  
   **Fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN: A failed run-recovery read permits a new run.**  
   [runEngine.ts:216](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:216), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37)  
   A storage read failure is treated as no run to recover. Starting another run can replace the shared live snapshot, making the unfinished route unreliable to recover.  
   **Fix:** Represent recovery failure separately from an empty database, offer Retry, and block Start until the read succeeds. Store snapshots by run ID and enforce one active run transactionally.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections; restoring that backup returns older values.  
   **Fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row.  
   **Fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: A dumbbell-range edit can change pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30)  
   The setter receives range numbers without their originating unit, and the screen caches a range without its unit. A pending or cached **5–50 lb** range can be stored as **5–50 kg** after a unit change, producing a misleading picker.  
   **Fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear the range fields and cached range when the gym unit changes.

9. **MAJOR — STILL OPEN: Different cable stations share one equipment setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58)  
   Every exercise with “cable” in its name uses the same machine key. If stations have different stack increments, configuring one changes the picker for the other, which can offer a weight unavailable on the station in use.  
   **Fix:** Give each physical machine a stable gym-specific ID, let the user select it for an exercise, and associate its settings and saved loads with that ID.

10. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
    [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
    The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
    **Fix:** Compare complete saved loads using `sameResistance()` and format the explanation from complete resistance.

This was a read-only source review; I made no edits. I checked the reported paths against the current code but did not rerun the earlier reproductions, inject storage failures, or test small-screen and VoiceOver behavior on a physical iPhone.