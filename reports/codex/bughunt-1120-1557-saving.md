I found eight **MAJOR** save and recovery risks in built features. All were reported earlier and are **STILL OPEN** in the current source. Several require a failed write or two app contexts; the rapid-check issue also depends on timing that has not been verified in a browser.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78), [useFinish.ts:76](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:76). If another app context’s Log journal write fails, its submitted row can remain only in the durable draft mirror. Finish checks journals and held edits, but not that mirror. It can finish without the set and clear its recovery input.  
   **Exact fix:** Register submissions under the session lock. In the Finish transaction, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from that reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks can leave a set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77). Two different rows can be claimed before their deferred writes begin. If the writes overlap, the second can receive the first row’s promise without its own set being written. An earlier report reproduced the queue interleaving; whether normal phone interaction reaches it remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163). Separate app contexts allocate revisions independently, but reconciliation compares payloads only when revisions match. A lower-revision draft with different values can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: Retry can save a different load from the one shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69). The failed row is displayed using current equipment settings, while Retry submits its stored draft. An earlier audit reproduced a row showing **125 lb on a women’s bar** while Retry saved **135 lb on an Olympic bar** after the bar choice changed.  
   **Exact fix:** Display and retry the same canonical submitted payload, including its equipment snapshot. An explicitly confirmed correction should replace both the displayed draft and journal with a new revision.

5. **MAJOR — STILL OPEN: Discard and Undo can report success while losing a failed submission.**  
   [discard.ts:10](/Users/rabah/projects/anygym/src/db/discard.ts:10), [discardWorkout.ts:15](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:15). Discard can treat a workout as empty when a failed Log exists only as a draft. Undo restores the session and writes drafts separately without waiting for durable completion. If that write fails and iOS kills the app, Undo can have reported success while the restored workout lacks the set input.  
   **Exact fix:** Refuse discard while submissions or corrections are unresolved. Persist the discard snapshot and restore the session, counter, drafts and associated live state in one transaction; report Undo success only after commit.

6. **MAJOR — STILL OPEN: Logging can resurrect a removed draft.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194). When localStorage is unavailable, the durable merge can put a clean cached draft back if its IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can reappear and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

7. **MAJOR — STILL OPEN: A backup can omit a retained edit.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82). Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and retryable corrections. Restoring the backup returns the older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

8. **MAJOR — STILL OPEN, possible bug: A stale “Keep deleted” action can remove a corrected set.**  
   [tombstones.ts:141](/Users/rabah/projects/anygym/src/db/tombstones.ts:141), [workoutSets.ts:116](/Users/rabah/projects/anygym/src/db/workoutSets.ts:116). If a deletion is undone elsewhere and the restored set is edited, an older cancellation can still delete the corrected set because the edit leaves its restoration provenance intact. An earlier audit reproduced the deletion. Whether the older cancellation should win depends on the intended policy for concurrent actions.  
   **Exact fix if the newer edit should survive:** Invalidate restoration provenance transactionally on edits and type changes, and reject stale cancellation when the restored set has changed or has pending corrections.

This was a read-only source audit; I made no edits and did not rerun the earlier reproductions or inject storage failures. I traced Log, Edit, Delete, Undo, Finish, update handling and restart recovery. The update guard checks for an active workout and treats a failed activity read as active, but I did not verify service-worker timing or termination on a physical iPhone.