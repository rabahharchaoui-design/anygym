The highest-risk issues are a submitted set being omitted at Finish and a retried set being saved at a different weight from the one displayed. The findings below were reported previously and are **STILL OPEN** in the current source.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78) checks the journal and held corrections, but does not reconcile submitted rows in the durable draft mirror. If a Log journal write fails in another app context, Finish can save the workout without that checked set.  
   **Exact fix:** Register submissions under the session lock. At Finish, reconcile submitted durable drafts against commit and cancellation receipts, refuse unresolved submissions, and include the reconciled state in the Undo snapshot.

2. **MAJOR — STILL OPEN: Retry can save a different weight from the one displayed.**  
   [useExerciseRows.ts:72](/Users/rabah/projects/anygym/src/screens/workout/useExerciseRows.ts:72) rebuilds a failed row using current equipment settings, while [useLogRow.ts:69](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:69) retries the stored draft. An earlier audit reproduced **125 lb displayed with a women’s bar while Retry saved 135 lb with an Olympic bar** after the bar choice changed.  
   **Exact fix:** Display and retry the same canonical submitted load, including its equipment snapshot. A confirmed correction should replace both with a new revision.

3. **MAJOR — STILL OPEN: A failed recovery read permits a new run.**  
   [runEngine.ts:241](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:241) treats a storage error as if there were no unfinished run. Starting another can overwrite the shared live snapshot in [runs.ts:37](/Users/rabah/projects/anygym/src/db/runs.ts:37), compromising recovery of the earlier route.  
   **Exact fix:** Distinguish recovery failure from an empty result, offer Retry, and block Start until recovery succeeds. Key snapshots by run ID and enforce one active run transactionally.

4. **MAJOR — STILL OPEN: Recovery can discard unsaved weight or reps.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163) can consume a lower-revision draft against a higher-revision receipt without comparing their payloads. Separate contexts allocate revisions independently, so the discarded values may never have been saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or causal history proves it was superseded. Preserve conflicting payloads at every revision and coordinate revision allocation across contexts.

5. **MAJOR — STILL OPEN, timing-dependent: Rapid checks can acknowledge a set without saving it.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34) can claim distinct rows before their deferred writes start. If they overlap, [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77) returns the first write’s promise to the second without running its write. An earlier audit reproduced the queue interleaving; **I am not sure ordinary phone taps can reach it**.  
   **Exact fix:** Reserve the exercise synchronously, deduplicate only identical submission IDs, queue distinct submissions, and acknowledge each only after its own commit.

6. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:87](/Users/rabah/projects/anygym/src/db/backup.ts:87) captures held corrections before reading the database snapshot. A failed edit retained between those reads can be absent from both the exported set and the retryable corrections; restoring the backup returns the older values.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: A dumbbell-range edit can reinterpret pounds as kilograms.**  
   [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30) caches range numbers without their unit, and [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56) does not check the unit in which they were entered. After a unit change, a cached **5–50 lb** range can be stored as **5–50 kg**, misrepresenting the available dumbbells.  
   **Exact fix:** Pass the entry’s unit to the setter and reject a mismatch inside its transaction. Clear or revalidate the fields and cached range when the gym unit changes.

8. **MAJOR — STILL OPEN: Different cable stations share one setting.**  
   [exerciseLoad.ts:58](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:58) assigns every exercise named “cable” the same machine key. At a gym with stations using different stack increments, configuring one changes the picker for the other, which can offer and save an unavailable pin weight.  
   **Exact fix:** Give each physical machine a stable gym-specific ID, let the user select it for the exercise, and associate its settings and saved loads with that ID.

9. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134) compares picked pin values without add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

10. **MAJOR — STILL OPEN: A removed draft can reappear.**  
    [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194) can merge a clean cached draft back when its IndexedDB slot is absent. If localStorage is unavailable and another context deliberately removed the draft, old weight and reps can return as a pending row and be logged again.  
    **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence; refresh memory from the committed merge.

11. **MAJOR — STILL OPEN: The default UI suite skips much of the device matrix.**  
    [playwright.config.ts:45](/Users/rabah/projects/anygym/playwright.config.ts:45) limits Android and 320-wide projects to tests tagged `@matrix` unless an environment variable is set. A flow can therefore pass the default suite while failing on a supported small screen, contrary to SPEC §13.3.  
    **Exact fix:** Run the acceptance suite with `PW_FULL_MATRIX=1` in CI and check the Playwright test listing to ensure every UI spec runs on every required project.

This was a read-only source review; no files were edited. I did not rerun the earlier failure-injection reproductions or test physical iPhone, VoiceOver, offline, or small-screen behavior, so those observations remain unverified in this review.