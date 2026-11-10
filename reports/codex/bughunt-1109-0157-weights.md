**6 confirmed findings, all MAJOR and STILL OPEN.** Reviewed completed `[x]` scope and earlier reports; fixed findings are excluded. No files edited.

1. **MAJOR — STILL OPEN: Finish can silently omit a submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:666](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:666)  
   After another tab’s journal write fails, its submission can survive only in the durable draft mirror. Finish overlooks that mirror, succeeds, and clears drafts. **Reproduced:** submitted **73 lb × 19** was absent from the finished workout.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable drafts against submission/cancellation receipts, reject unresolved submissions, and build the Undo snapshot from that authoritative state.

2. **MAJOR — STILL OPEN: Reconciliation erases a different weight when its revision is lower.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Payload fingerprints protect conflicting values only at equal revisions, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**. Different bars, collars, or machine starting weights can disappear through the same branch.  
   **Exact fix:** Preserve differing payload fingerprints regardless of revision ordering. Use immutable submission identities and transactionally coordinated revisions; a higher revision alone must never acknowledge different input.

3. **MAJOR — STILL OPEN: “Finish without it” can discard a weight the user never reviewed.**  
   [ExerciseView.tsx:313](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:313), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry reuses its operation ID. Two tabs can submit different values with the same ID, revision, and operation. **Reproduced:** the sheet represented **53 lb × 17**, but dismissing it deleted the later **73 lb × 19** journal and left no failed row.  
   **Exact fix:** Generate `op: newId()` for every toast Retry. Include the payload fingerprint in `ShownRow`; transactionally discard only the exact identity, revision, operation, and fingerprint shown.

4. **MAJOR — STILL OPEN: Backup omits a durably retained weight correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the database snapshot. **Reproduced:** a correction to **73 lb × 19** became durable during that gap; the backup contained the old **53 lb × 10** and a subsequently logged set, but no correction. Restoring loses the intended edit.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction with sets, journals, and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

5. **MAJOR — STILL OPEN: Coach “+5 lb” drops stack add-on resistance.**  
   [levelUp.ts:61](/Users/rabah/projects/anygym/src/lib/coach/levelUp.ts:61), [useWorkout.ts:266](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:266)  
   The coach calculates from the pin value and rebuilds its target without `added`. **Reproduced:** **100 lb pin + 25 lb added = 125 lb** earned “+5 lb,” but the resulting row was **105 lb total**. Checking it saves 105; following the pin increase while retaining the physical add-on means lifting 130.  
   **Exact fix:** Carry the pin/add-on breakdown through `PlannedChange` and `CoachTarget`. Calculate changes from complete resistance through `load.ts`, account for the retained add-on when rounding the pin, and pass it to `loadAt()`.

6. **MAJOR — STILL OPEN: Logging can resurrect a removed pending set.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage unavailable, a clean cached row is inserted whenever IndexedDB lacks that slot—even when another tab intentionally removed it. Logging or retrying elsewhere invokes this merge. **Reproduced:** removed **73 lb × 19** input returned to durable storage and can become loggable again.  
   **Exact fix:** Remove the clean-row insertion fallback. Merge only dirty changes and explicit deletions; clean rows must adopt committed state, including absence. Refresh memory from the committed result.

Verification: TypeScript passed; **510 plate sum/solver round trips** passed across lb/kg, bars, and collars. **16 load variants** retained their complete snapshots through Log, Edit, Delete, Undo, equipment changes, and Finish. The six failures above were reproduced with production functions in memory. Physical iPhone behavior and live browser race timing were not tested.