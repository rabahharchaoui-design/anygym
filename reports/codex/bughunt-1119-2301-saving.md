The source still contains **seven previously reported save and recovery risks**. The first three can leave a checked set out of the saved workout or erase values that were never committed.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78), [useFinish.ts:76](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:76)  
   If a Log journal write fails in another app context, its submitted row can survive only in the durable draft mirror. Finish checks journals and held edits, but not that mirror. It can finish without the set and clear the recovery input.  
   **Exact fix:** Admit submissions under the session lock. In the Finish transaction, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from the reconciled state.

2. **MAJOR — STILL OPEN: Rapidly checking different rows can leave one set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can be claimed before their deferred writes start. If those writes overlap, the second receives the first row’s promise and can appear successful even though its own set was never written. An earlier report reproduced the queue interleaving; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own write commits.

3. **MAJOR — STILL OPEN: Restart reconciliation can erase different unsaved values.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   App contexts allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft with a different weight or rep count can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads regardless of revision order and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: Discard and Undo can report success while losing a failed submission.**  
   [discard.ts:10](/Users/rabah/projects/anygym/src/db/discard.ts:10), [discardWorkout.ts:15](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:15)  
   Discard can treat a workout as empty when a failed Log exists only as a draft. Undo restores the session and then writes its drafts separately, without waiting for durable completion. If that write fails and iOS kills the app, Undo can have reported success while the restored workout lacks the set input.  
   **Exact fix:** Refuse discard while submissions or corrections are unresolved. Persist the discard snapshot and restore the session, counter, drafts and associated live state in one transaction; report Undo success only after commit.

5. **MAJOR — STILL OPEN: Logging can resurrect a removed draft.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can put a clean cached draft back if its IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can reappear and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

6. **MAJOR — STILL OPEN: A backup can omit a retained edit.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and the retryable corrections. Restoring that backup returns the older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN, possible bug: A stale “Keep deleted” action can remove a corrected set.**  
   [tombstones.ts:141](/Users/rabah/projects/anygym/src/db/tombstones.ts:141), [workoutSets.ts:116](/Users/rabah/projects/anygym/src/db/workoutSets.ts:116)  
   If a deletion is undone elsewhere and the restored set is edited, an older cancellation can still delete the corrected set because the edit leaves its restoration provenance intact. An earlier report reproduced the deletion. Whether the cancellation should win depends on the intended policy for concurrent actions.  
   **Exact fix if the newer edit should survive:** Invalidate restoration provenance transactionally on edits and type changes, and reject stale cancellation when the restored set has changed or has pending corrections.

This was a read-only source audit; I made no edits and did not rerun tests or the earlier reproductions. I traced Log, Edit, Delete, Undo, Finish, update handling and restart recovery. The update guard checks for an active workout and treats a failed activity read as active; I did not verify actual service-worker timing or iOS termination on a physical phone. The race and failed-write scenarios above remain to be freshly exercised.