Found **12 findings** in completed `[x]` features. No files changed. Fixed earlier findings are excluded.

Typecheck passed. Read-only probes passed **5,280 weight combinations** and **204 solver round trips** across lb/kg. The remaining problems occur around picker state, equipment identity, editing and persistence. UI sequences are source-traced; physical iPhone testing was not performed.

1. **MAJOR — STILL OPEN: Finish discards failed Log submissions.**  
   [logQueue.ts:83](/Users/rabah/projects/anygym/src/lib/logQueue.ts:83), [WorkoutScreen.tsx:462](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:462)  
   Check a set, then Finish while its write is pending. If Log fails, `settle()` still resolves; Finish clears the drafts and saves an incomplete workout. The queue behavior was reproduced.  
   **Exact fix:** Retain failed submissions until successfully retried or explicitly discarded. Reject Finish while any remain, preserve drafts, and synchronously block new logging when finishing starts.

2. **MAJOR — STILL OPEN: Termination after Log commits can lose a draft and duplicate a lift.**  
   [ExerciseView.tsx:230](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:230), [ExerciseView.tsx:245](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:245)  
   The set commits before separate draft reconciliation. An app kill between those operations leaves stale row indexes and submission IDs. Reopening can skip an unlogged draft and offer the already-saved lift again.  
   **Exact fix:** Persist stable row and submission IDs before logging. Commit the set and row reconciliation in one IndexedDB transaction; reconcile committed IDs during recovery before displaying pending rows.

3. **MAJOR — NEW: The dumbbell wheel can show 50 while Save/Done still holds 30.**  
   [DumbbellWheel.tsx:95](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:95)  
   Touch scrolling updates the displayed weight immediately, but publishes the selected load only after a 110 ms scroll pause. Save/Done remains enabled during this gap. An extracted-handler probe showed **50 each displayed, 30 each retained**—potentially saving 60 total instead of 100. This also affects single weights. Device timing remains unverified.  
   **Exact fix:** Commit the displayed snapped selection before allowing Save/Done. Expose pending scrolling state and disable confirmation until settled, or synchronously capture and commit the current snapped index on confirmation.

4. **MAJOR — STILL OPEN: Changing bars inside Edit saves the previous bar’s identity.**  
   [SetLoadInput.tsx:169](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:169)  
   Choose Smith while editing an Olympic set. `setLocalBar()` schedules the new selection, but `change()` immediately reads the previous render’s ID. Save records Smith weight as Olympic, contaminating free-weight history. Initialization also disregards `ownBarId` when its configured weight has changed.  
   **Exact fix:** Pass the selected ID and weight explicitly into the canonical-load builder. Initialize historical edits from the saved ID regardless of today’s configured weight.

5. **MAJOR — STILL OPEN: Delayed logging destroys newer weight/reps edits.**  
   [setTable.ts:160](/Users/rabah/projects/anygym/src/lib/setTable.ts:160)  
   Editing a later submitted row during its write loses that newer revision when reconciliation overwrites the row. Editing the current submitted row also loses changes when the next slot already contains a draft. The later-row loss was reproduced.  
   **Exact fix:** Preserve newer submitted revisions in both branches. Move existing drafts to make room, extending pending rows when necessary; reconcile by stable row identity.

6. **MAJOR — STILL OPEN: Editing an older rep set can replace its reps with one second.**  
   [EditSetSheet.tsx:49](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:49)  
   Log 10 reps, change “Loaded with” to Timed, then edit the original set. Today’s setting selects Seconds, initialized to `1`; Save removes the original reps while retaining the old weighted load.  
   **Exact fix:** Derive count mode from the saved load kind and count fields. Use current settings only for incomplete legacy records. Reject incompatible count/load combinations in `logSet()` and `updateSet()`.

7. **MAJOR — STILL OPEN: Explicit hold corrections save the old stopwatch duration.**  
   [ExerciseView.tsx:207](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:207)  
   Stop at 30 seconds, then manually change Hold to 60. The retained stopwatch overrides the correction during logging. Copying LAST TIME has the same conflict.  
   **Exact fix:** Manual or copied seconds must replace the stopwatch with a stopped watch representing that duration. Display and logging must consume the same duration.

8. **MAJOR — STILL OPEN: Accepted Undo recovery disappears on termination.**  
   [deleteUndo.ts:39](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:39)  
   Delete, tap Undo, then terminate the app before restoration commits—or after restoration fails. The only recovery record lives in memory; reopening permanently loses the set and the ability to retry.  
   **Exact fix:** Store the deleted record and expiry transactionally with deletion. Persist accepted Undo requests, retry them on startup while the workout remains active, and consume recovery records only after successful restoration or intentional expiry.

9. **MAJOR — STILL OPEN: Active-workout read failures lack recovery and mutation protection.**  
   [useWorkout.ts:52](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:52), [WorkoutScreen.tsx:485](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:485)  
   The hook discards query errors and retry functions. Initial session failures redirect home; other failures can leave permanent loading or stale workout data while logging/finishing remains possible.  
   **Exact fix:** Expose required-query errors and combined retry. Render `LoadError`, block mutations while required data is unavailable, and redirect for a missing session only after a successful read.

10. **MINOR — STILL OPEN: Delete/Undo detaches pending drafts from the current row.**  
    [setTable.ts:90](/Users/rabah/projects/anygym/src/lib/setTable.ts:90), [WorkoutScreen.tsx:400](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:400)  
    With two logged sets, edit pending set 3’s weight/reps, then delete an earlier set. The highlighted row becomes set 2 with reconstructed values; the intended draft remains at index 3. Checking the highlighted row can save unintended values.  
    **Exact fix:** Keep pending rows attached to stable identities across deletion/restoration. Until then, shift draft keys with the logged-row boundary, preserving all values and stopwatch state.

11. **MINOR — NEW: Today’s stack step prevents correcting an older set honestly.**  
    [StackSelector.tsx:45](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:45)  
    Log 15 lb with a 5 lb step, change the machine to 10 lb steps, then edit the old set. Opening the editor clears its historical load and disables Save. A reps-only correction requires choosing a different weight.  
    **Exact fix:** Give historical stack edits a snapshot mode that preserves the saved pin, added load and total. Apply current-step validation only after an explicit weight change.

12. **MINOR — STILL OPEN, partial fix: Cross-unit rep records are still missed.**  
    [records.ts:57](/Users/rabah/projects/anygym/src/lib/records.ts:57)  
    Heaviest comparisons convert units, but the “lifted before at this weight” check calls `sameLoad()`, which requires identical units. Equivalent loads in different units miss rep records; even unweighted bodyweight sets are affected. The equivalent-weight case was reproduced.  
    **Exact fix:** Compare compatible loads after conversion through `load.ts`, with a defined tolerance. Treat zero-added bodyweight as unit-independent.