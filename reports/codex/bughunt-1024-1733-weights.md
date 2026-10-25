Found **12 findings in built features**. No files edited. Earlier fixed findings are excluded; unresolved findings are marked **STILL OPEN**.

Typecheck passed. Read-only probes passed **5,280 plate/bar combinations across lb and kg**. The main risks are state changes and persistence, rather than basic arithmetic. UI sequences were source-traced; no physical iPhone testing.

1. **MAJOR — NEW: Changing units reinterprets pending plates without conversion or validation.**  
   [exerciseLoad.ts:125](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:125)  
   A pending 135 lb load—45 lb bar plus 45 lb per side—becomes **110 kg**, retaining `[45]` as kilogram plates. Those plates are absent from the default kg inventory, yet the row remains loggable. **Reproduced through the actual load functions.** The same path accepts plates subsequently disabled in inventory.  
   **Exact fix:** Store the unit alongside draft plates, including drafts with an unknown base. Reject rebuilding when units differ or plates are unavailable; require a fresh selection. Convert only an explicitly presented suggestion, then solve against the destination inventory.

2. **MAJOR — STILL OPEN: Dumbbell confirmation can save a different weight from the readout.**  
   [DumbbellWheel.tsx:95](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:95)  
   Scrolling updates the displayed selection immediately but publishes its load after 110 ms. Save/Done can therefore confirm 30 each while the wheel displays 50 each: **60 total saved instead of 100**. Single-weight mode is also affected. Physical touch timing remains unverified.  
   **Exact fix:** Disable confirmation while scrolling is unsettled, or synchronously capture and commit the displayed snapped selection before confirming in both Weight and Edit sheets.

3. **MAJOR — STILL OPEN: Changing bars in Edit saves the previous equipment identity.**  
   [SetLoadInput.tsx:170](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:170)  
   Choosing Smith while editing an Olympic set schedules `localBar`, then immediately builds the load using the previous render’s ID. Smith weight is saved as Olympic, contaminating free-weight history. Initialization also disregards historical identity when today’s configured bar weight differs.  
   **Exact fix:** Pass the chosen ID and weight explicitly into `change()` and `barbellLoad()`. Initialize identity directly from `ownBarId`, independently of current configured weight.

4. **MAJOR — STILL OPEN: Finish discards failed set submissions.**  
   [logQueue.ts:83](/Users/rabah/projects/anygym/src/lib/logQueue.ts:83), [WorkoutScreen.tsx:364](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:364)  
   Finish waits for pending writes but ignores their failure results, then ends the workout and clears drafts. **Reproduced:** submission returned `false`, while `settle()` resolved successfully. The saved workout can omit a lift the user checked.  
   **Exact fix:** Retain failed submission payloads until retried or explicitly discarded. Block Finish while failures remain, preserve drafts, and synchronously close logging before draining submissions.

5. **MAJOR — STILL OPEN: Termination after Log commits can hide a draft and duplicate a lift.**  
   [ExerciseView.tsx:165](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:165), [ExerciseView.tsx:179](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:179)  
   The set commits to IndexedDB before separate draft reconciliation. Termination between those operations leaves stale row indexes and submission IDs. Recovery can hide an unlogged row while offering the committed lift for logging again, inflating saved totals.  
   **Exact fix:** Persist stable row/submission IDs and submitted values before writing. Commit the set and pending-row reconciliation in one IndexedDB transaction; reconcile committed IDs before rendering recovered drafts.

6. **MAJOR — STILL OPEN: Delayed logging destroys newer weight/reps edits.**  
   [setTable.ts:160](/Users/rabah/projects/anygym/src/lib/setTable.ts:160)  
   Editing a submitted row during its write loses that newer revision when logging out of order. In-order logging also drops it when the next row already has a draft. **Reproduced:** a newer 17-rep draft produced only a clear operation. Subsequent rows can revert to unintended loads/counts.  
   **Exact fix:** Preserve newer submitted revisions in both branches. Move occupied drafts to make room, extending pending rows when necessary, while preserving load, count, revision and stopwatch state under stable row IDs.

7. **MAJOR — STILL OPEN: Accepted Undo can permanently lose its set.**  
   [deleteUndo.ts:39](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:39), [deleteUndo.ts:67](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:67)  
   Deleted records and accepted restoration intent exist only in memory. Termination before restoration commits—or after it fails—loses recovery data. A failed restoration also leaves no running promise for a later Finish to reject, allowing completion with the lift missing.  
   **Exact fix:** Store the deleted record and expiry transactionally with deletion. Persist accepted Undo intent, retry it after restart, and block Finish until restoration succeeds or is explicitly cancelled. Never expire an unresolved accepted Undo.

8. **MAJOR — STILL OPEN: Editing an older rep set can replace its reps with one second.**  
   [EditSetSheet.tsx:49](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:49), [workouts.ts:76](/Users/rabah/projects/anygym/src/db/workouts.ts:76)  
   Log 10 reps, change “Loaded with” to Timed, then edit the original set. Today’s setting selects Seconds, initialized to `1`. Save removes the reps while retaining the original weighted load, making its lifted volume disappear. Database validation permits this combination.  
   **Exact fix:** Derive count mode from the saved load/count fields; consult current settings only for incomplete legacy records. Validate count/load compatibility in both `logSet()` and `updateSet()`.

9. **MAJOR — STILL OPEN: Explicit hold corrections save the old stopwatch duration.**  
   [ExerciseView.tsx:145](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:145), [ExerciseView.tsx:201](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:201)  
   Stop at 30 seconds, then manually select or copy 60 seconds. These operations update `seconds` but retain the watch. Logging captures the old **30 seconds**, overriding the correction.  
   **Exact fix:** Manual/copied seconds must replace the watch with a stopped watch representing that duration. Display and submission must read one canonical duration.

10. **MAJOR — STILL OPEN: Workout read failures leave logging and finishing unsafe.**  
    [useWorkout.ts:52](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:52), [WorkoutScreen.tsx:388](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:388)  
    The hook discards query errors and retry functions. Initial session-read failure redirects home as though the workout vanished; subsequent failures can leave stale equipment, settings or set counts while mutations remain available.  
    **Exact fix:** Expose required-query errors and a combined retry. Render `LoadError`, block mutations while required data is unavailable, and redirect for a missing session only after a successful read.

11. **MINOR — STILL OPEN: Current stack settings prevent honest historical corrections.**  
    [StackSelector.tsx:45](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:45)  
    Log 15 lb with 5 lb increments, change increments to 10, then edit the old set. Opening the picker clears the historical load and disables Save. Correcting reps requires selecting a different recorded weight.  
    **Exact fix:** Preserve the saved pin, added load and total during historical editing. Apply current-step validation only after an explicit weight change.

12. **MINOR — STILL OPEN: Cross-unit rep records are missed.**  
    [records.ts:57](/Users/rabah/projects/anygym/src/lib/records.ts:57)  
    The “lifted before” check uses `sameLoad()`, which requires identical units. Equivalent loads miss rep records; even unweighted bodyweight sets are affected. **Reproduced:** 10 prior bodyweight reps in lb followed by 12 in kg produced no record.  
    **Exact fix:** Compare compatible loads after conversion through `load.ts`, using a defined tolerance. Treat unweighted bodyweight loads as unit-independent.