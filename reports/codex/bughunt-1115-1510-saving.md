**7 MAJOR findings and 1 possible MAJOR finding, all STILL OPEN.** Reviewed completed `[x]` features and earlier reports; fixed findings excluded. No files edited.

1. **MAJOR — STILL OPEN: Finish silently omits a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83), [useFinish.ts:76](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:76)  
   A failed journal write can leave another tab’s submission only in the durable draft mirror. Finish checks journals and cached drafts, succeeds, then clears recovery input. **Reproduced:** pending **73 lb × 19** was omitted; Finish reported one saved set.  
   **Exact fix:** Admit Logs under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against committed and cancelled submissions; reject unresolved submissions. Build the Undo snapshot from that reconciled state.

2. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect conflicting payloads only at equal revisions, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19**, revision 1, disappeared against a **53 lb × 10**, revision-5 receipt. Restart reconciliation can therefore discard input never saved.  
   **Exact fix:** Require matching payload evidence or explicit causal supersession before consuming a draft. Preserve differing payloads at every revision under recoverable identities; coordinate revision allocation transactionally.

3. **MAJOR — STILL OPEN: Discard → Undo loses pending input.**  
   [discard.ts:14](/Users/rabah/projects/anygym/src/db/discard.ts:14), [TodayScreen.tsx:171](/Users/rabah/projects/anygym/src/screens/TodayScreen.tsx:171)  
   After the first Log’s journal fails, durable submitted input can exist without sets or journal entries. Discard considers the workout empty and clears drafts; Undo restores only the session and counter. Ordinary unsubmitted picks also disappear. **Reproduced:** discard accepted durable submitted input and retained no draft snapshot.  
   **Exact fix:** Under the session lock, reject discard while submissions or held corrections remain unresolved. Transactionally retain drafts, added rows and rest; Undo must restore their durable records and runtime stores.

4. **MAJOR — STILL OPEN: Backup omits a durable correction.**  
   [backup.ts:80](/Users/rabah/projects/anygym/src/db/backup.ts:80), [backup.ts:102](/Users/rabah/projects/anygym/src/db/backup.ts:102)  
   Held corrections are captured before the database snapshot. An edit retained after that capture but before the snapshot is omitted. **Reproduced:** backup contained the original 10-rep set and a later logged set, but no retryable 19-rep correction.  
   **Exact fix:** Read durable held corrections inside the same snapshot transaction as sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

5. **MAJOR — STILL OPEN: Logging resurrects deliberately removed drafts.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage unavailable, the durable merge reinserts clean cached drafts whenever IndexedDB lacks their slot—even after another tab deliberately removed them. **Reproduced:** removed **73 lb × 19** input returned to durable storage, making it recoverable and loggable again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence. Refresh memory from the committed merge.

6. **MAJOR — STILL OPEN: Rechecking a failed Log changes its gym.**  
   [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213), [useLogRow.ts:50](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:50)  
   Log at gym A, let journaling fail, switch to B, then retry using the row’s check. `markSubmitted()` replaces the captured gym with B, assigning the lift to the wrong machine history. **Helper reproduction confirmed; browser sequence source-traced.**  
   **Exact fix:** Preserve `base.gymId` for an already-submitted draft. Capture the current gym only for a fresh submission after resolving or explicitly discarding the previous operation.

7. **MAJOR — STILL OPEN: Unresolved generated plans silently change workout prescriptions.**  
   [useWorkout.ts:163](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:163), [workoutFinish.ts:30](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:30), [main.tsx:65](/Users/rabah/projects/anygym/src/main.tsx:65)  
   An older tab can lack a generated plan’s definition; startup also swallows saved-plan read failures. The workout then uses Quick workout prescriptions, and Finish omits plan advancement. **Source-confirmed; browser timing untested.**  
   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`. Include loading/errors in readiness; block fallback and Finish for unresolved plan IDs. Resolve the definition within Finish’s transaction.

8. **MAJOR — STILL OPEN, POSSIBLE BUG: Stale “Keep deleted” destroys a successful correction.**  
   [tombstones.ts:143](/Users/rabah/projects/anygym/src/db/tombstones.ts:143), [workoutSets.ts:121](/Users/rabah/projects/anygym/src/db/workoutSets.ts:121)  
   Restore a deletion elsewhere, successfully edit it, then invoke the older cancellation. Editing leaves restoration provenance valid. **Reproduced:** the corrected set was deleted with no recovery tombstone. Whether this violates intended behavior depends on the unspecified concurrent-edit policy.  
   **Exact fix if newer edits must survive:** Invalidate restoration provenance transactionally on committed edits/type changes. Reject stale cancellation when the restored record changed or has pending corrections.

Typecheck passed. In-memory controls passed for Log deduplication, failed Log/Edit/Delete/Undo/Finish rollback, accepted-Undo recovery after reopening, Finish→Undo draft durability, and update deferral during active workouts or unreadable activity. Vitest could not start because temporary-directory creation was denied. Physical iOS termination and live service-worker activation remain unverified.