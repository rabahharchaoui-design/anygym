The most direct weight error is a failed set that can **show one bar and total, then save another on Retry**. I found nine issues in built features. Each was reported previously and remains open in the current source.

1. **MAJOR — STILL OPEN: Retry can save a different weight from the row shown.** [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   After a save fails, the row is rebuilt using current equipment settings, but Retry submits the stored draft. An earlier report reproduced **125 lb displayed on a women’s bar while Retry saved 135 lb on an Olympic bar** after the bar choice changed.  
   **Fix:** Display and retry the same submitted load and equipment snapshot. A confirmed correction must replace both the displayed draft and submission payload with a new revision.

2. **MAJOR — STILL OPEN: Finish can omit a submitted set.** [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a journal write fails in another app context, a checked set can remain only in the durable draft mirror. Finish checks journals and held corrections but does not reconcile that mirror, so the finished workout can omit the lift.  
   **Fix:** Register submissions under the session lock. During Finish, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in Undo.

3. **MAJOR — STILL OPEN, timing-dependent: Rapid checks can leave a set unsaved.** [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can be claimed before their deferred writes begin. If the writes overlap, the second can receive the first row’s successful promise without its own set being written. An earlier audit reproduced the queue interleaving; I have not established whether normal phone interaction reaches it.  
   **Fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, and queue distinct submissions until each has committed.

4. **MAJOR — STILL OPEN: Recovery can discard different unsaved weight or reps.** [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate app contexts allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft with different values can be discarded even though those values were never saved.  
   **Fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN: Different cable stations share one setting.** [exerciseLoad.ts:57](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:57)  
   Every exercise named “cable” uses the same machine key. If stations have different stack increments, configuring one changes the choices for the other; the picker can offer and save a pin weight that is unavailable on the station being used.  
   **Fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

6. **MAJOR — STILL OPEN: A dumbbell-range edit can change pounds into kilograms.** [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30)  
   The setter receives range numbers without their originating unit, and the screen caches a range without its unit. After a unit change, a pending or cached **5–50 lb** range can be stored as **5–50 kg**, producing a misleading picker.  
   **Fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear or revalidate the fields and cached range when the gym unit changes.

7. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.** [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row.  
   **Fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: A backup can omit a retained weight correction.** [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections; restoring the backup returns the older values.  
   **Fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

9. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.** [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance rose from **125 to 150 lb**.  
   **Fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

10. **MINOR — STILL OPEN: Total lifted can undercount repetitions performed on each side.** [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14)  
    Sets do not record whether reps were performed per side. If **20 lb × 10** means ten reps on each arm, the displayed total is **200 lb** rather than **400 lb**; the app cannot distinguish that from ten reps in total.  
    **Fix:** Let the user specify the repetition-count mode, snapshot it with the set, and include the performed sides in volume calculations.

This was a read-only source review. I did not edit files, rerun the earlier reproductions, or test storage failures and concurrent-context timing on a physical iPhone.