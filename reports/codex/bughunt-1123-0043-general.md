The review found **nine MAJOR issues** in completed features. All were reported previously and remain **STILL OPEN** in the current source. Most require a storage failure or overlapping app contexts; the rapid-tap issue also depends on timing.

1. **MAJOR — STILL OPEN: Finish can omit a checked set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks the write journal and held corrections, but does not reconcile submitted rows in the durable draft mirror. If a Log journal write fails in another app context, Finish can save the workout without that set.  
   **Exact fix:** Register submissions under the session lock. During Finish, reconcile submitted durable drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

2. **MAJOR — STILL OPEN: A failed run-recovery read permits a new run.**  
   [runEngine.ts:241](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:241) treats a storage error as no unfinished run. A new run can then overwrite the single live snapshot at [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37), compromising recovery of the earlier route.  
   **Exact fix:** Distinguish recovery failure from an empty result, offer Retry, and block Start until recovery succeeds. Store snapshots by run ID and enforce one active run transactionally.

3. **MAJOR — STILL OPEN: Retry can save a different weight from the one shown.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72) rebuilds a failed row using current equipment settings, while [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69) retries the stored draft. An earlier audit reproduced **125 lb displayed with a women’s bar while Retry saved 135 lb with an Olympic bar**.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. A confirmed correction should replace both with a new revision.

4. **MAJOR — STILL OPEN, timing-dependent: Rapid checks can acknowledge a set without saving it.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34) can claim two rows before their deferred writes begin. If they overlap, [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77) returns the first write’s promise to the second without running its write. An earlier audit reproduced the queue interleaving; whether ordinary phone taps reach it is unverified.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own write commits.

5. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163) compares payloads when revisions match, but separate app contexts can allocate revisions independently. A lower-revision draft with different values can be discarded even though those values never committed.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82) captures held corrections before reading the database snapshot. A failed edit retained between those reads can be absent from both the exported set and its retryable corrections; restoring the backup returns older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194) can merge a clean cached draft back when its IndexedDB slot is absent. If localStorage is unavailable and another context deliberately removed the draft, old weight and reps can return as a pending row and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

8. **MAJOR — STILL OPEN: A dumbbell-range edit can reinterpret pounds as kilograms.**  
   [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30) caches range numbers without their unit, and [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56) accepts them without checking their originating unit. After a unit change, a cached **5–50 lb** range can be saved as **5–50 kg**, misrepresenting available equipment.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear or revalidate the fields and cached range when the gym unit changes.

9. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134) compares pin values without add-ons. Two hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

This was a read-only source review; I made no edits. I did not rerun the earlier reproductions, inject storage failures, or test small-screen and VoiceOver behavior on a physical iPhone, so those areas remain unverified.