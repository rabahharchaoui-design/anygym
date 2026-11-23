The most direct weight error is a failed set that can show one load and save another on Retry. The findings below concern built features and were reported previously; the relevant code paths are **still open**.

1. **MAJOR — STILL OPEN: Retry can save a different weight from the row shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   After a save fails, the row is rebuilt using current equipment settings, while Retry submits the stored draft. An earlier audit reproduced **125 lb displayed on a women’s bar but 135 lb saved on an Olympic bar** after the bar choice changed. The same divergence can affect other equipment settings.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. A confirmed correction must replace both the displayed draft and submission payload with a new revision.

2. **MAJOR — STILL OPEN: Different cable stations share one setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58)  
   Every exercise named “cable” uses the same machine key. If two stations have different stack increments, configuring one changes the picker for the other. The picker can offer, and the user can save, a pin weight unavailable on the station being used.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

3. **MAJOR — STILL OPEN: A dumbbell-range edit can reinterpret pounds as kilograms.**  
   [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30), [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56)  
   The screen caches range numbers without their unit, and the setter does not check the unit in which they were entered. After a unit change, a pending or cached **5–50 lb** range can be stored as **5–50 kg**, causing the picker to misrepresent the available dumbbells.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear or revalidate the fields and cached range when the gym unit changes.

4. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a Log journal write fails in another app context, the submitted row can remain only in the durable draft mirror. Finish checks journals and held corrections but does not reconcile that mirror, so the finished workout can omit the lift.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from the reconciled state.

5. **MAJOR — STILL OPEN, timing-dependent: Rapid checks can acknowledge a set without saving it.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can be claimed before their deferred writes begin. If the writes overlap, the second can receive the first row’s successful promise without its own write running. An earlier audit reproduced the queue interleaving; whether normal phone taps can reach it remains unverified.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own write commits.

6. **MAJOR — STILL OPEN: Recovery can discard different unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate app contexts allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft containing different values can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

7. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: A backup can omit a retained weight correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections; restoring the backup returns the older weight.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

9. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although the recorded resistance rose from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

This was a read-only source review; no files were edited. I did not rerun the earlier reproductions or test storage failures and concurrent-context timing on a physical iPhone.