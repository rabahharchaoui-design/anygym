The current source still contains **seven save and recovery risks** reported in earlier audits, plus one possible concurrent-edit bug. The most serious can leave a checked set out of a finished workout or erase input that was never saved. All eight are **STILL OPEN**.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78), [useFinish.ts:76](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:76)  
   If a Log journal write fails in another tab, the submitted row can exist only in the durable draft mirror. Finish checks the journal and held edits, but not that mirror; it can finish without the set and clear recovery input.  
   **Exact fix:** Admit submissions under the session lock. In Finish’s transaction, reconcile durable submitted drafts against committed and cancelled submissions, reject unresolved submissions, and build the Undo snapshot from that reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks can leave one set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes start. If the writes overlap, the second receives the first row’s promise and can be marked successful even though its own set was not written. An earlier audit reproduced the queue behavior; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and mark each claim landed only after its own submission commits.

3. **MAJOR — STILL OPEN: Restart recovery can erase different unsaved values.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Tabs allocate revisions independently, but reconciliation discards a lower-revision draft without comparing its values with the committed receipt. A draft with different weight or reps can disappear even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or explicit causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation transactionally.

4. **MAJOR — STILL OPEN: Discard and Undo can report success while losing drafts.**  
   [discard.ts:10](/Users/rabah/projects/anygym/src/db/discard.ts:10), [discardWorkout.ts:15](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:15)  
   Discard can accept a workout whose failed submission exists only as a draft. Undo restores the session first and writes drafts separately without awaiting durable completion. If that write fails and iOS closes the app, Undo can have reported success while the restored workout is empty.  
   **Exact fix:** Reject discard while unresolved submissions or corrections exist. Persist the discard snapshot and restore the session, counter, drafts and associated live state in one transaction; report success only after commit.

5. **MAJOR — STILL OPEN: Logging can resurrect a removed draft.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge writes a clean cached draft back whenever its IndexedDB slot is absent, including when another tab deliberately removed it. Old values can reappear and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. If a failed edit is retained between those reads, it can be absent from both the backup’s saved sets and its retryable corrections. Restoring the backup gives the user the older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and suppression receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: An unresolved generated plan can change the workout prescription.**  
   [useWorkout.ts:166](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:166), [workoutFinish.ts:29](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:29)  
   Generated plan definitions live in tab-local memory. An older tab, or one whose registry read failed, can find a valid session without resolving its plan. It falls back to Quick workout targets and can finish without advancing the plan.  
   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`, include resolution failures in workout readiness, and block fallback and Finish for an unresolved plan. Resolve it again inside Finish’s transaction.

8. **MAJOR — STILL OPEN, possible bug: A stale “Keep deleted” action can remove a corrected set.**  
   [tombstones.ts:141](/Users/rabah/projects/anygym/src/db/tombstones.ts:141), [workoutSets.ts:116](/Users/rabah/projects/anygym/src/db/workoutSets.ts:116)  
   If a deletion is restored elsewhere and the set is then edited, an older cancellation can still delete the corrected set because editing leaves its restoration provenance intact. Whether that cancellation should win depends on the intended concurrent-edit policy.  
   **Exact fix if newer edits should survive:** Invalidate restoration provenance transactionally on edits and type changes, and reject a stale cancellation when the restored set has changed or has pending corrections.

This was a read-only source audit; no files were changed and no tests were run. I traced Log, Edit, Delete, Undo, Finish, update handling and restart recovery in source. I did not verify browser race timing, live service-worker activation, failed writes, or iOS termination on a physical phone; the cited earlier reproductions were not rerun.