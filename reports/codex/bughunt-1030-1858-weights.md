**10 findings in completed `[x]` features.** No files edited. Fixed earlier findings are excluded.

1. **MAJOR — STILL OPEN: Failed Undo can permanently lose a saved set.**  
   [tombstones.ts:59](/Users/rabah/projects/anygym/src/db/tombstones.ts:59)  
   If Undo acceptance and both intent-storage fallbacks fail, restarting after five seconds deletes the remaining tombstone. Reproduced: neither the set nor its recovery record survived.  
   **Exact fix:** Persist explicit deletion finalization. On startup, retain unfinalized tombstones and require Restore/Keep deleted before Finish; elapsed time alone must not destroy them.

2. **MAJOR — STILL OPEN: Delayed recovery restores an obsolete weight over a newer deletion.**  
   [workouts.ts:295](/Users/rabah/projects/anygym/src/db/workouts.ts:295), [tombstones.ts:87](/Users/rabah/projects/anygym/src/db/tombstones.ts:87)  
   Recovery captures an old tombstone, then checks only whether *any* tombstone exists for that set. Restore, edit, and delete it again before recovery completes: the older snapshot returns. Reproduced: a deleted **155 lb × 17** set returned as **135 lb × 10**.  
   **Exact fix:** Assign each deletion a unique token. Verify that token transactionally and restore the matching tombstone’s current payload. Apply token checks to cancellation and expiry too.

3. **MAJOR — STILL OPEN: Overlapping edits erase the newer failed weight edit’s journal.**  
   [mutations.ts:37](/Users/rabah/projects/anygym/src/db/mutations.ts:37)  
   Concurrent saves share one journal ID. The older save deletes the newer intent before its write fails. Reproduced: the newer **155 lb × 19** edit failed, **135 lb × 17** remained, and no pending mutation blocked Finish.  
   **Exact fix:** Give each mutation a unique operation token. Apply and remove only the matching journal entry; skip superseded operations and retain the newest failed payload.

4. **MAJOR — STILL OPEN: Finish can erase a pending weight edit created after its checks.**  
   [workouts.ts:346](/Users/rabah/projects/anygym/src/db/workouts.ts:346)  
   Finish checks pending writes outside its transaction, then deletes every session journal. Another tab can journal a failed edit between those steps. Reproduced: Finish removed a pending **155 lb** correction and completed with **135 lb**.  
   **Exact fix:** Check unresolved journals inside Finish’s transaction and reject while any remain. Validate session activity transactionally when creating journals.

5. **MAJOR — STILL OPEN: Failure to create the edit journal lets Finish accept the old weight.**  
   [mutations.ts:49](/Users/rabah/projects/anygym/src/db/mutations.ts:49)  
   If the initial journal write fails, the requested correction has no retained recovery entry. Closing Edit loses its values; Finish sees nothing outstanding. Reproduced: a failed **155 lb × 19** correction was followed by successful Finish with **135 lb × 10**.  
   **Exact fix:** Register unresolved mutation payloads in session memory before journaling, retain them on failure, and include them in Finish’s retry/discard checks. Attempt a durable fallback.

6. **MAJOR — Editing reps invents a weight before the user picks one.**  
   [ExerciseView.tsx:129](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:129), [exerciseLoad.ts:134](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:134)  
   On a first-time barbell exercise showing “Pick,” change only the reps. The resulting empty draft is rebuilt as the bare bar, enabling ✓. Reproduced: an unselected weight became—and saved as—**45 lb**. Machines with known starting resistance have the same path.  
   **Exact fix:** Preserve an explicit “weight not selected” state when creating drafts from reps/type edits. Set `noTarget` for empty, unselected rows and clear that restriction only after an explicit weight selection.

7. **MAJOR — STILL OPEN: A stale Delete changes an already-finished workout.**  
   [workouts.ts:252](/Users/rabah/projects/anygym/src/db/workouts.ts:252)  
   Delete never checks its parent session. A stale editor in another tab can remove a set after Finish, changing saved totals while leaving plan completion unchanged. Reproduced: an ended workout lost its only set.  
   **Exact fix:** Include `db.sessions` in the delete transaction and throw `WorkoutFinishedError` for missing or ended parents before modifying sets, counters, or tombstones.

8. **MAJOR — Restoring an imported weight leaves a different number on screen.**  
   [ImportSetSheet.tsx:69](/Users/rabah/projects/anygym/src/screens/settings/ImportSetSheet.tsx:69), [ExactWeightInput.tsx:36](/Users/rabah/projects/anygym/src/components/load/ExactWeightInput.tsx:36)  
   Edit an imported **53 lb** kettlebell set to rejected **501**, then restore the file’s weight. Parent state returns to 53 and Save becomes enabled, but the input still displays **501**. Save accepts the original **53 lb**. Reproduced through component handlers.  
   **Exact fix:** Reset the picker’s local text on explicit restore—for example, increment a reset key and remount `SetLoadInput`. Restore the displayed text, validation state, and canonical load together.

9. **MAJOR — STILL OPEN: Delayed logging redirects the reps editor to another set.**  
   [ExerciseView.tsx:406](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:406)  
   Start logging row 3, then open row 2’s reps editor while saving. When rows move after commit, the editor remains attached to its displayed index and edits a different draft. This can save incorrect reps and lifted volume. **Source-traced; full browser timing was not verified.**  
   **Exact fix:** Store the editor target using `idOf(row)`, resolve its current slot on every render/change, and close it when that identity commits or disappears.

10. **MAJOR — STILL OPEN: Backup omits recovered pending weights when localStorage is unavailable.**  
    [drafts.ts:300](/Users/rabah/projects/anygym/src/lib/drafts.ts:300)  
    Startup can hydrate drafts from IndexedDB, but export ignores that hydrated store until an exercise populates the session cache. Reproduced: a readable **53 lb / 17-rep** draft exported as `{}`. Restoring that backup loses it.  
    **Exact fix:** Include validated `hydrated.get(NO_STORAGE)` contents when storage is absent, then overlay the active memory cache.

Typecheck passed. Read-only probes passed **5,272 sum cases, 138 solver round trips, and mixed-unit volume checks**. Browser suites and physical iPhone behavior were not tested.