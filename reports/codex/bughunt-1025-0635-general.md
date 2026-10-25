Found **8 issues in completed `[x]` features**. No files edited. Fixed earlier findings are excluded. Typecheck passed; in-memory probes confirmed the recovery, logging and calculation failures below. Full browser suites and physical iPhone tests were not run.

1. **MAJOR — STILL OPEN, navigation variant: Failed Undo can permanently lose its set.**  
   [WorkoutScreen.tsx:112](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:112)  
   If persisting Undo acceptance fails, the queue correctly blocks Finish. But minimizing and resuming creates a fresh queue, losing that unresolved state. Finish then deletes the unaccepted tombstone. **Reproduced:** neither the set nor its recovery record remained.  
   **Exact fix:** Own deletion recovery at session level across screen unmounts. Persist unresolved Undo intent before reporting acceptance, and keep Finish blocked until restoration or explicit cancellation succeeds.

2. **MAJOR — STILL OPEN, partial validation: A damaged backup can crash weight selection after Replace.**  
   [backup.ts:143](/Users/rabah/projects/anygym/src/lib/backup.ts:143), [load.ts:360](/Users/rabah/projects/anygym/src/lib/load.ts:360)  
   Validation accepts `stackStep: 1e-12`. The picker rounds its divisor to zero and attempts an infinite-length array. **Reproduced:** parsing succeeds; `stackValues()` throws `RangeError`. Replace has already overwritten the phone’s data.  
   **Exact fix:** Validate gym and per-machine stack steps as positive, supported-precision values with bounded option counts. Defensively enforce those limits inside `stackValues()`; reject invalid backups before restoration.

3. **MAJOR — Checking a later row first can permanently block the remaining ✓.**  
   [logQueue.ts:129](/Users/rabah/projects/anygym/src/lib/logQueue.ts:129)  
   Check row 3, then the next highlighted row. Two sets save, but the remaining row now occupies index 2, which still belongs to the first submission’s claim. Its enabled ✓ silently does nothing. **Queue sequence reproduced.** This breaks SPEC §§13.3 and 20.2.  
   **Exact fix:** Key claims by stable draft identity, not displayed row index. Release a claim when that submitted identity appears among committed sets, preserving stale-render double-tap protection.

4. **MAJOR — Weighted bodyweight history becomes an unweighted target across units.**  
   [progression.ts:152](/Users/rabah/projects/anygym/src/lib/progression.ts:152), [setTable.ts:207](/Users/rabah/projects/anygym/src/lib/setTable.ts:207)  
   Finish dips at **+25 lb**, switch to kg, then start another workout. Conversion produces no target; pending-row fallback supplies unweighted bodyweight instead. **Reproduced:** the prefilled, loggable load has `total: 0`. This is separate from the fixed pending-draft issue.  
   **Exact fix:** Convert the nonzero addition explicitly and request confirmation/reselection where necessary. If no valid target exists, leave the row blocked; never substitute unweighted bodyweight for weighted history.

5. **MAJOR — A failed plan read can silently reset program progress.**  
   [PlanViewer.tsx:21](/Users/rabah/projects/anygym/src/screens/plans/PlanViewer.tsx:21), [PlanViewer.tsx:30](/Users/rabah/projects/anygym/src/screens/plans/PlanViewer.tsx:30)  
   While the active-plan query is pending—or after it fails—the existing plan appears inactive and “Use this plan” remains enabled. Tapping it calls `choosePlan()`, clearing the saved week, next day and completion marks. **Source-confirmed; the reset operation was reproduced.**  
   **Exact fix:** Show loading/error recovery and disable the action until a successful read. Make choosing the already-active plan transactionally idempotent.

6. **MAJOR — Warmups prematurely complete prescribed working sets.**  
   [useWorkout.ts:155](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:155)  
   The workout counts every logged set toward completion. Mark a normal lift’s prescribed rows W: its ring completes and navigation advances despite no working sets. Finish subsequently excludes those warmups and reports incomplete progress. This contradicts SPEC §§20.1 and 21.1.  
   **Exact fix:** Track working-set completion separately from total logged rows. Use it for lift progress, remaining prescribed rows and automatic advancement; count dedicated warmup blocks independently.

7. **MINOR — Full storage loses the rest countdown when minimizing.**  
   [rest.ts:83](/Users/rabah/projects/anygym/src/lib/rest.ts:83)  
   A failed localStorage write skips the durable mirror. The countdown survives only in `WorkoutScreen` state, which minimizing destroys. **Reproduced:** loading the timer after that failure returns `null`.  
   **Exact fix:** Keep rest state in a shared session store, write its IndexedDB fallback when localStorage fails, and hydrate it directly during recovery.

8. **MINOR — Toast actions miss the required touch-target height.**  
   [Toast.module.css:36](/Users/rabah/projects/anygym/src/ui/Toast.module.css:36)  
   Undo, Try again and Share buttons are only **44 px tall**, below SPEC §§0 and 13.3’s 48 pt minimum. The surrounding toast does not activate the action.  
   **Exact fix:** Set the action’s minimum height to `var(--tap)` (48 px), retaining its existing minimum width.