The source review found **seven save-safety issues** in built workout flows. All were reported before and remain **STILL OPEN** in the current source. Most require a failed write, overlapping app contexts, or both.

1. **MAJOR — STILL OPEN: Finish can omit a checked set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78), [useFinish.ts:76](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:76)  
   If a Log journal write fails in another app context, the submitted row can remain in the durable draft mirror. Finish checks the journal and held edits but does not reconcile that mirror. It can finish without the set and clear recovery input.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

2. **MAJOR — STILL OPEN: Rapid checks can acknowledge a set without writing it.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes begin. If their writes overlap, the second can receive the first row’s successful promise without its own write running. An earlier audit reproduced the queue interleaving; **I’m not sure ordinary phone taps can reach the required timing**.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate contexts allocate revisions independently, but reconciliation checks for different payloads only when revisions match. A lower-revision draft with different values can be removed against a higher-revision receipt even though those values never committed.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: Discard and Undo can lose a failed submission.**  
   [discard.ts:10](/Users/rabah/projects/anygym/src/db/discard.ts:10), [discardWorkout.ts:15](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:15)  
   Discard can treat a workout as empty when a failed Log exists only as a draft. Undo restores the session and drafts separately and reports success without waiting for the draft’s durable write. If that write fails and iOS kills the app, the restored workout can lack the set input.  
   **Exact fix:** Refuse discard while submissions or corrections are unresolved. Persist the discard snapshot and restore the session, counter, drafts, and associated live state in one transaction; report Undo success only after commit.

5. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can reappear and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

6. **MAJOR — STILL OPEN: A backup can omit a retained edit.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections. Restoring that backup returns the older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals, and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN, possible bug: A stale “Keep deleted” action can remove a corrected set.**  
   [tombstones.ts:141](/Users/rabah/projects/anygym/src/db/tombstones.ts:141), [workoutSets.ts:116](/Users/rabah/projects/anygym/src/db/workoutSets.ts:116)  
   If a deletion is undone elsewhere and the restored set is edited, an older cancellation can still delete the corrected set because the edit leaves its restoration provenance intact. An earlier audit reproduced the deletion. Whether it is a bug depends on which concurrent action should win; PLAN SV3 specifies that the newer edit should survive.  
   **Exact fix:** Invalidate restoration provenance transactionally on edits and type changes, and reject stale cancellation when the restored set has changed or has pending corrections.

This was a read-only source audit. I traced Log, Edit, Delete, Undo, Finish, update handling, and restart recovery. I did not rerun prior reproductions, inject IndexedDB failures, or kill the app on a physical iPhone. The update guard treats a failed activity read as active, and startup blocks on a failed mirror restore; actual iOS and service-worker timing remain unverified.