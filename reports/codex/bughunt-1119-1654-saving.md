I found **six open save and recovery issues**, plus one possible concurrent-action bug. All were reported in earlier audits and remain present in the current source.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks the journal and held edits, but not another app context’s durable submitted-draft mirror. If that context’s journal write fails, Finish can save the workout without the submitted set and clear its recovery input.  
   **Exact fix:** Admit submissions under the session lock. In the Finish transaction, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from that reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks can leave one set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes begin. If the writes overlap, the second receives the first row’s promise and can appear successful without its own set being written. An earlier audit reproduced the queue behavior; the precise browser timing remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and mark each claim landed only after its own submission commits.

3. **MAJOR — STILL OPEN: Restart reconciliation can erase different unsaved values.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   App contexts allocate revisions independently, but reconciliation discards a lower-revision draft without comparing its values with the committed receipt. A different weight or rep count can disappear after recovery even though it was never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or explicit causal history proves it was superseded. Preserve conflicting payloads at every revision and allocate revisions transactionally across contexts.

4. **MAJOR — STILL OPEN: Discard and Undo can succeed while losing a failed submission.**  
   [discard.ts:10](/Users/rabah/projects/anygym/src/db/discard.ts:10), [discardWorkout.ts:15](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:15)  
   Discard can treat a workout as empty when a failed Log exists only as a draft. Undo restores the session first and writes its drafts separately without awaiting durable completion. If that write fails and iOS kills the app, Undo can have reported success while the restored workout has lost the set input.  
   **Exact fix:** Reject discard while unresolved submissions or corrections exist. Persist the discard snapshot and restore the session, counter, drafts and associated live state in one transaction; report success only after commit.

5. **MAJOR — STILL OPEN: Logging can resurrect a removed draft.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the merge writes a clean cached draft back if its IndexedDB slot is absent, including when another context deliberately removed it. Old weight and reps can reappear and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

6. **MAJOR — STILL OPEN: A backup can omit a retained edit.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82) captures held corrections before taking the database snapshot. A failed edit retained between those reads can be absent from both the exported set and the retryable corrections, so restoring the backup returns the older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and suppression receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN, possible bug: A stale “Keep deleted” action can remove a corrected set.**  
   [tombstones.ts:141](/Users/rabah/projects/anygym/src/db/tombstones.ts:141), [workoutSets.ts:116](/Users/rabah/projects/anygym/src/db/workoutSets.ts:116)  
   If a deleted set is restored elsewhere and then edited, an older cancellation can delete the corrected set because the edit leaves its restoration provenance intact. An earlier audit reproduced the deletion; whether the older cancellation should win depends on the intended concurrent-action policy.  
   **Exact fix if newer edits should survive:** Invalidate restoration provenance transactionally on edits and type changes, and reject stale cancellation when the restored set has changed or has pending corrections.

This was a read-only source review; no files were edited and I did not rerun tests or earlier reproductions. I traced the update guard and restart paths as well, but did not verify service-worker timing, failed writes, or iOS termination on a physical device. The race-dependent findings should be exercised with controlled write failures and interleavings.