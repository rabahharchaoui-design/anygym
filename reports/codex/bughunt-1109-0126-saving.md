Found **6 confirmed MAJOR defects and 1 possible MAJOR concurrency defect** in completed `[x]` work. Fixed earlier findings are excluded. No files edited.

1. **MAJOR — STILL OPEN: Finish silently loses a submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:666](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:666)  
   When another tab’s journal write fails, its submitted set can survive only in IndexedDB’s draft mirror. Finish checks journals and cached drafts, overlooks that submission, then clears drafts. **Reproduced:** pending 73 lb × 19; Finish succeeded with only the earlier set.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, inspect authoritative durable drafts against submission/cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from that reconciled state.

2. **MAJOR — STILL OPEN: Reconciliation erases conflicting input with a lower revision.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Different fingerprints protect input only when revisions match, although tabs allocate revisions independently. **Reproduced:** pending 73 lb × 19 at revision 1 disappeared against saved 53 lb × 10 at revision 5.  
   **Exact fix:** Preserve differing payload fingerprints regardless of revision ordering. Use immutable operation identities and transactionally coordinated revisions; never consume conflicting input solely because its revision is lower.

3. **MAJOR — STILL OPEN: “Finish without it” discards values the user never saw.**  
   [ExerciseView.tsx:313](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:313), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry reuses its operation ID. Two tabs can submit different values under identical ID, revision and operation. **Reproduced:** the sheet represented 53 lb × 17; a later journal contained 73 lb × 19; dismissing the original sheet deleted that later submission.  
   **Exact fix:** Generate `op: newId()` on every toast Retry. Include the payload fingerprint in `ShownRow`; transactionally discard only the exact identity, revision, operation and fingerprint shown.

4. **MAJOR — STILL OPEN, additional resurrection variant: Retry brings back a removed pending set.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   The stale-cache fix still inserts a **clean** cached row when IndexedDB no longer contains that slot. With localStorage blocked, another tab can remove the row, then Retry elsewhere writes it back. **Reproduced through `saveDraft()` → `submitRow()`:** removed squat input, 73 lb × 19, returned in both memory and durable storage.  
   **Exact fix:** Remove the clean-row insertion fallback. Merge only dirty changes and explicit deletions; clean rows must adopt committed state, including absence. Refresh memory from the committed merge.

5. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the table snapshot. A correction retained during that gap is omitted. **Reproduced:** source retained 73 lb × 19; backup contained the old 53 lb × 10 and a later logged set, without the correction. Restore lost the intended edit.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction with sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

6. **MAJOR — STILL OPEN: Coach “+5 lb” removes stack add-on weight.**  
   [levelUp.ts:61](/Users/rabah/projects/anygym/src/lib/coach/levelUp.ts:61), [useWorkout.ts:266](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:266)  
   The coach retains the pin value but drops `added` when building its target. **Reproduced:** 100 lb pin + 25 lb added earned “+5 lb,” but the next row became **105 lb total**, 20 lb lighter. Checking it saves that incomplete resistance.  
   **Exact fix:** Preserve the pin/add-on breakdown through `PlannedChange` and `CoachTarget`. Calculate changes using complete resistance and pass the preserved add-on as `loadAt()`’s fourth argument.

7. **MAJOR — STILL OPEN, POSSIBLE BUG: Stale “Keep deleted” deletes a newer successful correction.**  
   [tombstones.ts:143](/Users/rabah/projects/anygym/src/db/tombstones.ts:143), [workouts.ts:248](/Users/rabah/projects/anygym/src/db/workouts.ts:248)  
   Restore a deletion elsewhere, successfully edit it to 19 reps, then invoke the older cancellation. Editing leaves the restoration token valid. **Reproduced:** cancellation removed the corrected set without retaining a tombstone. Whether this is a bug depends on the unspecified concurrent-edit policy.  
   **Exact fix if newer corrections must survive:** Invalidate restoration provenance transactionally on successful edits/type changes, and reject stale cancellation when the restored record has changed.

Typecheck passed. Fault-injected production-module controls passed for Log deduplication, commit-before-cleanup recovery, failed Log/Edit/Delete/Undo/Finish rollback, accepted-Undo recovery, Finish→Undo snapshots, and group-Undo draining. Update checks deferred reloads during active workouts and failed activity reads. Physical iOS termination and live service-worker activation were not tested.