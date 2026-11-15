Found **8 confirmed MAJOR defects and 1 possible MAJOR defect** in completed `[x]` features. Compared against earlier reports; fixed cases excluded. No files edited.

1. **MAJOR — STILL OPEN: Finish silently omits a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83), [useFinish.ts:79](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:79)  
   Another tab’s failed journal write can leave its submission only in the durable draft mirror. Finish checks journals and cached drafts, reports success, then clears recovery input. **Reproduced:** pending **73 lb × 19** was omitted.  
   **Exact fix:** Admit Log submissions under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against committed/cancelled operations, reject unresolved submissions, and build the Undo snapshot from that authoritative state. Hydrate unresolved rows into the recovery sheet.

2. **MAJOR — STILL OPEN: Recovery deletes conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect differing payloads only at equal revisions, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19**, revision 1, disappeared against a receipt for **53 lb × 10**, revision 5. Restart reconciliation can therefore erase input never saved.  
   **Exact fix:** Require matching payload evidence or explicit causal supersession before consuming a draft. Preserve conflicting payloads regardless of revision ordering; allocate operation revisions transactionally.

3. **MAJOR — STILL OPEN, failure variant after partial fix: Discard → Undo reports success without durable drafts.**  
   [discardWorkout.ts:22](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:22), [discard.ts:25](/Users/rabah/projects/anygym/src/db/discard.ts:25)  
   Undo restores the session transactionally, then starts a separate, unawaited draft write. **Reproduced:** with localStorage unavailable and that IndexedDB write failing, Undo returned `true`; simulated restart restored an empty workout and lost the submitted set.  
   **Exact fix:** Persist the discard snapshot durably. Restore session, counter, drafts, added rows and rest in one transaction; report success only after commit, then hydrate runtime stores.

4. **MAJOR — STILL OPEN: Backup omits a durable correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the database snapshot. A correction retained between those reads is absent from the backup. **Reproduced:** the backup included a later committed set but omitted the preceding **73 lb × 19** correction; restore retained 10 reps without a retryable edit.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

5. **MAJOR — NEW: Rapid checks of different rows can leave one unsaved and block further logging.**  
   [useLogRow.ts:62](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:62), [logQueue.ts:79](/Users/rabah/projects/anygym/src/lib/logQueue.ts:79)  
   Before the deferred save starts, two different rows can acquire claims. When their writes overlap, the second receives the first submission’s promise. **Controlled reproduction:** both returned success, only A saved, and B’s “landed” claim permanently blocked subsequent checks until recovery. Browser timing remains untested.  
   **Exact fix:** Reserve the exercise synchronously before `idleAfterPaint`. Deduplicate identical submission IDs, queue different IDs, and mark a claim landed only when its own submission committed.

6. **MAJOR — STILL OPEN: Logging resurrects deliberately removed drafts.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage unavailable, the durable merge reinserts clean cached rows whenever IndexedDB lacks their slot—including deliberate removals elsewhere. **Reproduced:** removed **73 lb × 19** input returned to durable storage and became recoverable/loggable again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence; refresh memory from the committed merge.

7. **MAJOR — STILL OPEN: One-horn machines save doubled plate resistance.**  
   [PlateMachineInput.tsx:46](/Users/rabah/projects/anygym/src/components/load/PlateMachineInput.tsx:46)  
   The picker never supplies a horn count, so it always uses two. A one-horn machine with a 100 lb start and one 45 lb plate saves **190 lb**, instead of **145 lb**. The model supports one horn, but the logging UI cannot select it.  
   **Exact fix:** Ask once per gym/machine when horn count is unknown. Pass that fact through picker, diagram, rebuilding and coaching, and snapshot it on every saved load. Preserve historical totals.

8. **MAJOR — STILL OPEN: An older tab silently substitutes Quick workout prescriptions for a generated plan.**  
   [useWorkout.ts:163](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:163), [workoutFinish.ts:30](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:30)  
   Saved definitions are registered only in tab-local memory. An older tab can see the session without knowing its plan, substitute Quick targets, and finish without plan progress. **Reproduced:** a valid stored definition remained unresolved while Finish succeeded.  
   **Exact fix:** Resolve definitions reactively from IndexedDB by `planId`; include resolution in readiness. Block fallback and Finish for unresolved plan IDs, and resolve the definition within Finish’s transaction.

9. **MAJOR — STILL OPEN, POSSIBLE BUG: Stale “Keep deleted” destroys a successful correction.**  
   [tombstones.ts:143](/Users/rabah/projects/anygym/src/db/tombstones.ts:143), [workoutSets.ts:129](/Users/rabah/projects/anygym/src/db/workoutSets.ts:129)  
   Restore a deletion elsewhere, successfully edit it, then invoke the older cancellation. **Reproduced:** both the corrected set and recovery tombstone were gone. Whether this is intended depends on the concurrent-edit policy.  
   **Exact fix if newer edits must survive:** Invalidate restoration provenance transactionally on edits/type changes; reject stale cancellation when the restored set changed or has pending corrections.

Typecheck and **12 in-memory safety controls passed**, covering deduplication, failed-write rollback, accepted-Undo recovery, Finish → Undo durability, and update deferral. Physical iOS termination, live service-worker activation and browser race timing were not exercised.