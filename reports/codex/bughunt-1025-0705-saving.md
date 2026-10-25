Found **6 issues in completed `[x]` features**. No files edited. Fixed earlier findings are excluded. Typecheck passed; in-memory probes reproduced the failures below. UI timing and iOS termination were source-traced, without physical iPhone testing.

1. **MAJOR — STILL OPEN: Leaving the workout removes protection against a failed Undo.**  
   [WorkoutScreen.tsx:112](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:112), [workouts.ts:302](/Users/rabah/projects/anygym/src/db/workouts.ts:302)  
   Delete a set, let IndexedDB reject Undo acceptance, then minimize and resume. The recreated deletion queue forgets the unresolved request. Finish now deletes its tombstone permanently. **Reproduced:** neither the set nor its recovery record remained.  
   **Exact fix:** Own the deletion queue at session level across screen unmounts. Preserve unresolved Undo requests and block Finish until restoration or explicit cancellation succeeds.

2. **MAJOR — NEW: Recovery can duplicate a newer edit that already saved successfully.**  
   [setTable.ts:96](/Users/rabah/projects/anygym/src/lib/setTable.ts:96), [durable.ts:75](/Users/rabah/projects/anygym/src/lib/durable.ts:75)  
   Edit a submitted row during its write: reconciliation preserves the newer values under a random replacement ID. If localStorage and IndexedDB mirror writes fail, that replacement identity never persists. Logging the replacement can still succeed. Restarting then assigns another ID to the stale original draft, allowing the same lift again. **Reproduced:** saved reps became `[10, 12, 12]`.  
   **Exact fix:** Persist the successor identity with the submission receipt transactionally. Reconciliation must reuse that identity and follow committed successors until the recovered draft is consumed or genuinely pending.

3. **MAJOR — NEW: A set-type change can commit after Finish advances the plan.**  
   [ExerciseView.tsx:209](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:209), [workouts.ts:165](/Users/rabah/projects/anygym/src/db/workouts.ts:165)  
   During a delayed Finish, logged set-type buttons remain active. Their writes can queue behind Finish and change a working set into a warmup afterward. **Reproduced:** Finish recorded 16/16 exercises complete and advanced the plan; the resulting workout actually completed 15/16.  
   **Exact fix:** Apply the synchronous finishing lock to set-type changes and drain existing mutations. Include `sessions` in `updateSetType()`’s transaction and reject changes when the parent workout has ended.

4. **MAJOR — STILL OPEN: Checking rows out of order permanently blocks an enabled ✓.**  
   [logQueue.ts:129](/Users/rabah/projects/anygym/src/lib/logQueue.ts:129), [ExerciseView.tsx:146](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:146)  
   Check row 3, then the next highlighted row. The remaining pending row occupies index 2, but that index still belongs to the first submission’s claim. Its enabled ✓ silently does nothing. **Reproduced:** three submissions invoked only two writers.  
   **Exact fix:** Key claims by stable draft identity. Release claims when their submitted IDs appear among committed sets; do not use `row < logged.length` as the release condition.

5. **MAJOR — STILL OPEN: Changing units silently turns weighted history into an unweighted set.**  
   [progression.ts:152](/Users/rabah/projects/anygym/src/lib/progression.ts:152), [setTable.ts:207](/Users/rabah/projects/anygym/src/lib/setTable.ts:207)  
   Finish dips at **+25 lb**, switch to kg, and start another workout. Progression produces no valid converted load; pending-row fallback substitutes unweighted bodyweight. **Reproduced:** the prefilled, loggable row had `total: 0`. The earlier pending-draft unit fix does not cover this history path.  
   **Exact fix:** Convert the historical addition through `load.ts` and confirm an available destination load. When conversion cannot produce a valid target, block the row instead of falling back to zero resistance.

6. **MAJOR — STILL OPEN: Warmups consume prescribed working-set rows.**  
   [useWorkout.ts:155](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:155), [ExerciseView.tsx:94](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:94)  
   Mark a normal exercise’s three prescribed rows as warmups and log them. Progress reaches completion and no prescribed working rows remain, despite zero working sets. Finish subsequently reports incomplete progress. **Reproduced:** three warmups left zero pending rows.  
   **Exact fix:** Separate logged-row count from prescribed working-set completion. Exclude warmups from normal-lift completion and retain the remaining working rows; count dedicated warmup blocks independently.

Fault-injection checks confirmed transactional rollback for Log, Edit, Delete, accepted-Undo restoration, and Finish. Update guards correctly refused reload during an active workout or failed activity read. Full browser suites and real service-worker/iOS kill tests were not run.