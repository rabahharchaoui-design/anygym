Reviewed earlier reports, SPEC.md, PLAN.md and completed `[x]` scope. No files edited. Typecheck passed. Read-only probes used actual modules with in-memory IndexedDB; UI findings are source-traced, without physical iPhone testing. Fixed earlier findings are excluded.

1. **MAJOR — Finish discards a set whose pending Log write fails.**  
   [logQueue.ts:83](/Users/rabah/projects/anygym/src/lib/logQueue.ts:83), [WorkoutScreen.tsx:309](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:309)  
   Tap ✓, then Finish while saving is pending. If that Log fails, `settle()` ignores its `false` result; Finish saves the remaining sets and clears every draft, losing the failed submission. The queue/database outcome was reproduced. Violates SPEC §§0, 13.3.  
   **Exact fix:** Track failed submissions until successfully retried or explicitly discarded. Make Finish reject when any submission fails, preserving drafts and the active session.

2. **MAJOR — Editing an old rep set can replace its reps with one second.**  
   [EditSetSheet.tsx:49](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:49)  
   Log 10 reps, change “Loaded with” to Timed, then edit the original set. The editor uses today’s load type to select Seconds, initialized to `1`. Save removes the original reps and stores `seconds: 1` with the old rep-based load. The database accepts this malformed combination.  
   **Exact fix:** Determine the editor’s count mode from the saved set’s load kind and count fields. Use the current exercise setting only for legacy sets lacking that information; validate count/load compatibility before saving.

3. **MAJOR — STILL OPEN, edit path: Smith sets can enter free-weight history.**  
   [SetLoadInput.tsx:169](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:169)  
   In Edit set, choose a configured Smith bar instead of Olympic and immediately Save. `setLocalBar()` schedules new state, but `change()` reads the previous render’s bar ID. The set receives the Smith weight with `barId: 'olympic'`, contaminating history and PR comparisons. Ordinary logging’s earlier identity defect is fixed; this edit path remains.  
   **Exact fix:** Pass the newly selected ID and weight explicitly into the canonical-load builder. Initialize historical edits from `ownBarId` even when that bar’s current configured weight differs.

4. **MAJOR — STILL OPEN, active-workout path: read failures have no recovery UI.**  
   [useWorkout.ts:52](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:52), [WorkoutScreen.tsx:326](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:326)  
   History and Today now handle read errors, but the workout hook drops every query’s error and retry function. A failed session read redirects home as though the session were missing; failed gym/history reads can leave permanent skeletons, while failed set reads can present incomplete data. Violates SPEC §13.1.  
   **Exact fix:** Expose aggregated errors and retries from `useWorkout`, render `LoadError`, and prevent logging/finishing while required data is unavailable. Redirect for a missing session only after a successful read.

5. **MAJOR — Manually correcting a timed set can still save the stopwatch value.**  
   [ExerciseView.tsx:156](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:156), [ExerciseView.tsx:304](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:304)  
   Stop a hold at 30 seconds, then change its Hold field to 60. Editing updates `seconds` but retains the stopwatch. Display and Log continue preferring its 30 seconds, overriding the explicit correction. Copying LAST TIME has the same conflict.  
   **Exact fix:** When manually changing or copying seconds, clear the row’s stopwatch or replace it with a stopped watch representing that duration. Display and logging must use the same selected duration.

6. **MINOR — Deleting a logged set moves the pending draft away from the current row.**  
   [WorkoutScreen.tsx:253](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:253), [setTable.ts:90](/Users/rabah/projects/anygym/src/lib/setTable.ts:90)  
   With two logged sets, change pending set 3 to 17 reps, then delete an earlier set. The current row becomes set 2 with reconstructed values; the 17-rep draft stays on set 3. The row change was reproduced with `pendingRows()`. A user checking the next highlighted row can record unintended values.  
   **Exact fix:** Reconcile pending drafts when logged rows are deleted/restored, shifting them with their logical rows. Prefer stable row IDs over indexes derived from `logged.length`.

7. **MINOR — “Rest over” never automatically clears while the workout clock runs.**  
   [RestDock.tsx:36](/Users/rabah/projects/anygym/src/screens/workout/RestDock.tsx:36)  
   The dismissal effect depends on `onDone`. WorkoutScreen supplies a new inline callback every second, so its 2.5-second timeout keeps restarting. The bar remains until manually closed, and first-time hints stay blocked.  
   **Exact fix:** Pass a stable `useCallback` handler, or keep the latest handler in a ref and schedule dismissal only when the rest timer transitions to done.