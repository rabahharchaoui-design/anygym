I found **nine MAJOR issues** in completed features. All were reported earlier and are **STILL OPEN** in the current source. The most serious can lose a checked set or save a different load from the one displayed.

1. **MAJOR — STILL OPEN: Finish can omit a checked set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks journals and held corrections, but does not reconcile submitted drafts from another app context. If that context’s journal write fails, Finish can close the workout without the checked set.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile durable submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build Undo from the reconciled state.

2. **MAJOR — STILL OPEN: Rapid checks can leave a set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77). Two different rows can be claimed before their deferred writes begin. If the writes overlap, the second can receive the first row’s promise without its own write running. The queue interleaving was reproduced in an earlier report; whether the timing occurs during normal phone interaction remains unverified.  
   **Exact fix:** Reserve the exercise synchronously before deferring work. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each only after its own write commits.

3. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163) compares payload fingerprints only when revisions match, although separate app contexts allocate revisions independently. A lower-revision draft with different values can be discarded even though those values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

4. **MAJOR — STILL OPEN: Retry can save a different load from the one shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69). A failed row is displayed using current equipment settings, while Retry submits its stored draft. An earlier reproduction showed **125 lb on a women’s bar** displayed while Retry saved **135 lb on an Olympic bar**.  
   **Exact fix:** Display and retry the same canonical submitted payload, including its equipment snapshot. A confirmed correction should replace both the displayed draft and journal payload with a new revision.

5. **MAJOR — STILL OPEN: A failed run-recovery read permits a new run.**  
   [runEngine.ts:216](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:216), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37). A storage read failure is treated as no run to recover. Starting another run can replace the shared live snapshot and make the unfinished route unreliable to recover.  
   **Exact fix:** Represent recovery failure separately from an empty database, offer Retry, and block Start until the read succeeds. Store snapshots by run ID and enforce one active run transactionally.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82) captures held corrections before its database snapshot. A failed edit retained between those reads can be absent from both the exported set and retryable corrections, so restoring the backup returns older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194). When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context deliberately removed it. Old weight and reps can return and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: Different cable stations share one setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58) assigns every exercise with “cable” in its name the same machine key. If stations have different stack increments, configuring one changes the picker for the other, which can offer a weight unavailable on the station in use.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for an exercise, and associate its settings and saved loads with that ID.

9. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134) compares pin values without add-ons. Two hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads using `sameResistance()` and format the explanation from complete resistance.

This was a read-only source review; I changed no files. I did not rerun the earlier reproductions or test the failure and concurrency paths on a physical iPhone. Those scenarios remain qualified accordingly; the absence of a small-screen or accessibility finding here is not a certification that those areas are clear.