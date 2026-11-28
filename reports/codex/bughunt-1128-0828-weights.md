The most direct weight mismatch is in failed-save recovery: a row can display one load while Retry saves another. The findings below concern completed features and were reported earlier; the relevant paths remain **STILL OPEN** in the current source.

1. **MAJOR — STILL OPEN: Retry can save a different weight from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   A failed row is rebuilt for display using current equipment settings, but Retry submits the stored draft. An earlier audit reproduced **125 lb displayed on a women’s bar while Retry saved 135 lb on an Olympic bar**. A changed machine starting resistance can cause the same discrepancy.  
   **Exact fix:** Display and retry the same canonical submitted load, including its bar, collars, machine starting resistance and horn count. Replace that snapshot only when the user confirms a correction.

2. **MAJOR — STILL OPEN: Different cable stations share one equipment setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58)  
   Every exercise with “cable” in its name uses the same machine key. If a gym has stations with different stack increments, configuring one changes the picker for the other. The app can offer and save a pin weight unavailable on the station being used.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, allow the user to choose it for the exercise, and associate its settings and saved loads with that ID.

3. **MAJOR — STILL OPEN: A dumbbell range can be reinterpreted in the wrong unit.**  
   [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30), [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56)  
   The equipment screen caches range numbers without their unit, and the setter does not check the unit in which they were entered. If the gym unit changes while that screen is open, a cached **5–50 lb** range can be stored as **5–50 kg**. The picker can then offer weights the gym does not have.  
   **Exact fix:** Store the unit with the cached range, pass the entry unit to the setter, and reject a mismatch inside its transaction. Clear or revalidate cached values when the unit changes.

4. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a Log journal write fails in another app context, the submitted row can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so the finished workout can omit the lifted set.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

5. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate app contexts allocate revisions independently, but reconciliation checks for differing payloads only when revisions match. A lower-revision draft containing values that never saved can be discarded against a higher-revision receipt.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or recorded causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

6. **MAJOR — STILL OPEN: A removed draft can reappear and be logged.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return as a pending row and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

7. **MAJOR — STILL OPEN: A backup can omit a retained weight correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections. Restoring that backup returns the older weight.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

8. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although the recorded resistance increased from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation using complete resistance.

This was a read-only source review; no files were edited. I checked the earlier weight and saving reports against the current code and traced the load constructors, settings, logging and recovery paths. I did not rerun the prior failure-injection reproductions or test concurrent contexts on a physical iPhone, so their real-device timing remains unverified.