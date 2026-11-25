The most direct weight error occurs after a failed save: the row can show one bar and total while Retry saves another. The findings below were reported earlier and remain **STILL OPEN** in the current source.

1. **MAJOR — STILL OPEN: Retry can save a different weight from the one shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   A failed row is rebuilt using current equipment settings, but Retry submits the stored draft. An earlier audit reproduced **125 lb displayed on a women’s bar while Retry saved 135 lb on an Olympic bar** after the bar choice changed. Machine starting weight and other settings can cause the same kind of divergence.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. A confirmed correction must replace both the displayed draft and submission payload with a new revision.

2. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   Finish checks journals and held corrections, but does not reconcile submitted rows in the durable draft mirror. If a Log journal write fails in another app context, Finish can save the workout without that lift.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile submitted durable drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

3. **MAJOR — STILL OPEN: A failed run-recovery read permits a new run.**  
   [runEngine.ts:241](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:241), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37)  
   A storage error is treated as though there is no unfinished run. Starting another can overwrite the single live snapshot, compromising recovery of the earlier route.  
   **Exact fix:** Distinguish a recovery failure from an empty result, offer Retry, and block Start until recovery succeeds. Store snapshots by run ID and enforce one active run transactionally.

4. **MAJOR — STILL OPEN, timing-dependent: Rapid checks can acknowledge a set without saving it.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can be claimed before their deferred writes begin. If writes overlap, the second can receive the first row’s successful promise without its own write running. An earlier audit reproduced the queue interleaving; whether ordinary phone taps reach it remains unverified.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own write commits.

5. **MAJOR — STILL OPEN: Recovery can discard different unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate app contexts allocate revisions independently, but reconciliation checks for different payloads only when revisions match. A lower-revision draft containing different values can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

6. **MAJOR — STILL OPEN: Different cable stations share one setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58)  
   Every exercise named “cable” uses the same machine key. If a gym has stations with different stack increments, configuring one changes the picker for the other; the app can offer and save a pin weight unavailable on the station being used.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

7. **MAJOR — STILL OPEN: A dumbbell-range edit can reinterpret pounds as kilograms.**  
   [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30), [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56)  
   The screen caches range numbers without their unit, and the setter does not check the unit in which they were entered. After a unit change, a cached **5–50 lb** range can be stored as **5–50 kg**, misrepresenting the available dumbbells.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear or revalidate the fields and cached range when the gym unit changes.

8. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

9. **MAJOR — STILL OPEN: A backup can omit a retained weight correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections; restoring the backup returns the older weight.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

10. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
    [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
    The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although the recorded resistance increased from **125 to 150 lb**.  
    **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

This was a read-only source review; no files were edited. I did not rerun the earlier reproductions, inject storage failures, or test concurrent-context timing on a physical iPhone.