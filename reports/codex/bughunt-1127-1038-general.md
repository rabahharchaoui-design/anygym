The highest-risk issues are conditional data loss and a Retry action that can save a different weight from the one displayed. The findings below were reported earlier and remain **STILL OPEN** in the current source.

1. **MAJOR — STILL OPEN: Finish can omit a checked set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a Log journal write fails in another app context, the submitted row can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so the workout can finish without the set.  
   **Exact fix:** Register submissions under the session lock. At Finish, reconcile submitted durable drafts against commit and cancellation receipts, refuse unresolved submissions, and include reconciled state in the Undo snapshot.

2. **MAJOR — STILL OPEN: Retry can save a different weight from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   A failed row is rebuilt for display using current equipment settings, while Retry submits the stored load. An earlier audit reproduced 125 lb displayed after a bar change while Retry saved 135 lb.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. Replace both only after the user confirms a correction.

3. **MAJOR — STILL OPEN: A failed recovery read can jeopardize an unfinished run.**  
   [runEngine.ts:249](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:249), [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37)  
   A storage read error is treated as no run to restore. Starting another run can overwrite the shared live snapshot, compromising recovery of the earlier route.  
   **Exact fix:** Distinguish a read error from an empty result, offer Retry, and block Start until recovery succeeds. Key snapshots by run ID and enforce one active run transactionally.

4. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Separate app contexts allocate revisions independently, but reconciliation detects different payloads only when revisions match. A lower-revision draft with different values can be discarded against a higher-revision receipt even if its values never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN: Rapid checks can acknowledge an unsaved set.**  
   [useLogRow.ts:31](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:31), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes begin. If the writes overlap, the second can receive the first write’s successful promise without its own write running. An earlier audit reproduced the queue interleaving; **I’m not sure ordinary phone taps can reach the required timing**.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own commit.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and the retryable corrections, so restoring that backup returns older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context removed it. Old weight and reps can return as a pending row and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: Different cable stations share one setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58)  
   Every exercise whose name contains “cable” uses the same machine key. At a gym with stations using different stack increments, configuring one changes the picker for the other, which can offer and save a pin weight unavailable on that station.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

9. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without add-ons. Hard workouts at 100 + 25 lb and 100 + 50 lb can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads using `sameResistance()` and format the explanation from the complete resistance.

10. **MAJOR — STILL OPEN: Run setup accesses location before a run is active.**  
    [RunStart.tsx:52](/Users/rabah/projects/anygym/src/screens/run/RunStart.tsx:52), [useGeo.ts:79](/Users/rabah/projects/anygym/src/hooks/useGeo.ts:79)  
    Once permission has been granted, opening Run automatically starts a location watch before Start. That conflicts with SPEC §0’s promise that location is used only while a run is active. Completed PLAN item 4.2 explicitly calls for the setup behavior, so the instructions conflict.  
    **Exact fix:** Resolve the product-instruction conflict. To satisfy §0 as written, start the watch only when the run becomes active and stop it when the run ends.

This was a read-only source review. I did not rerun the earlier failure-injection reproductions or test on a physical iPhone; several data-loss cases depend on storage failures or overlapping app contexts. No files were edited.