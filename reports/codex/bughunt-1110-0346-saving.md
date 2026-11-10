**9 confirmed MAJOR findings and 1 possible MAJOR defect.** Reviewed completed `[x]` work and earlier reports; fixed findings excluded. No files edited.

1. **MAJOR — NEW: Failed Retry deletes the last durable correction.**  
   [mutations.ts:402](/Users/rabah/projects/anygym/src/db/mutations.ts:402)  
   A retained 19-rep edit survives in IndexedDB. If Retry’s journal and replacement fallback writes fail, Retry deletes the original recovery copy anyway. After restart, no correction remains; Finish saves the original 10 reps. **Reproduced in one runtime followed by reopening.**  
   **Exact fix:** Remove the unconditional `forget()` when registration fails. Retain the predecessor until a replacement journal or durable recovery record commits, or the user explicitly discards it.

2. **MAJOR — STILL OPEN: Finish silently loses a submitted set.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:666](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:666)  
   Another tab’s failed journal write can leave its submission only in the durable draft mirror. Finish checks journals and cached drafts, overlooks that submission, then clears its recovery copy. **Reproduced: pending 73 lb × 19 disappeared; only the earlier set was saved.**  
   **Exact fix:** Admit Logs under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against submission and cancellation receipts; refuse unresolved submissions and snapshot the reconciled state for Undo.

3. **MAJOR — STILL OPEN: Reconciliation erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect differing values only at equal revisions, although tabs allocate revisions independently. **Reproduced: pending 73 lb × 19, revision 1, was erased against saved 53 lb × 10, revision 5.**  
   **Exact fix:** Use coordinated revisions and immutable submission identities. Require matching payload evidence before consuming input; retain differing payloads as unresolved conflicts regardless of numerical revision ordering.

4. **MAJOR — STILL OPEN: “Finish without it” discards values the user never reviewed.**  
   [ExerciseView.tsx:319](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:319), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry reuses its operation ID, and discard never compares payload fingerprints. **Reproduced: a sheet representing 53 lb × 17 deleted a later 73 lb × 19 journal sharing its identity, revision and operation.**  
   **Exact fix:** Generate `op: newId()` on every toast Retry. Include the fingerprint in `ShownRow`; transactionally cancel only the exact identity, revision, operation and payload shown.

5. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the database snapshot. A correction retained during that gap is omitted. **Reproduced: the backup included the old 10-rep set and a subsequently logged set, but omitted the durable 19-rep correction.**  
   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals and suppression receipts. Coordinate memory and fallback capture with mutation registration under the session lock.

6. **MAJOR — STILL OPEN: Logging resurrects intentionally removed pending input.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   When IndexedDB lacks a slot, the merge reinserts its clean cached draft—even if another tab deliberately removed it. **Reproduced with localStorage blocked: logging bench restored removed squat input, 73 lb × 19, into durable storage.**  
   **Exact fix:** Remove the clean-row insertion fallback. Merge only dirty changes and explicit deletions; clean rows must adopt committed state, including absence. Refresh memory from the committed result.

7. **MAJOR — NEW: Checking a failed Log again assigns it to the wrong gym.**  
   [ExerciseView.tsx:296](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:296), [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213)  
   Log at gym A, let journaling fail, switch to B, then retry using the row’s check. `markSubmitted()` replaces the original gym with B. **Reproduced: the original machine lift was saved under B.** The initial-tap capture fix works; this retry path bypasses it.  
   **Exact fix:** Preserve `base.gymId` while retrying an already-submitted draft. Capture the current gym only for a fresh submission after the previous operation has been resolved or discarded.

8. **MAJOR — STILL OPEN: Lighter-week targets drop stack add-on resistance.**  
   [recovery.ts:101](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:101), [recovery.ts:151](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:151)  
   Recovery targets scale the pin alone and reconstruct without added weight. **Reproduced: 100 lb pin + 25 lb added becomes 90 lb total, described as “−10 lb”; the actual reduction is 35 lb.** Checking the target saves that incomplete resistance. The kg path also fails.  
   **Exact fix:** Calculate reductions and explanation deltas from complete resistance through `load.ts`; reconstruct a correctly rounded total or preserve the complete pin/add-on breakdown.

9. **MAJOR — STILL OPEN: An unresolved generated plan silently becomes a Quick workout.**  
   [useWorkout.ts:161](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:161), [workouts.ts:428](/Users/rabah/projects/anygym/src/db/workouts.ts:428)  
   An older tab lacks plans generated elsewhere; startup also swallows saved-plan read failures at [main.tsx:57](/Users/rabah/projects/anygym/src/main.tsx:57). **Reproduced: prescribed 5 × 6–8 becomes the 3 × 8–12 fallback, while Finish omits plan progress and leaves the next day unchanged.**  
   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`. Include loading/errors in readiness, block fallback and Finish for unresolved nonempty plan IDs, and resolve the definition inside Finish’s transaction.

10. **MAJOR — STILL OPEN, POSSIBLE BUG: Stale “Keep deleted” destroys a newer correction.**  
    [tombstones.ts:143](/Users/rabah/projects/anygym/src/db/tombstones.ts:143), [workouts.ts:262](/Users/rabah/projects/anygym/src/db/workouts.ts:262)  
    Restore a deletion elsewhere, successfully edit it to 19 reps, then invoke the older cancellation. **Reproduced: both the corrected set and its recovery tombstone were absent afterward.** Whether this violates intended behavior depends on the unspecified concurrent-edit policy.  
    **Exact fix if newer corrections must survive:** Invalidate restoration provenance transactionally on committed edits/type changes, and reject cancellation when the restored record changed or has pending corrections.

Verification used production modules with in-memory IndexedDB and injected failures. Controls passed for Log deduplication, transaction rollback, restart recovery, accepted Undo, group Undo draining, Finish → Undo, and update deferral during active or unreadable activity. Physical iOS termination and live service-worker activation were not tested. Typecheck currently fails on an unused `expect` import at [zz-gate-critic-explore.spec.ts:1](/Users/rabah/projects/anygym/tests/zz-gate-critic-explore.spec.ts:1).