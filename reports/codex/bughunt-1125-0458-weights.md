The most direct weight error is in failed-save recovery: a row can display one load while Retry saves another. I found nine issues in completed features that remain **STILL OPEN** from earlier reports. Several depend on storage failures or overlapping app contexts; those conditions are called out below.

1. **MAJOR — STILL OPEN: Retry can save a different weight from the row shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   A failed row is rebuilt for display using current equipment settings, while Retry submits its stored load. An earlier audit reproduced **125 lb displayed on a women’s bar while Retry saved 135 lb on an Olympic bar** after the bar choice changed. Machine starting resistance can cause the same divergence.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. A confirmed correction should replace both the displayed draft and submission payload with a new revision.

2. **MAJOR — STILL OPEN: Finish can omit a checked set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   Finish checks the journal and held corrections, but does not reconcile submitted rows in the durable draft mirror. If a Log journal write fails in another app context, the workout can finish without that submitted lift.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile submitted durable drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

3. **MAJOR — STILL OPEN: Recovery can discard different unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate app contexts allocate revisions independently, but reconciliation checks for a different payload only when revisions match. It can discard a lower-revision draft containing values that were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN, timing-dependent: Rapid checks can acknowledge an unsaved set.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes begin. If the writes overlap, the second submission can receive the first row’s successful promise without its own write running. An earlier audit reproduced the queue interleaving; **I’m not sure ordinary phone taps can reach the required timing**.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own write commits.

5. **MAJOR — STILL OPEN: Different cable stations share one setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58)  
   Every exercise whose name contains “cable” uses the same machine key. If a gym has stations with different stack increments, configuring one changes the picker for the other. The app can offer and save a pin weight unavailable on the station in use.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

6. **MAJOR — STILL OPEN: A dumbbell-range edit can reinterpret pounds as kilograms.**  
   [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30), [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56)  
   The screen caches range numbers without their unit, and the setter does not check the unit in which they were entered. After a unit change, a cached **5–50 lb** range can be stored as **5–50 kg**, misrepresenting the dumbbells available for selection.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear or revalidate the fields and cached range when the gym unit changes.

7. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: A backup can omit a retained weight correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections. Restoring the backup then returns the older weight.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals, and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

9. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although recorded resistance increased from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

This was a read-only source review; no files were edited. I traced weight construction, equipment settings, logging and recovery, but did not rerun the earlier failure-injection reproductions or test concurrent contexts on a physical iPhone. The review does not establish that every possible weight error has been found.