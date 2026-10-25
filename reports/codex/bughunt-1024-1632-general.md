Found **12 findings** in completed `[x]` features. Fixed earlier findings are excluded. No files edited. Typecheck passed; in-memory probes confirmed queue, draft, Undo and record defects. UI findings are source-traced; no physical iPhone testing.

1. **MAJOR — STILL OPEN: Finish discards failed set submissions.**  
   [logQueue.ts:83](/Users/rabah/projects/anygym/src/lib/logQueue.ts:83), [WorkoutScreen.tsx:364](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:364)  
   Check a set, then Finish while saving. If Log fails, `settle()` still resolves and Finish clears all drafts. Reproduced: failed Log returned `false`; Finish reported success. Violates SPEC §§0, 13.3.  
   **Exact fix:** Retain failed submissions until successfully retried or explicitly discarded. Reject Finish while failures remain, preserve drafts, and synchronously block new submissions once finishing starts.

2. **MAJOR — STILL OPEN: App termination after Log commits can hide a draft and duplicate a lift.**  
   [ExerciseView.tsx:165](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:165), [ExerciseView.tsx:179](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:179)  
   IndexedDB saves the set before separate draft cleanup. Termination between them leaves stale row indexes. With pending 7-, 8- and 19-rep rows, logging the third then restarting exposes `[8, 19]`: 7 disappears and the saved 19 remains available to log again.  
   **Exact fix:** Persist stable row/submission IDs before submission. Commit the set and pending-row reconciliation together in IndexedDB; reconcile committed IDs on startup before displaying drafts.

3. **MAJOR — STILL OPEN: Accepted Undo loses its recovery record on termination.**  
   [deleteUndo.ts:39](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:39)  
   Delete a set, tap Undo, then terminate before restoration commits—or after it fails. The only recovery record is in memory. A fresh queue cannot restore the missing set.  
   **Exact fix:** Store the deleted record and expiry transactionally with deletion. Persist accepted Undo requests, replay them on startup, and consume recovery data only after successful restoration or intentional expiry.

4. **MAJOR — STILL OPEN: Delayed logging destroys newer edits.**  
   [setTable.ts:160](/Users/rabah/projects/anygym/src/lib/setTable.ts:160)  
   Edit a submitted row while its save runs. Cleanup overwrites that newer revision when logging out of order; in-order logging drops it when the next row already has a draft. Reproduced: the newer 17-rep edit disappeared.  
   **Exact fix:** Preserve newer submitted revisions in both branches. Move occupied drafts to make room, extending pending rows when necessary; preserve their weights, reps and stopwatch state.

5. **MAJOR — STILL OPEN: Dumbbell wheel display can disagree with Save/Done.**  
   [DumbbellWheel.tsx:95](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:95)  
   Scrolling updates the displayed weight immediately but publishes the load after a 110 ms pause. Confirmation can retain 30 each while the wheel shows 50 each, saving 60 total instead of 100. Also affects single weights. **Physical touch timing remains unverified.**  
   **Exact fix:** Disable confirmation until scrolling settles, or synchronously capture and commit the displayed snapped selection before confirming.

6. **MAJOR — STILL OPEN: Changing bars inside Edit saves the previous bar’s identity.**  
   [SetLoadInput.tsx:170](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:170)  
   Choose Smith while editing an Olympic set. `setLocalBar()` schedules state, but `change()` immediately reads the old ID. Smith weight is saved as Olympic, contaminating history and progression.  
   **Exact fix:** Pass the selected bar ID and weight explicitly into the load builder. Initialize historical edits from `ownBarId` regardless of today’s configured bar weight.

7. **MAJOR — STILL OPEN: Editing an old rep set can replace its reps with one second.**  
   [EditSetSheet.tsx:49](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:49)  
   Log 10 reps, change “Loaded with” to Timed, then edit that set. Today’s setting selects Seconds, initialized to `1`; Save removes the reps while retaining the original load. Database acceptance was reproduced.  
   **Exact fix:** Derive count mode from the saved load and count fields. Consult current settings only for incomplete legacy records. Reject incompatible count/load combinations in `logSet()` and `updateSet()`.

8. **MAJOR — STILL OPEN: Copying a hold duration can save the old stopwatch value.**  
   [ExerciseView.tsx:145](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:145), [ExerciseView.tsx:201](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:201)  
   Stop at 30 seconds, then copy a 60-second LAST TIME value. Copy changes `seconds` but retains the watch; logging captures its 30 seconds instead.  
   **Exact fix:** Copied or manually edited seconds must replace the watch with a stopped watch representing that duration. Display and logging must consume the same value.

9. **MAJOR — STILL OPEN: Active-workout read failures lack recovery and mutation protection.**  
   [useWorkout.ts:52](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:52), [WorkoutScreen.tsx:388](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:388)  
   The hook discards query errors and retries. An initial session-read failure redirects home; other failures can leave permanent skeletons or stale data while Finish remains available. Violates SPEC §13.1.  
   **Exact fix:** Expose required-query errors and a combined retry. Render `LoadError`, disable mutations while required data is unavailable, and redirect for missing sessions only after a successful read.

10. **MINOR — STILL OPEN: Delete/Undo detaches drafts from the next highlighted row.**  
    [setTable.ts:90](/Users/rabah/projects/anygym/src/lib/setTable.ts:90)  
    With two logged sets, change pending set 3 to 17 reps, then delete an earlier set. The highlighted row becomes set 2 with reconstructed 10 reps; the intended 17 remains on set 3. Reproduced.  
    **Exact fix:** Attach pending drafts to stable row identities across deletion/restoration. Until then, shift draft keys whenever the logged-row boundary changes, preserving revisions and stopwatch state.

11. **MINOR — STILL OPEN: Current stack settings prevent honest historical corrections.**  
    [StackSelector.tsx:45](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:45)  
    Log 15 lb using 5 lb increments, change increments to 10, then edit the old set. Opening the picker clears its historical load and disables Save; correcting reps requires changing the recorded weight.  
    **Exact fix:** Preserve the saved pin, added load and total during historical editing. Apply current-step validation only after an explicit weight change.

12. **MINOR — STILL OPEN: Cross-unit rep records are missed.**  
    [records.ts:57](/Users/rabah/projects/anygym/src/lib/records.ts:57)  
    The “lifted before” check uses `sameLoad()`, which requires identical units. Equivalent historical weights miss rep records; even unweighted bodyweight sets are affected. Reproduced with 10 prior reps in lb and 12 new reps in kg.  
    **Exact fix:** Compare compatible loads after conversion through `load.ts`, with a defined tolerance. Treat unweighted bodyweight loads as unit-independent.