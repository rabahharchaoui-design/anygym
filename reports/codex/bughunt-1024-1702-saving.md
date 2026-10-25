Found **10 findings in completed `[x]` features**, all **STILL OPEN**. No files edited. Typecheck passed; in-memory probes confirmed the queue, reconciliation and database failures below. iOS termination paths were source-traced, not tested on a physical iPhone.

Fixed earlier findings are excluded: monotonic set ordering, Save/Delete serialization, restoration checks against finished sessions, historical collars, and update activity checks.

1. **MAJOR — STILL OPEN: Finish discards failed Log submissions.**  
   [logQueue.ts:83](/Users/rabah/projects/anygym/src/lib/logQueue.ts:83), [WorkoutScreen.tsx:364](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:364)  
   Check a set, then Finish while saving. If IndexedDB rejects Log, `settle()` ignores the failure; Finish ends the workout and clears its drafts. **Reproduced:** Log returned `false`, but Finish reported success with the other set. Logging also remains available after Finish starts.  
   **Exact fix:** Retain failed submission payloads until successfully retried or explicitly discarded. Refuse Finish while failures remain, preserve drafts, and synchronously close the session’s logging queue before draining writes.

2. **MAJOR — STILL OPEN: Termination between Log commit and cleanup loses drafts and permits duplicate lifts.**  
   [ExerciseView.tsx:165](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:165), [ExerciseView.tsx:179](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:179)  
   IndexedDB commits separately from localStorage row reconciliation. Prepare pending rows of 7, 8 and 19 reps, log the third, then terminate before cleanup. Recovery exposes pending `[8, 19]`: the 7-rep draft disappears behind the logged boundary, while the committed 19-rep lift remains loggable. Ordinary recovered row drafts never seed the restarted queue’s ID. **The incorrect recovery rows were reproduced.**  
   **Exact fix:** Persist stable row and submission IDs with submitted values/revisions before writing. Commit the set and pending-row reconciliation together in IndexedDB. Reconcile committed submission IDs before displaying recovered rows; use localStorage only as a mirror.

3. **MAJOR — STILL OPEN: Accepted Undo can permanently lose its set.**  
   [deleteUndo.ts:39](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:39), [deleteUndo.ts:67](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:67)  
   After deletion commits, its recovery record exists only in memory. Termination during an accepted restore—or after its write fails—removes the only retry data. There is also a failure without termination: after Undo rejects, its promise leaves `running`; Finish then succeeds despite the unresolved restore. **Reproduced:** failed Undo followed by Finish discarded the empty session while its recovery record still existed.  
   **Exact fix:** Store the deleted record and expiry transactionally with deletion. Persist accepted restore intent, retain it across failures and restart, and block Finish until it succeeds or the user explicitly cancels it. Never expire an unresolved accepted Undo.

4. **MAJOR — STILL OPEN: Delayed Log completion destroys newer edits.**  
   [setTable.ts:160](/Users/rabah/projects/anygym/src/lib/setTable.ts:160)  
   Edit a submitted row while its write runs. Out-of-order reconciliation overwrites that row’s newer revision. In-order reconciliation drops it when the next row already has a draft. **Reproduced:** a newer 17-rep draft produced only a clear operation.  
   **Exact fix:** Preserve newer submitted revisions in both branches. Move occupied pending rows to make room, extending the table if necessary. Preserve each draft’s load, count, type, revision and stopwatch under a stable row identity.

5. **MAJOR — STILL OPEN: Editing a rep set can replace its reps with one second.**  
   [EditSetSheet.tsx:49](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:49), [workouts.ts:76](/Users/rabah/projects/anygym/src/db/workouts.ts:76)  
   Log 10 reps, change “Loaded with” to Timed, then edit the original set. Today’s setting selects Seconds, initialized to `1`; Save removes the original reps while retaining its rep-based load. **The database accepted this incompatible combination in a probe.**  
   **Exact fix:** Determine count mode from the saved set’s load kind and count fields. Consult current settings only for incomplete legacy records. Validate count/load compatibility in both `logSet()` and `updateSet()`.

6. **MAJOR — STILL OPEN: Changing bars in Edit saves the previous bar’s identity.**  
   [SetLoadInput.tsx:170](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:170)  
   Choose Smith while editing an Olympic set. `setLocalBar()` schedules state, but the immediately invoked `change()` reads the previous ID. Save records Smith weight with Olympic identity, corrupting history comparisons. Initialization also disregards the historical ID when its configured weight changed.  
   **Exact fix:** Pass the selected bar ID and weight explicitly to the canonical load builder. Initialize historical identity directly from `ownBarId`, independently of today’s configured weight.

7. **MAJOR — STILL OPEN: Explicit hold corrections save the old stopwatch duration.**  
   [ExerciseView.tsx:145](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:145), [ExerciseView.tsx:334](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:334)  
   Stop at 30 seconds, then manually select 60 or copy a 60-second LAST TIME value. These actions change `seconds` but retain the watch; Log captures its old 30 seconds and overrides the correction.  
   **Exact fix:** Manual or copied seconds must replace the stopwatch with a stopped watch representing that duration. Display and submission must read the same canonical duration.

8. **MAJOR — STILL OPEN: Dumbbell wheel confirmation can save a different displayed weight.**  
   [DumbbellWheel.tsx:95](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:95)  
   Scrolling updates the readout immediately but publishes the load only after a 110 ms pause. Save/Done remains enabled, so a wheel showing 50 each can confirm the previous 30 each—saving 60 total instead of 100. Single weights are also affected. **The state mismatch is source-confirmed; physical touch reproducibility remains unverified.**  
   **Exact fix:** Disable confirmation while selection is unsettled, or synchronously capture and commit the displayed snapped selection before confirmation. Apply this to both Weight and Edit sheets.

9. **MAJOR — STILL OPEN: Workout read failures allow misleading recovery and unsafe mutations.**  
   [useWorkout.ts:52](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:52), [WorkoutScreen.tsx:388](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:388)  
   The hook drops query errors and retry functions. Initial session-read failure redirects home as though the workout vanished. Other failures leave loading or stale data while Finish remains enabled; stale logged counts can also drive incorrect row reconciliation.  
   **Exact fix:** Expose required-query errors and combined retry. Render `LoadError`, block mutations while required data is unavailable, and redirect for a missing session only after a successful read.

10. **MINOR — STILL OPEN: Delete/Undo detaches pending drafts from the highlighted row.**  
    [setTable.ts:90](/Users/rabah/projects/anygym/src/lib/setTable.ts:90)  
    With two logged sets, edit pending set 3 to 17 reps, then delete an earlier set. The highlighted row becomes set 2 with reconstructed values; the intended 17-rep draft stays on set 3. Undo moves the boundary again. Checking the highlighted row can save unintended values.  
    **Exact fix:** Attach pending drafts to stable row identities across deletion/restoration. Until implemented, shift draft keys with every logged-boundary change, preserving revisions and stopwatch state.