Found **8 confirmed MAJOR defects and 1 possible MAJOR defect**, all **STILL OPEN** from earlier reports. Reviewed completed `[x]` work only; fixed findings excluded. No files edited.

1. **MAJOR — STILL OPEN: Failed Retry deletes the last durable correction.**  
   [mutations.ts:402](/Users/rabah/projects/anygym/src/db/mutations.ts:402)  
   If Retry’s replacement journal and fallback writes fail, it deletes the previous recovery record anyway. **Reproduced:** after reopening, the intended **73 lb × 19** correction vanished; **53 lb × 10** remained saved.  
   **Exact fix:** Remove the unconditional `forget()` after failed registration. Retain the predecessor until its replacement commits durably or the user explicitly discards it.

2. **MAJOR — STILL OPEN: Finish overlooks a submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:659](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:659)  
   Another tab’s failed journaling can leave a submitted set solely in IndexedDB’s draft mirror. Finish checks journals and this tab’s cached drafts, succeeds, then clears the recovery drafts. **Reproduced:** unresolved **73 lb × 19** was omitted from the finished workout.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, inspect durable submitted drafts against committed and cancellation receipts; reject unresolved submissions and construct the Undo snapshot from that reconciled state.

3. **MAJOR — STILL OPEN: “Finish without it” discards values the user never reviewed.**  
   [ExerciseView.tsx:281](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:281), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry reuses its operation ID, while discard compares identifiers without checking the payload. **Reproduced:** a sheet representing **53 lb × 17** deleted a later journal containing **73 lb × 19** with the same ID, revision and operation.  
   **Exact fix:** Generate `op: newId()` on every toast Retry. Include the payload fingerprint in `ShownRow`; transactionally require identity, revision, operation and fingerprint to match before cancellation.

4. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Different payloads are protected only when revisions match, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**.  
   **Exact fix:** Preserve differing fingerprints regardless of revision ordering. Consume drafts only with matching committed payload evidence or durable causal supersession evidence; retain conflicts under recoverable identities.

5. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the database snapshot. **Reproduced:** a correction became durable during that gap; backup included the original 10-rep set and a subsequently logged set, but omitted the pending 19-rep correction. Restoring loses the edit.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

6. **MAJOR — STILL OPEN: Logging resurrects intentionally removed pending input.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage unavailable, the merge reinserts clean cached drafts when IndexedDB lacks their slot—including rows deliberately removed elsewhere. **Reproduced:** removed **73 lb × 19** input returned to durable storage.  
   **Exact fix:** Remove the clean-row insertion fallback. Merge only dirty changes and explicit deletions; clean rows must adopt committed state, including absence. Refresh memory from the committed merge.

7. **MAJOR — STILL OPEN: Rechecking a failed Log changes its gym.**  
   [ExerciseView.tsx:258](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:258), [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213)  
   Log at gym A, let journaling fail, switch to B, then retry through the row’s check. `markSubmitted()` replaces the original gym with B, assigning the machine lift to the wrong history. **Helper interleaving reproduced; browser sequence source-traced.**  
   **Exact fix:** Preserve `base.gymId` when retrying an already-submitted draft. Capture the current gym only for a fresh submission after resolving or discarding the previous operation.

8. **MAJOR — STILL OPEN: An unresolved generated plan silently becomes Quick workout behavior.**  
   [useWorkout.ts:161](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:161), [workouts.ts:428](/Users/rabah/projects/anygym/src/db/workouts.ts:428), [main.tsx:57](/Users/rabah/projects/anygym/src/main.tsx:57)  
   An older tab lacks plans generated elsewhere; startup also swallows saved-plan read failures. The workout uses fallback prescriptions, and Finish omits plan progress. **Source-confirmed; browser timing not rerun.**  
   **Exact fix:** Resolve generated definitions reactively from IndexedDB by `planId`. Include loading/errors in readiness, block fallback for unresolved nonempty plan IDs, and resolve the definition inside Finish’s transaction.

9. **MAJOR — STILL OPEN, POSSIBLE BUG: Stale “Keep deleted” destroys a newer correction.**  
   [tombstones.ts:143](/Users/rabah/projects/anygym/src/db/tombstones.ts:143), [workouts.ts:262](/Users/rabah/projects/anygym/src/db/workouts.ts:262)  
   Restore a deletion elsewhere, successfully edit it, then invoke the older cancellation. Editing leaves its restoration token valid. **Reproduced:** both corrected set and recovery tombstone were absent afterward. Whether this violates intended behavior depends on the unspecified concurrent-edit policy.  
   **Exact fix if newer corrections must survive:** Invalidate restoration provenance transactionally on committed edits/type changes; reject cancellation if the restored record changed or has pending corrections.

Typecheck passed. Production-module probes used in-memory IndexedDB and injected failures. Controls passed for Log deduplication, failed Log/Edit/Delete rollback, failed Undo recovery after reopening, Finish rollback, Finish → Undo, and update deferral during active workouts or unreadable activity. Physical iOS termination and live service-worker activation were not tested.