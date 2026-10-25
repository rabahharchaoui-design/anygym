Found **10 issues in completed `[x]` features**. No files edited. Fixed earlier findings are excluded.

1. **MAJOR — STILL OPEN: Failed Undo loses its protection after navigation.**  
   [WorkoutScreen.tsx:112](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:112)  
   Delete a set, let saving Undo acceptance fail, then minimize and resume. The recreated queue forgets the unresolved Undo; Finish permanently deletes its recovery record. Reproduced with in-memory IndexedDB.  
   **Exact fix:** Keep deletion recovery at session level across unmounts. Retain unresolved Undo requests and block Finish until restoration or explicit cancellation succeeds.

2. **MAJOR — STILL OPEN: Recovery can offer an already-saved lift again.**  
   [setTable.ts:96](/Users/rabah/projects/anygym/src/lib/setTable.ts:96)  
   A newer edit preserved after a delayed Log receives a random successor ID. If that identity’s persistence fails, logging the successor can succeed, but restarting generates another ID from the stale original draft. The same lift becomes loggable again, inflating saved volume.  
   **Exact fix:** Persist the successor identity transactionally with its submission receipt. Recovery must reuse that identity and follow committed successors before exposing pending rows.

3. **MAJOR — STILL OPEN: Switching units turns weighted bodyweight history into an unweighted target.**  
   [progression.ts:152](/Users/rabah/projects/anygym/src/lib/progression.ts:152), [setTable.ts:207](/Users/rabah/projects/anygym/src/lib/setTable.ts:207)  
   Finish dips at **+25 lb**, switch to kg, and start another workout. Conversion returns no target; fallback supplies **zero added weight**, with ✓ enabled. Reproduced.  
   **Exact fix:** Convert the historical addition through `load.ts` and require confirmation or reselection. If no valid target exists, block the row instead of substituting unweighted bodyweight.

4. **MAJOR — NEW: LAST TIME copies plates while silently changing the total.**  
   [ExerciseView.tsx:196](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:196), [exerciseLoad.ts:84](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:84)  
   Copying **135 lb** Olympic history with today’s women’s bar produces **125 lb**. Copying a **90 lb** machine set after starting resistance changes from 0 to 50 produces **140 lb**. Both were reproduced; the changed total can then be saved. SPEC 21.1 promises to copy the numbers.  
   **Exact fix:** Use a separate copy helper that solves the stored total against today’s base, collars, and inventory. Preserve today’s equipment identity; refuse the weight copy with an explanation when no exact loading exists.

5. **MAJOR — NEW: Held-plate exercises incorrectly use dumbbell availability.**  
   [SetLoadInput.tsx:78](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:78), [load.ts:578](/Users/rabah/projects/anygym/src/lib/load.ts:578)  
   Plate Russian Twist and Front and Lateral Plate Raise use the dumbbell range. In the default kg gym, **5 kg plates are enabled**, but the wheel offers 4 and 6, never 5. A previous 5 kg lift also generates a **4 kg** target saying only “Aim for 11 or better.” Reproduced.  
   **Exact fix:** Preserve the single implement’s identity. Use enabled plate weights for held-plate exercises and exact entry for other single implements. Apply that same availability model to selection, prefill, validation, and progression.

6. **MAJOR — STILL OPEN: Logging rows out of order permanently blocks an enabled ✓.**  
   [logQueue.ts:129](/Users/rabah/projects/anygym/src/lib/logQueue.ts:129)  
   Check row 3, then the next highlighted row. The remaining pending row occupies index 2, still held by the first claim. Its ✓ silently does nothing. Reproduced: three checks invoked only two writers.  
   **Exact fix:** Claim stable draft identities rather than displayed indexes. Release a claim when its submitted identity appears among committed records, retaining stale-render double-tap protection.

7. **MAJOR — STILL OPEN: Restore accepts stack settings that crash weight selection.**  
   [backup.ts:143](/Users/rabah/projects/anygym/src/lib/backup.ts:143), [load.ts:360](/Users/rabah/projects/anygym/src/lib/load.ts:360)  
   A backup with `stackStep: 1e-12` passes validation. Opening the stack rounds its divisor to zero and throws `RangeError` after Replace has already committed. Reproduced.  
   **Exact fix:** Validate gym and per-machine steps for supported precision and bounded list generation before restoration. Defensively reject invalid divisors and excessive counts inside `stackValues()`.

8. **MAJOR — STILL OPEN: Set-type changes can commit after Finish advances the plan.**  
   [ExerciseView.tsx:209](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:209), [workouts.ts:165](/Users/rabah/projects/anygym/src/db/workouts.ts:165)  
   Logged type buttons remain active during Finish. A queued change can turn a working set into a warmup after completion was calculated, leaving the advanced plan inconsistent with the saved workout. The database accepts post-Finish changes.  
   **Exact fix:** Apply the finishing lock to type changes and drain existing mutations. Include `sessions` in the update transaction and reject changes to ended workouts.

9. **MAJOR — STILL OPEN: Warmups consume prescribed working-set rows.**  
   [useWorkout.ts:155](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:155), [ExerciseView.tsx:94](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:94)  
   Mark a normal lift’s three rows W and log them. Its progress completes and no working rows remain despite zero working sets. Finish subsequently reports incomplete progress.  
   **Exact fix:** Separate logged-row count from prescribed working-set completion. Keep working rows available after warmups and use working counts for progress and advancement; handle dedicated warmup blocks independently.

10. **MINOR — STILL OPEN, partial fix: Equivalent mixed-unit loads fail the progression check.**  
    [progression.ts:154](/Users/rabah/projects/anygym/src/lib/progression.ts:154)  
    Heaviest-load ranking is fixed, but `sameAll` still requires identical units. Equivalent 20 kg and 44.092… lb dumbbells, both hitting the top rep target, retain **20 kg** instead of progressing to the available **22 kg**. Reproduced.  
    **Exact fix:** Use normalized resistance comparison with the defined tolerance for both `sameAll` and the bodyweight streak check.

Typecheck passed. Read-only probes passed **5,280 arithmetic cases and 82 solver round trips** across lb/kg. UI sequences were source-traced; full browser suites and physical iPhone testing were not run.