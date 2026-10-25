Found **9 findings** in completed `[x]` features. No files edited. Earlier fixed findings are excluded. Typecheck passed; read-only probes used actual modules with in-memory IndexedDB. Termination scenarios simulate interrupted cleanup and lost process memory; physical iPhone testing was not performed.

1. **MAJOR — STILL OPEN: Finish discards a failed Log submission.**  
   [logQueue.ts:83](/Users/rabah/projects/anygym/src/lib/logQueue.ts:83), [WorkoutScreen.tsx:309](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:309)  
   Tap ✓, then Finish while the write is pending. If Log fails, `settle()` ignores its `false` result. Finish saves the other sets and clears all drafts, permanently losing the failed submission. **Reproduced:** Log returned `false`; Finish returned `{ saved: true, sets: 1 }`.  
   **Exact fix:** Retain failed submissions until retried successfully or explicitly discarded. Make Finish reject while any remain, preserving drafts and the active session. Synchronously prevent new logging once Finish starts.

2. **MAJOR — NEW: Termination between Log commit and row cleanup can lose one draft and duplicate another set.**  
   [ExerciseView.tsx:173](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:173), [ExerciseView.tsx:179](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:179), [setTable.ts:90](/Users/rabah/projects/anygym/src/lib/setTable.ts:90)  
   Prepare rows with 7, 8 and 19 reps; check the third row. If iOS kills the app after IndexedDB commits but before `settleRows()` updates localStorage, recovery skips the 7-rep draft because `logged.length` increased. The already-submitted 19-rep draft remains pending. Ordinary row drafts also never seed the restarted log queue’s ID, so checking it creates another record. **Reproduced:** two separate saved 19-rep sets.  
   **Exact fix:** Give pending rows stable IDs. Persist the submission ID, row identity, values and revision before logging; commit the set and row reconciliation in one IndexedDB transaction. On startup, reconcile committed submission IDs before showing pending rows. Treat localStorage as a mirror.

3. **MAJOR — STILL OPEN, partially fixed: Delayed logging still destroys newer row edits.**  
   [setTable.ts:160](/Users/rabah/projects/anygym/src/lib/setTable.ts:160), [setTable.ts:171](/Users/rabah/projects/anygym/src/lib/setTable.ts:171)  
   Two cases remain: edit a later submitted row while its write runs, or edit the current submitted row when the next row already has a draft. The first branch never checks the submitted row’s newer revision; the second preserves it only when the next slot is empty. **Both reproduced:** the newer 17-rep draft disappeared.  
   **Exact fix:** Preserve a newer submitted revision in both branches. Move existing pending drafts to make room, extending the table when necessary, instead of overwriting or dropping either draft. Reconcile using stable row identities.

4. **MAJOR — STILL OPEN, termination path: Undo recovery is memory-only.**  
   [deleteUndo.ts:39](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:39), [deleteUndo.ts:102](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:102), [workouts.ts:212](/Users/rabah/projects/anygym/src/db/workouts.ts:212)  
   Failed Undo now supports retry while the process survives. However, delete the set, tap Undo, then have its restore fail or abort during termination: reopening loses the only recovery record. The set remains deleted with no way to retry. **Reproduced with a fresh queue:** Undo became unavailable while the record remained absent from IndexedDB.  
   **Exact fix:** Store the deleted record and expiry alongside deletion in one transaction. Persist an accepted Undo request, retry it on startup while the workout is active, and consume the recovery record only after successful restoration or intentional expiry.

5. **MAJOR — STILL OPEN: Editing an old rep set can replace its reps with one second.**  
   [EditSetSheet.tsx:49](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:49), [workouts.ts:130](/Users/rabah/projects/anygym/src/db/workouts.ts:130)  
   Log 10 reps, change “Loaded with” to Timed, then edit the original set. The editor chooses Seconds from the current exercise setting, initialized to `1`. Save removes the original reps and stores `seconds: 1` with the original rep-based load. **Database acceptance reproduced.**  
   **Exact fix:** Derive count mode from the saved set’s load kind and count fields. Consult the current setting only for genuinely incomplete legacy records. Reject incompatible count/load combinations in `logSet()` and `updateSet()`.

6. **MAJOR — STILL OPEN: Changing bars during Edit saves the previous bar’s identity.**  
   [SetLoadInput.tsx:169](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:169)  
   Edit an Olympic set, select a configured Smith bar, then Save. `setLocalBar()` schedules state, but the immediate `change()` reads the previous bar ID. The saved set receives the Smith weight with Olympic identity, contaminating history and records. Initialization can also substitute another identity when the historical bar’s configured weight changed. **Source-traced.**  
   **Exact fix:** Pass the selected ID and weight explicitly into `change()` and the canonical load builder. Initialize historical edits from `ownBarId` regardless of today’s configured weight.

7. **MAJOR — STILL OPEN: Explicit hold corrections can save the old stopwatch duration.**  
   [ExerciseView.tsx:154](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:154), [ExerciseView.tsx:319](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:319)  
   Stop a hold at 30 seconds, then change Hold to 60. The edit changes `seconds` but retains the watch; logging captures its 30 seconds and overrides the correction. Copying LAST TIME has the same conflict. **Source-traced.**  
   **Exact fix:** Manual or copied seconds must clear the stopwatch or replace it with a stopped watch representing that duration. Display and Log must consume the same selected duration.

8. **MAJOR — STILL OPEN: Active-workout read failures have no recovery UI.**  
   [useWorkout.ts:52](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:52), [WorkoutScreen.tsx:326](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:326)  
   The hook discards query errors and retry functions. A failed initial session read redirects home as though the workout vanished; gym/history failures can leave permanent loading states, and set-read failures can present incomplete data.  
   **Exact fix:** Expose required-query errors and a combined retry operation. Render `LoadError`, block mutations while required data is unavailable, and redirect for a missing session only after a successful read.

9. **MINOR — STILL OPEN: Delete and Undo detach pending drafts from the current row.**  
   [WorkoutScreen.tsx:259](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:259), [setTable.ts:90](/Users/rabah/projects/anygym/src/lib/setTable.ts:90)  
   With two logged sets, change pending set 3 to 17 reps, then delete an earlier set. The highlighted current row becomes set 2 with reconstructed values; the 17-rep draft stays on set 3. Undo moves the boundary again. Checking the highlighted row can therefore save unintended values.  
   **Exact fix:** Preserve pending rows by stable identity across deletion/restoration. Until that change exists, shift draft keys whenever logged-row counts change, preserving values, revisions and stopwatch state.