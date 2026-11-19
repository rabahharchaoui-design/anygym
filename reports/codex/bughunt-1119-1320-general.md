The highest-risk issues I found can lose submitted workout data or let a new run overwrite recovery information. All findings below were reported earlier and are **STILL OPEN** in the inspected source.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If another tab’s Log journal write fails, the submitted set can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so it can close the workout without the set.  
   **Exact fix:** Admit submissions under the session lock. In the Finish transaction, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build Undo from the reconciled state.

2. **MAJOR — STILL OPEN: Recovery can erase different unsaved values.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Tabs allocate revisions independently, but reconciliation discards a lower-revision draft without comparing its weight and reps with the committed receipt. Values that were never saved can disappear.  
   **Exact fix:** Consume a draft only when its payload matches the committed payload or causal history proves it was superseded. Preserve conflicting payloads regardless of revision order.

3. **MAJOR — STILL OPEN: Rapid checks can leave a set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes begin. The second can receive the first row’s promise and appear successful even though its own set was not written. An earlier report reproduced the queue behavior; I did not verify the precise browser timing.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and mark each claim landed only after its own write commits.

4. **MAJOR — STILL OPEN: A failed run recovery is treated as no active run.**  
   [runEngine.ts:186](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:186)  
   A storage read failure enables a new run even if an unfinished run exists. Starting another can replace the live snapshot and make the original route unreliable to recover.  
   **Exact fix:** Represent recovery failure separately from “no active run,” offer Retry, and block a new start until the check succeeds. Store snapshots by run ID and enforce one active run transactionally.

5. **MAJOR — STILL OPEN: Discard and Undo can report success while losing drafts.**  
   [discard.ts:10](/Users/rabah/projects/anygym/src/db/discard.ts:10), [discardWorkout.ts:15](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:15)  
   Discard can accept a workout whose failed submission exists only as a draft. Undo restores the session before separately writing its drafts. If that write fails and the app closes, the restored workout can be empty despite Undo reporting success.  
   **Exact fix:** Refuse discard while submissions or corrections are unresolved. Persist the discard snapshot and restore the session, counter, drafts and live state in one transaction; report success only after commit.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the saved sets and retryable corrections, so restoring the backup returns the older weight.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: A stale equipment edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:35](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:35)  
   If another tab changes a gym to kg before a pending **5–50 lb** dumbbell range saves, the setter can accept that range as **5–50 kg**. The picker then offers weights that do not describe the equipment.  
   **Exact fix:** Pass the unit in which the range was entered to the setter and reject a mismatch inside its transaction. Clear the range fields and cached `lastRange` when the unit changes.

8. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft when its IndexedDB slot is absent, including after another tab deliberately removed it. Old weight and reps can reappear and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

9. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137)  
   The plateau check compares pin values without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

10. **MAJOR — STILL OPEN: An unresolved generated plan can change a workout’s prescription.**  
    [useWorkout.ts:166](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:166), [workoutFinish.ts:29](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:29)  
    An older tab or a failed plan-registry read can leave a valid session unable to resolve its generated plan. The workout can fall back to Quick workout targets and finish without advancing the plan.  
    **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`, include resolution failures in workout readiness, and block fallback and Finish for an unresolved plan. Resolve it again inside the Finish transaction.

This was a read-only source review; no files were edited. I did not rerun the earlier reproductions or test race timing, storage failures, VoiceOver, or physical iPhone behavior. The earlier active-run restore, old-pace, and run-autosave warning findings were excluded because the inspected source contains fixes for those reported paths.