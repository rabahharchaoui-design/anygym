Found **7 confirmed MAJOR defects and 1 possible MAJOR defect** in completed `[x]` work. Fixed earlier findings are excluded. No files edited.

1. **MAJOR — NEW: Discard → Undo loses a failed first set.**  
   [TodayScreen.tsx:201](/Users/rabah/projects/anygym/src/screens/TodayScreen.tsx:201), [discard.ts:14](/Users/rabah/projects/anygym/src/db/discard.ts:14)  
   If the first Log’s journal write fails, its submitted draft can remain durable while the workout appears empty. Discard accepts it and clears the draft. **Reproduced:** Undo restored the session with no set or draft. Ordinary pending picks also disappear.  
   **Exact fix:** Check submitted drafts and held changes under the session lock before allowing empty discard. Transactionally retain drafts, added rows and rest with the discarded session; Undo must restore those durable values and hydrate their runtime stores.

2. **MAJOR — STILL OPEN: Finish silently omits a submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:659](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:659)  
   Another tab’s failed journal write can leave its submission solely in the IndexedDB draft mirror. Finish checks journals and cached drafts, succeeds, then clears recovery input. **Reproduced:** pending **73 lb × 19** was omitted. The cached Finish snapshot also cannot reliably restore newer drafts through Undo.  
   **Exact fix:** Serialize Log admission with Finish. Inside Finish’s transaction, reconcile authoritative durable drafts against submission and cancellation receipts, reject unresolved submissions, and construct the Undo snapshot from that reconciled state.

3. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Different payloads are protected only at equal revisions, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**.  
   **Exact fix:** Preserve unmatched payload fingerprints regardless of revision ordering. Consume input only with matching committed evidence or explicit causal supersession; use immutable operation identities and transactionally coordinated revisions.

4. **MAJOR — STILL OPEN: Backup omits a durable correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are read before the table snapshot. A correction retained during that gap appears in neither the backup’s journal nor its pending changes. **Reproduced:** the source retained **19 reps**, while the backup retained the original set without that correction. Restore loses the edit.  
   **Exact fix:** Read durable held corrections inside the same transaction as sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

5. **MAJOR — STILL OPEN: Logging resurrects deliberately removed input.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage blocked, the durable merge reinserts clean cached rows whenever IndexedDB lacks their slot—including deliberate removals elsewhere. **Reproduced:** removed **73 lb × 19** returned to durable storage, making it available for logging again.  
   **Exact fix:** Remove the clean-row insertion fallback. Merge only dirty updates and explicit deletions; clean rows must adopt committed state, including absence. Refresh memory from the committed merge.

6. **MAJOR — STILL OPEN: Rechecking a failed Log changes its gym.**  
   [ExerciseView.tsx:258](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:258), [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213)  
   Log at A, let journaling fail, switch to B, then retry through the row’s check. `markSubmitted()` replaces the captured gym with B. **Reproduced:** the machine set saved against B, contaminating its history and future targets.  
   **Exact fix:** Preserve `base.gymId` when retrying an already-submitted draft. Capture the current gym only for a fresh submission after resolving or discarding the previous operation.

7. **MAJOR — STILL OPEN: An unresolved generated plan silently uses Quick workout behavior.**  
   [useWorkout.ts:161](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:161), [workouts.ts:428](/Users/rabah/projects/anygym/src/db/workouts.ts:428)  
   An older tab can see a generated session without having its definition in the tab-local registry. It substitutes Quick prescriptions, and Finish omits plan advancement. **Reproduced:** a stored definition remained unresolved; Finish saved the workout without progress or advancement.  
   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`. Include loading/errors in readiness, block fallback for unresolved nonempty plan IDs, and resolve the definition inside Finish’s transaction.

8. **MAJOR — STILL OPEN, POSSIBLE BUG: Stale “Keep deleted” destroys a newer successful edit.**  
   [tombstones.ts:143](/Users/rabah/projects/anygym/src/db/tombstones.ts:143), [workouts.ts:262](/Users/rabah/projects/anygym/src/db/workouts.ts:262)  
   Restore a deletion elsewhere, successfully edit it, then invoke the older cancellation. Editing leaves restoration provenance valid. **Reproduced:** both the corrected set and its tombstone were absent afterward. Whether this is intended depends on the unspecified concurrent-edit policy.  
   **Exact fix if newer edits must survive:** Invalidate restoration provenance transactionally on committed edits/type changes. Reject stale cancellation when the restored record changed or has pending corrections.

Typecheck passed. In-memory failure/reopen controls passed for Log deduplication, failed Log/Edit/Delete/Undo/Finish recovery, Finish → Undo, and update deferral during active or unreadable activity. Physical iOS termination and live service-worker activation were not exercised.