I found eight issues in completed features. All were reported previously and are **STILL OPEN** in the current source. Several require a storage failure or overlapping app contexts.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks the journal and held corrections, but does not reconcile submitted rows in the durable draft mirror. If a Log journal write fails in another app context, Finish can save the workout without that set.  
   **Exact fix:** Register submissions under the session lock. At Finish, reconcile submitted durable drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

2. **MAJOR — STILL OPEN: A failed run-recovery read allows a new run.**  
   [runEngine.ts:226](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:226) treats a storage error as though there were no unfinished run. Starting another run can overwrite the single live snapshot in [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37), compromising recovery of the earlier route.  
   **Exact fix:** Represent recovery failure separately from an empty result, offer Retry, and block Start until recovery succeeds. Store snapshots by run ID and enforce one active run transactionally.

3. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163) compares payloads when revisions match, but separate app contexts can allocate different revisions independently. A lower-revision draft with different values can be discarded even though those values never committed.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: Retry can save a different load from the one shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72) rebuilds the displayed row using current equipment settings, while [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69) retries the stored draft. An earlier report reproduced **125 lb displayed on a women’s bar while Retry saved 135 lb on an Olympic bar** after the bar choice changed.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. An explicitly confirmed correction should replace both with a new revision.

5. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82) captures held corrections before reading the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections, so restoring the backup returns older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

6. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194) can merge a clean cached draft back when its IndexedDB slot is absent. If localStorage is unavailable and another context deliberately removed the draft, old weight and reps can return as a pending row and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

7. **MAJOR — STILL OPEN: A dumbbell-range edit can change pounds into kilograms.**  
   [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30) caches range numbers without their unit, and [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56) accepts them without checking their originating unit. After a unit change, a cached **5–50 lb** range can be saved as **5–50 kg**, misrepresenting the available dumbbells.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear or revalidate the fields and cached range when the gym unit changes.

8. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134) compares pin values without add-ons. Two hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

This was a read-only source review; I made no edits. I checked these findings against the current code but did not rerun the earlier reproductions, inject storage failures, or test small-screen and VoiceOver behavior on a physical iPhone.