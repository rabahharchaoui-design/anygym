I found **7 confirmed MAJOR findings and 1 possible MAJOR finding**, all previously reported and still present in the current source. The most serious paths can omit a submitted set or erase its recovery data after a storage failure.

1. **MAJOR — STILL OPEN: Finish can silently omit a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83), [useFinish.ts:79](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:79)  
   If another tab’s Log journal write fails, its submitted row can remain only in the durable draft mirror. Finish checks the journal and held corrections, but not that mirror, so it can finish and clear recovery input without saving the set. An earlier report reproduced an omitted 73 lb × 19 set.  
   **Exact fix:** Admit Log submissions under the session lock. In Finish’s transaction, reconcile durable submitted drafts against committed and cancelled submissions, reject unresolved ones, and build the Undo snapshot from that reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks of different rows can leave one unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can acquire claims before their deferred writes start. When the writes overlap, the second receives the first row’s promise. It can appear successful even though only the first set was saved; the second claim can then block further checks. The earlier report reproduced the queue behavior; browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue different IDs, and mark a claim landed only after its own submission commits.

3. **MAJOR — STILL OPEN: Recovery can erase another tab’s unsaved input.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Tabs assign revisions independently, but recovery treats a lower revision as superseded without checking whether its values match the receipt. A conflicting draft can disappear despite never having been saved. The earlier report reproduced a 73 lb × 19 draft disappearing against a receipt for different values.  
   **Exact fix:** Consume a draft only when payload evidence matches or explicit causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation transactionally.

4. **MAJOR — STILL OPEN: Discard → Undo can report success while losing drafts.**  
   [discard.ts:10](/Users/rabah/projects/anygym/src/db/discard.ts:10), [discardWorkout.ts:18](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:18)  
   Discard checks sets and journals but can accept a workout whose failed submission exists only as a draft. Undo restores the session first and writes drafts separately without awaiting durable completion. If that write fails and iOS closes the app, the restored workout is empty despite Undo having reported success.  
   **Exact fix:** Reject discard while unresolved submissions or corrections exist. Persist the discard snapshot and restore the session, counter, drafts, added rows and rest in one transaction; report success only after commit.

5. **MAJOR — STILL OPEN: Logging can resurrect a removed draft.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge puts a clean cached draft back whenever its IndexedDB slot is absent—even if another tab deliberately removed it. The old values can reappear and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence, and memory must be refreshed from the committed merge.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:75](/Users/rabah/projects/anygym/src/db/backup.ts:75)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the backup’s sets and its retryable corrections. Restoring that backup gives the user the older set values.  
   **Exact fix:** Read durable held corrections inside the same snapshot transaction as sets, journals and suppression receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: An unresolved generated plan can change the workout prescription.**  
   [useWorkout.ts:166](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:166), [workoutFinish.ts:30](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:30)  
   Plan definitions are registered in tab-local memory. An older tab, or a tab whose registry read failed, can see a valid session without resolving its generated plan. It falls back to Quick workout targets and can finish without advancing the plan.  
   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`, include resolution failures in workout readiness, and block fallback and Finish for an unresolved plan. Resolve it again inside Finish’s transaction.

8. **MAJOR — STILL OPEN, POSSIBLE BUG: A stale “Keep deleted” action can remove a corrected set.**  
   [tombstones.ts:141](/Users/rabah/projects/anygym/src/db/tombstones.ts:141), [workoutSets.ts:116](/Users/rabah/projects/anygym/src/db/workoutSets.ts:116)  
   If a deletion is restored elsewhere and the set is successfully edited, an older cancellation can still delete that corrected set because the edit leaves its restoration provenance intact. An earlier report reproduced the deletion. Whether the older cancellation should win depends on the intended concurrent-edit policy.  
   **Exact fix if newer edits must survive:** Invalidate restoration provenance transactionally on edits and type changes, and reject stale cancellation when the restored set has changed or has pending corrections.

This was a read-only source audit. I did not edit files or run tests. I traced the update and termination recovery paths in source, but did not verify service-worker activation, race timing, or iOS termination on a physical device. Prior reports’ reproductions are identified above; they were not rerun in this review.