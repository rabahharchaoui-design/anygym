**12 findings in completed features; no files edited.** Fixed earlier findings are excluded. Typecheck, 10,560 weight-sum/record cases, and 82 solver round trips passed. Failures below were checked with synthetic handler/database probes; full browser timing and physical iPhone behavior remain untested.

1. **MAJOR — STILL OPEN: Failed Undo can permanently lose a saved set.**  
   [sessionRecovery.ts:36](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:36), [tombstones.ts:93](/Users/rabah/projects/anygym/src/db/tombstones.ts:93)  
   If Undo acceptance and both intent-storage paths fail, restarting after the window deletes the remaining recovery record. Reproduced: neither set nor tombstone survived.  
   **Exact fix:** Durably finalize ordinary deletions when their window expires. Preserve unfinalized tombstones across restart and require restore/discard before removing them.

2. **MAJOR — STILL OPEN: An open picker can turn 65 lb into 40 kg.**  
   [WeightSheet.tsx:73](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx:73), [ExerciseView.tsx:228](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:228)  
   Changing gym units elsewhere invalidates the load, but Done accepts its unitless `[10]` plates. Applying them rebuilds **40 kg** instead of retaining **65 lb**.  
   **Exact fix:** Add originating `unit` to `WeightPick`; validate it at confirmation and application. Allow null loads with plates only for an unknown base and valid unit/inventory.

3. **MAJOR — NEW: Equipment answers can cross a unit change.**  
   [EquipmentWeightSheet.tsx:46](/Users/rabah/projects/anygym/src/components/load/EquipmentWeightSheet.tsx:46), [equipment.ts:25](/Users/rabah/projects/anygym/src/db/equipment.ts:25)  
   A stale lb prompt can save after another tab changes the gym to kg. The setter accepts **35 lb as a 35 kg bar**, corrupting subsequent totals. Database behavior reproduced; complete browser race untested.  
   **Exact fix:** Pass the answer’s originating unit into the setter and reject mismatches inside its transaction. Reset typed answers and invalidate pending callbacks when units change.

4. **MAJOR — STILL OPEN: Import Save silently restores a rejected weight.**  
   [ImportSetSheet.tsx:42](/Users/rabah/projects/anygym/src/screens/settings/ImportSetSheet.tsx:42), [importPlan.ts:262](/Users/rabah/projects/anygym/src/lib/import/importPlan.ts:262)  
   Clear an imported **53 lb** kettlebell weight or enter rejected **501**. Save omits the null edit; import restores **53 lb** and marks it checked.  
   **Exact fix:** Track whether weight changed, disable Save for invalid changes, and distinguish absent `load` from explicit `load: null`. Explicit changes must never fall back to source data.

5. **MAJOR — STILL OPEN: Delayed bar selection removes newly added plates.**  
   [SetLoadInput.tsx:192](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:192)  
   Select Smith with `[45]`, then add 10s while its choice saves. Completion uses captured `[45]`, leaving **90 lb instead of 110 lb**. Reproduced through the component handlers.  
   **Exact fix:** Read current plates after the await, serialize bar choices, reject obsolete completions, and block confirmation until selection settles.

6. **MAJOR — STILL OPEN: Finish reports success after a failed weight edit.**  
   [logQueue.ts:113](/Users/rabah/projects/anygym/src/lib/logQueue.ts:113), [WorkoutScreen.tsx:312](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:312)  
   Failed Edit/type writes become resolved tracking promises. Finish proceeds and suppresses the error. Reproduced: a requested **60 kg/17 reps** edit failed, but Finish succeeded with **53 kg/10 reps**.  
   **Exact fix:** Retain failed mutation payloads, block Finish until retry or explicit discard, and preserve the edited values independently of the sheet.

7. **MAJOR — STILL OPEN: Unit changes move legacy Smith sets into Olympic history.**  
   [history.ts:50](/Users/rabah/projects/anygym/src/db/history.ts:50)  
   Legacy sets without `barId` depend on today’s gym configuration. Changing units removes matching evidence and defaults them to Olympic. Reproduced: Smith history appeared in another gym’s free-bar history, affecting targets and records.  
   **Exact fix:** Persist resolvable identities before changing units/equipment, transactionally with that change. Keep ambiguous identities unresolved and excluded from comparisons.

8. **MAJOR — STILL OPEN: Logging a later row can lose preceding pending weights/reps.**  
   [ExerciseView.tsx:180](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:180), [rowLog.ts:214](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:214)  
   Only the submitted row enters the journal. With draft-storage failures, logging row three succeeds without preserving preceding rows. Reproduced: `[7, 8, 19]` became saved `[19]` and zero recovered drafts.  
   **Exact fix:** Persist all affected rows and stable identities before accepting Log; commit their reconciliation with the set and receipt.

9. **MAJOR — STILL OPEN: Finish → Undo loses pending edits and added rows.**  
   [WorkoutScreen.tsx:430](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:430), [workouts.ts:357](/Users/rabah/projects/anygym/src/db/workouts.ts:357)  
   Finish clears drafts and extra rows; Undo restores only the session and plan position. Reproduced: the pending 17-rep edit disappeared and extra-row count became zero.  
   **Exact fix:** Snapshot drafts, extra rows, and rest state transactionally at Finish; restore them during Undo and reconcile submission receipts.

10. **MAJOR — STILL OPEN: Unavailable localStorage skips working IndexedDB protection.**  
    [drafts.ts:149](/Users/rabah/projects/anygym/src/lib/drafts.ts:149), [durable.ts:73](/Users/rabah/projects/anygym/src/lib/durable.ts:73)  
    When accessing localStorage throws, draft persistence is skipped entirely. Reproduced: a **53 lb/17-rep** draft produced zero durable records. Restart loses its values.  
    **Exact fix:** Persist values and clears directly through IndexedDB when storage is null; make `mirrorValue()` support that path. Apply the same handling to rest state.

11. **MAJOR — STILL OPEN: Timestamp failure prevents the durable draft copy.**  
    [durable.ts:48](/Users/rabah/projects/anygym/src/lib/durable.ts:48)  
    Saving the draft can succeed while its timestamp write fails. That exception prevents IndexedDB persistence. Reproduced: no mirror record was written, removing protection against process termination.  
    **Exact fix:** Capture the value and timestamp first, then attempt timestamp storage and IndexedDB persistence independently.

12. **MAJOR — STILL OPEN: A rest-storage read failure blocks the workout.**  
    [rest.ts:89](/Users/rabah/projects/anygym/src/lib/rest.ts:89), [WorkoutScreen.tsx:101](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:101)  
    A throwing `getItem()` escapes the workout’s state initializer, replacing the workout with the error boundary. Reload can repeat it, preventing access to saved sets.  
    **Exact fix:** Catch read failures; use hydrated durable rest state when available, otherwise open with empty rest state and a recoverable notice.