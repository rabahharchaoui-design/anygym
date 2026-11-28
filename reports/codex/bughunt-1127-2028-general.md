The highest-risk findings are conditional loss of workout or run data and a retry that can save a different weight from the one displayed. All findings below were reported earlier and are **STILL OPEN** in the current source.

1. **MAJOR — STILL OPEN: Finish can omit a checked set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If a Log journal write fails in another app context, the submitted row can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so the finished workout can omit the set.  
   **Exact fix:** Register submissions under the session lock. At Finish, reconcile submitted durable drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

2. **MAJOR — STILL OPEN: A failed recovery read can jeopardize an unfinished run.**  
   [runEngine.ts:249](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:249)  
   A storage read error is treated as no run to restore. The user can start another run, potentially overwriting the shared live snapshot and compromising recovery of the earlier route.  
   **Exact fix:** Distinguish a read error from an empty result, offer Retry, and block Start until recovery succeeds. Key snapshots by run ID and enforce one active run transactionally.

3. **MAJOR — STILL OPEN: Retry can save a different weight from the one shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72), [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69)  
   A failed row is rebuilt for display using current equipment settings, while Retry submits the stored draft. An earlier report reproduced **125 lb displayed after a bar change while Retry saved 135 lb**.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. Replace both only after the user confirms a correction.

4. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Separate app contexts allocate draft revisions independently, but reconciliation checks for different payloads only when revisions match. A lower-revision draft containing values that never saved can be discarded against a higher-revision receipt.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicts at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN: Rapid checks can acknowledge an unsaved set.**  
   [useLogRow.ts:31](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:31), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can be claimed before their deferred writes begin. If the writes overlap, the second can receive the first write’s successful promise without its own write running. An earlier audit reproduced the queue interleaving; **I’m not sure ordinary phone taps can reach the required timing**.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own commit.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:87](/Users/rabah/projects/anygym/src/db/backup.ts:87)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections, so restoring the backup returns older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another context removed it. Old weight and reps can return as a pending row and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: Different cable stations share one setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58)  
   Every exercise with “cable” in its name uses the same machine key. At a gym with stations using different stack increments, configuring one changes the picker for the other, which can offer and save an unavailable pin weight.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

9. **MAJOR — STILL OPEN: A dumbbell-range edit can reinterpret pounds as kilograms.**  
   [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30), [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56)  
   The equipment screen caches range numbers without their unit, and the setter does not check the entry unit. After a unit change, a cached **5–50 lb** range can be stored as **5–50 kg**, offering weights that may not exist at the gym.  
   **Exact fix:** Pass the entry unit to the setter and reject a mismatch inside its transaction. Clear or revalidate the fields and cached range when the gym unit changes.

10. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
    [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137)  
    The plateau check compares pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
    **Exact fix:** Compare complete saved loads using `sameResistance()` and format the explanation from the complete resistance.

11. **MAJOR — STILL OPEN: Run setup accesses location before a run is active.**  
    [RunStart.tsx:52](/Users/rabah/projects/anygym/src/screens/run/RunStart.tsx:52), [useGeo.ts:79](/Users/rabah/projects/anygym/src/hooks/useGeo.ts:79)  
    Once permission has been granted, opening Run automatically starts a location watch before Start. That conflicts with SPEC §0’s promise that location is used only while a run is active. Completed PLAN item 4.2 explicitly calls for this setup behavior, so the instructions conflict.  
    **Exact fix:** Resolve the product-instruction conflict. To satisfy §0 as written, start the watch only when the run becomes active and stop it when the run ends.

This was a read-only source review of completed features. I checked the earlier reports against the current code, but did not rerun their failure-injection reproductions or test on a physical iPhone. Several save issues depend on storage failures, overlapping contexts, or both; this review is not an exhaustive audit of every source file or historical report.