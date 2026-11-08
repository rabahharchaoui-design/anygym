**4 confirmed MAJOR findings and 1 possible MAJOR finding, all STILL OPEN.** Reviewed built `[x]` features only; fixed earlier findings excluded. No files edited.

1. **MAJOR — STILL OPEN: Finish can silently omit a failed Log.**  
   [rowLog.ts:302](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:302), [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530)  
   If another tab’s journal write fails, its submitted lift can survive only in IndexedDB’s draft mirror. Finish checks cached drafts and the journal, overlooking that durable submission. **Reproduced:** Finish succeeded with only the earlier 53 lb set saved; the submitted 73 lb set was missing. The screen then clears drafts.  
   **Exact fix:** Coordinate Log admission and Finish under the session lock. Inside Finish’s transaction, reconcile authoritative durable drafts against submission and cancellation receipts, reject unresolved submissions, and build the Undo snapshot from that reconciled state.

2. **MAJOR — STILL OPEN: Conflicting weight input is erased because its revision is lower.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect differing payloads only when revisions match. Tabs allocate revisions independently, so a lower revision can contain newer user input. **Reproduced:** reconciling pending **73 lb × 19, revision 1** against saved **53 lb × 10, revision 5** removed the pending row entirely.  
   **Exact fix:** Never consume differing payloads solely because of revision ordering. Give edits immutable operation identities with coordinated ordering; retain unmatched input as an unresolved conflict until explicitly resolved.

3. **MAJOR — STILL OPEN: “Finish without it” can discard a different weight from the one shown.**  
   [ExerciseView.tsx:313](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:313), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry reuses the previous operation ID. Two tabs correcting the same failed row can therefore retain identical ID, revision and operation despite different weights. **Reproduced:** the sheet represented **53 lb × 17**, while the journal held **73 lb × 19**; discarding deleted the latter and allowed Finish.  
   **Exact fix:** Generate `op: newId()` in this retry path. Include the payload fingerprint in `ShownRow`, and transactionally require both operation identity and fingerprint to match before discarding.

4. **MAJOR — STILL OPEN: Backup can omit a durably retained weight correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the database snapshot. A correction retained in `kv` during that gap is absent from both exported sets and pending changes. **Reproduced:** the source retained a retryable **73 lb** correction; backup contained the old **53 lb** set and a later **83 lb** set, but no correction. Restoring loses the intended weight.  
   **Exact fix:** Read durable held corrections inside the same snapshot transaction as sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

5. **MAJOR — STILL OPEN, POSSIBLE BUG: An older cancellation deletes a successfully corrected lift.**  
   [tombstones.ts:143](/Users/rabah/projects/anygym/src/db/tombstones.ts:143), [workouts.ts:249](/Users/rabah/projects/anygym/src/db/workouts.ts:249)  
   Restore a deletion elsewhere, correct the lift, then invoke the older “Keep deleted.” Editing retains the restoration token, allowing cancellation to delete the corrected record without a recovery copy. **Reproduced:** corrected **73 lb × 19** disappeared from both sets and tombstones. Whether cancellation should override that correction depends on the unspecified concurrent-edit policy.  
   **Exact fix if corrections take precedence:** Invalidate restoration provenance transactionally on edits/type changes; reject cancellation when the restored record changed or has pending corrections.

Typecheck passed. Read-only probes passed **3,000 lb/kg sum cases and 80 solver round trips**, plus unit/inventory rejection, collars, machine starts, stack additions, each-hand versus total, and mixed-unit volume checks. Failures above were reproduced with production helpers and in-memory IndexedDB; physical iPhone timing was not tested.