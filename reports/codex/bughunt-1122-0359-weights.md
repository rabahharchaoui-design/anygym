1. **MAJOR — STILL OPEN: Retry can save a different weight from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   After a Log fails, the row is rebuilt with current equipment settings, but Retry submits the stored draft. An earlier report reproduced **125 lb displayed on a women’s bar while Retry saved 135 lb on an Olympic bar** after the bar choice changed.  
   **Exact fix:** Display and retry the same canonical submitted load, including its bar and equipment snapshot. A confirmed correction must replace both the displayed draft and submission payload with a new revision.

2. **MAJOR — STILL OPEN: Different cable stations share one equipment setting.**  
   [exerciseLoad.ts:57](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:57)  
   Every exercise whose name contains “cable” uses the same machine key. If a gym has stations with different stack increments, configuring one changes the picker for the other; the app can offer and save a pin weight unavailable on the station the user is using.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

3. **MAJOR — STILL OPEN: A dumbbell-range edit can change pounds into kilograms.**  
   [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30), [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56)  
   The screen caches range numbers without their unit, and the setter does not check the unit in which they were entered. After a unit change, a pending or cached **5–50 lb** range can be stored as **5–50 kg**, making the picker misrepresent available dumbbells.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear or revalidate the fields and cached range when the gym unit changes.

4. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a Log journal write fails in another app context, the checked row can remain only in the durable draft mirror. Finish checks journals and held corrections but does not reconcile that mirror, so it can finish without the submitted lift.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from the reconciled state.

5. **MAJOR — STILL OPEN, timing-dependent: Rapid checks can acknowledge a set without saving it.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can be claimed before their deferred writes begin. If the writes overlap, the second can receive the first row’s successful promise without its own write running. An earlier audit reproduced the queue interleaving; I cannot confirm that normal phone interaction reaches this timing.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own write commits.

6. **MAJOR — STILL OPEN: Recovery can discard different unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate app contexts allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft containing different values can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

7. **MAJOR — STILL OPEN: A backup can omit a retained weight correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections; restoring the backup returns the older weight.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

8. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

9. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance rose from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

10. **MINOR — STILL OPEN: Total lifted can undercount reps performed on each side.**  
    [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14)  
    Sets do not record whether reps were performed per side. If **20 lb × 10** means ten reps on each arm, the displayed total is **200 lb** rather than **400 lb**; the app cannot distinguish that from ten reps in total.  
    **Exact fix:** Let the user specify the repetition-count mode, snapshot it with the set, and include the performed sides in volume calculations.

This was a read-only source review of built features. I did not edit files, rerun the earlier reproductions, inject storage failures, or test concurrent-context timing on a physical iPhone.