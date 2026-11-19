I found **10 MAJOR issues** in completed features. All appeared in earlier reports and the relevant source paths are still present. The most serious can lose submitted workout data or make a run unrecoverable.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a Log journal write fails in another tab, the submitted set can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so it can close the workout without the set.  
   **Fix:** Admit submissions under the session lock. In the Finish transaction, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build Undo from the reconciled state.

2. **MAJOR — STILL OPEN: Recovery can erase different unsaved values.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Tabs allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft with a different weight or rep count can be discarded even though its values were never saved.  
   **Fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads regardless of revision order.

3. **MAJOR — STILL OPEN: Rapidly checking two rows can leave one set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes begin. The second can receive the first row’s in-flight promise and appear successful without its own set being written. Earlier reports reproduced the queue behavior; the precise browser timing remains unverified.  
   **Fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own write commits.

4. **MAJOR — STILL OPEN: A failed run recovery is treated as no active run.**  
   [runEngine.ts:189](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:189), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37)  
   A storage read failure enables a new run even if an unfinished run exists. Starting it overwrites the shared live snapshot, making the original route unreliable to recover.  
   **Fix:** Represent recovery failure separately from “no active run,” offer Retry, and block a new start until the check succeeds. Store snapshots by run ID and enforce one active run transactionally.

5. **MAJOR — STILL OPEN: Discard and Undo can report success while losing drafts.**  
   [discard.ts:10](/Users/rabah/projects/anygym/src/db/discard.ts:10), [discardWorkout.ts:15](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:15)  
   Discard can accept a workout whose failed submission exists only as a draft. Undo restores the session before separately writing its drafts; if that write fails and the app closes, Undo can have reported success while the restored workout lacks the input.  
   **Fix:** Refuse discard while submissions or corrections are unresolved. Persist the discard snapshot and restore the session, counter, drafts and associated live state in one transaction; report success only after commit.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported sets and retryable corrections; restoring the backup returns the older values.  
   **Fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: Different cable stations share one setting.**  
   [exerciseLoad.ts:57](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:57)  
   All exercises named “cable” use one station key. At a gym with stations using different stack increments, configuring one changes the picker for the other, which can offer and save a pin weight unavailable on the machine used.  
   **Fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and key its settings and saved loads to that ID.

8. **MAJOR — STILL OPEN: A stale equipment edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30)  
   The range setter receives numbers without their originating unit. If the gym changes to kg before a pending **5–50 lb** edit saves, it can store the range as **5–50 kg**.  
   **Fix:** Pass the unit in which the range was entered and reject a mismatch inside the save transaction. Clear the range fields and cached `lastRange` when the gym unit changes.

9. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

10. **MAJOR — STILL OPEN: A removed draft can reappear.**  
    [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
    When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another tab deliberately removed it. Old weight and reps can reappear and be logged again.  
    **Fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

This was a read-only source review; no files were edited and no tests were run. I did not freshly reproduce the race and storage-failure scenarios or test on a physical iPhone, so this review does not establish that small-screen or accessibility flows are free of bugs.