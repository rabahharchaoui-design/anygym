**7 findings in completed `[x]` features.** No files edited. Earlier fixed findings are excluded.

1. **MAJOR — STILL OPEN: Failed Undo acceptance loses the set after restart.**  
   [sessionRecovery.ts:38](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:38), [tombstones.ts:80](/Users/rabah/projects/anygym/src/db/tombstones.ts:80)  
   Delete a set, let IndexedDB reject Undo acceptance, then restart after the five-second window. The unresolved request was memory-only; recovery expires its tombstone. **Reproduced: neither set nor recovery record remained.**  
   **Exact fix:** Journal requested Undo through a durable fallback and hydrate it before recovery or Finish. Retain ambiguous deleted records for explicit recovery when intent could not be persisted; do not blindly expire them after restart.

2. **MAJOR — NEW: Automatic recovery makes “Keep it deleted” save the set anyway.**  
   [sessionRecovery.ts:39](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:39), [tombstones.ts:93](/Users/rabah/projects/anygym/src/db/tombstones.ts:93)  
   Undo acceptance succeeds, but restoration fails. Minimize and resume: recovery restores the set, while the session manager still considers Undo unresolved. Finish offers “Keep it deleted”; cancellation removes only the tombstone, so Finish retains the restored set. **Full sequence reproduced.**  
   **Exact fix:** Run automatic recovery through the session manager and clear its unresolved state after successful restoration. Serialize recovery and cancellation, and transactionally verify the tombstone before restoring so cancellation cannot be followed by a stale restore.

3. **MAJOR — NEW: A startup recovery error exposes stale draft values as current.**  
   [main.tsx:31](/Users/rabah/projects/anygym/src/main.tsx:31)  
   After termination, IndexedDB can hold a newer draft than localStorage. If the initial mirror read fails, `.catch(() => [])` silently mounts the app without recovery or a retry path. Later workout reads can succeed, allowing the obsolete draft to be logged and overwrite recovery data. **Reproduced: the app-facing draft contained 10 reps while its durable copy contained 17.**  
   **Exact fix:** Keep workout mutations and mirror writes blocked until hydration succeeds. Expose the startup failure with Retry, and rerun `restoreMirrors()` before enabling the workout.

4. **MAJOR — STILL OPEN: An open editor changes the wrong pending row after another Log completes.**  
   [ExerciseView.tsx:202](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:202), [ExerciseView.tsx:249](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:249)  
   Check row 3 during a delayed save, then open row 2’s picker. When row 3 commits, pending rows move, but the editor still targets the previous index. **Actual handler probes reproduced:** the weight picker changed both remaining rows; the type picker changed the preceding row. Those unintended values can subsequently be saved.  
   **Exact fix:** Assign and persist a stable draft identity when opening an editor. Store that identity as the target, resolve its current slot when applying changes, and apply downward weight changes from that slot.

5. **MAJOR — NEW: Edit Save bypasses Finish’s mutation lock.**  
   [WorkoutScreen.tsx:293](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:293), [workouts.ts:151](/Users/rabah/projects/anygym/src/db/workouts.ts:151)  
   During a slow Finish, logged rows remain editable. A Save queued behind Finish can modify the already-ended workout: `onSave()` neither checks the finishing lock nor joins the tracked mutations, and `updateSet()` never checks the parent session. **Database acceptance reproduced; browser timing is source-traced.**  
   **Exact fix:** Refuse opening or saving edits once finishing starts, track existing saves through `logQueue.mutate()`, and include `sessions` in `updateSet()`’s transaction, rejecting missing or ended parents.

6. **MAJOR — NEW, potential activation race: An update can reload a newly started workout.**  
   [pwa.ts:23](/Users/rabah/projects/anygym/src/pwa.ts:23)  
   Activity is checked before requesting service-worker activation. A workout started between that check and the worker taking control can still be interrupted by the plugin’s unconditional reload. Open picker/editor changes could disappear. **Source-traced; real service-worker timing was not reproduced.**  
   **Exact fix:** Supply an `onNeedReload` handler that rechecks activity at the actual reload boundary. Coordinate workout startup with update application so a workout cannot start between the final check and reload.

7. **MINOR — STILL OPEN: Added unlogged rows disappear after restart when localStorage is full.**  
   [extraSets.ts:43](/Users/rabah/projects/anygym/src/lib/extraSets.ts:43), [main.tsx:31](/Users/rabah/projects/anygym/src/main.tsx:31)  
   A failed “+ Add set” storage write skips the IndexedDB mirror. Startup also provides no extra-set hydrator when localStorage remains unavailable. **Reproduced: one added row became zero after discarding runtime memory.**  
   **Exact fix:** Call `mirrorValue()` on write failure, add an extra-set hydrator, and register it with `restoreMirrors()`. Apply the fallback to clearing extra rows too.

Typecheck passed. In-memory fault injection verified rollback for Log, Edit, Delete and Finish, same-ID deduplication, journal recovery of failed Logs, and recovery after accepted-Undo restoration failure. Physical iPhone termination and full browser suites were not run.