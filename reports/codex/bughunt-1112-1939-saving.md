**7 confirmed MAJOR findings and 1 possible MAJOR finding, all STILL OPEN from earlier reports.** Reviewed completed `[x]` work only. No files edited; fixed earlier findings are excluded.

1. **MAJOR — STILL OPEN: Finish silently drops a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83), [useFinish.ts:76](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:76)

   Another tab’s failed journal write can leave its submitted lift only in IndexedDB’s draft mirror. Finish checks journals and cached drafts, succeeds, then clears recovery input. **Reproduced:** unresolved **73 lb × 19** was omitted while Finish reported success. Its Undo snapshot can also contain older pending values.

   **Exact fix:** Put Log admission and Finish under the same session lock. Inside Finish’s transaction, reconcile durable submitted drafts against committed and cancelled submissions; reject unresolved input. Build the Undo snapshot from that authoritative state.

2. **MAJOR — STILL OPEN: Discard → Undo loses the failed first set.**  
   [discard.ts:14](/Users/rabah/projects/anygym/src/db/discard.ts:14), [TodayScreen.tsx:200](/Users/rabah/projects/anygym/src/screens/TodayScreen.tsx:200)

   When the first Log’s journal write fails, its submitted draft can survive without a saved set or journal. Discard considers the workout empty and clears its drafts. Undo restores only the session and counter. **Reproduced:** discard accepted unresolved input; its Undo snapshot contained no drafts. Ordinary unsubmitted picks also disappear.

   **Exact fix:** Under the session lock, refuse discard while submitted drafts or held corrections remain unresolved. Transactionally retain drafts, added rows and rest with the discarded session; Undo must restore their durable records and runtime stores.

3. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)

   Payload mismatches are protected only at equal revisions, although tabs allocate revisions independently. **Reproduced:** a pending **73 lb × 19**, revision 1, disappeared against another payload’s revision-5 receipt. Restart or reconciliation therefore treats unsaved input as already saved.

   **Exact fix:** Consume drafts only with matching committed payload evidence or explicit causal supersession. Preserve differing fingerprints at every revision under a recoverable identity; coordinate revision allocation transactionally.

4. **MAJOR — STILL OPEN: Backup omits a durable correction.**  
   [backup.ts:80](/Users/rabah/projects/anygym/src/db/backup.ts:80), [backup.ts:102](/Users/rabah/projects/anygym/src/db/backup.ts:102)

   Held corrections are captured before the database snapshot. An edit whose journal fails during that gap can become durable without entering the backup. **Reproduced:** the backup included a later committed set but omitted the pending 19-rep correction. Restore retained the original values without a retryable edit.

   **Exact fix:** Read durable held corrections inside the same snapshot transaction as sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

5. **MAJOR — STILL OPEN: Logging resurrects deliberately removed input.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)

   With localStorage unavailable, the durable merge reinserts clean cached drafts whenever IndexedDB lacks their slot—including deliberate removals elsewhere. **Reproduced:** removed **73 lb × 19** input returned to durable storage. It can reappear after restart and be logged.

   **Exact fix:** Remove the clean-row insertion fallback. Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence; refresh memory from the committed merge.

6. **MAJOR — STILL OPEN: Rechecking a failed Log changes its gym.**  
   [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213), [useLogRow.ts:49](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:49)

   Log at gym A, let journaling fail, switch to B, then retry using the row’s check. `markSubmitted()` overwrites the captured gym with B. **Helper reproduction confirmed this; browser sequence is source-traced.** Machine history and subsequent targets use the wrong gym.

   **Exact fix:** Preserve `base.gymId` for an already-submitted draft. Capture today’s gym only for a fresh submission after resolving or explicitly discarding the previous operation.

7. **MAJOR — STILL OPEN: Missing generated-plan recovery silently changes workout prescriptions.**  
   [useWorkout.ts:163](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:163), [workoutFinish.ts:30](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:30), [main.tsx:65](/Users/rabah/projects/anygym/src/main.tsx:65)

   An older tab can encounter a generated session absent from its local plan registry; startup also swallows saved-plan read failures. The workout substitutes Quick workout prescriptions, and Finish omits plan advancement. **Source-confirmed; browser timing was not exercised.**

   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`. Include loading/errors in readiness and block fallback for unresolved nonempty plan IDs. Resolve the definition within Finish’s transaction before calculating progress.

8. **MAJOR — STILL OPEN, POSSIBLE BUG: Stale “Keep deleted” destroys a successful correction.**  
   [tombstones.ts:143](/Users/rabah/projects/anygym/src/db/tombstones.ts:143), [workoutSets.ts:121](/Users/rabah/projects/anygym/src/db/workoutSets.ts:121)

   Restore a deletion elsewhere, successfully edit it, then invoke the older cancellation. Editing leaves restoration provenance valid. **Reproduced:** both the corrected set and recovery tombstone were absent afterward. Whether that is intended depends on the unspecified concurrent-edit policy.

   **Exact fix if newer edits must survive:** Invalidate restoration provenance transactionally on committed edits/type changes. Reject stale cancellation when the restored record changed or has pending corrections.

Validation: Typecheck passed. Targeted suites produced **63 passing tests, five expected failures reproducing known defects, and one skipped test**. Transaction rollback, ordinary deduplication, accepted-Undo recovery and update deferral checks passed. Physical iOS termination and live service-worker activation were not exercised.