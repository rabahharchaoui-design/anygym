I found **8 MAJOR issues** in completed features. All were reported earlier and are still present in the current source. The highest-risk cases involve submitted sets or weight corrections being lost under storage failures or concurrent use.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If another tab’s journal write fails, a submitted set can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so it can save the workout without the set.  
   **Exact fix:** Admit submissions under the session lock. In Finish’s transaction, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from the reconciled state.

2. **MAJOR — STILL OPEN: Recovery can erase a different unsaved weight and reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Tabs assign revisions independently, but reconciliation checks for conflicting values only when revisions match. A lower-revision draft can therefore be discarded against a receipt for a different set, even though its values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or explicit causal history proves it was superseded. Preserve conflicting drafts regardless of revision order.

3. **MAJOR — STILL OPEN: Rapid checks can leave a set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes begin. The second submission can receive the first row’s in-flight promise and appear successful without writing its own set. An earlier report reproduced the queue behavior; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and mark each claim landed only after its own submission commits.

4. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported sets and retryable corrections; restoring the backup then returns the older weight or reps.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

5. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another tab removed it. Old weight and reps can reappear and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

6. **MAJOR — STILL OPEN: An unresolved generated plan can change the workout prescription.**  
   [useWorkout.ts:166](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:166), [workoutFinish.ts:29](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:29)  
   Plan definitions are registered in tab-local memory. An older tab, or one whose registry read failed, can find a valid session without resolving its generated plan. It can fall back to Quick workout targets and finish without advancing the plan.  
   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`; treat a failed or unresolved lookup as a retryable error and block fallback and Finish. Resolve the plan again inside Finish’s transaction.

7. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares stack pin values without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

8. **MAJOR — STILL OPEN: A stale equipment edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:35](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:35)  
   The dumbbell-range setter receives numbers without the unit in which they were entered. If another tab changes the gym to kg before a pending **5–50 lb** edit saves, it can store **5–50 kg** and offer weights that do not describe the gym’s equipment.  
   **Exact fix:** Pass the originating unit to the setter and reject a mismatch inside its transaction. Clear the range fields and cached range when the gym unit changes.

This was a read-only source review; I changed no files and ran no tests. The concurrency and storage-failure scenarios need fresh browser and physical-iPhone verification. I excluded earlier run-restore, stale-pace and wake-lock findings that the completed 4.4b work says were fixed.