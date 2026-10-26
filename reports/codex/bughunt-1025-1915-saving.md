**10 findings in completed `[x]` features.** No files edited. Earlier fixed findings are excluded; remaining defects are marked **STILL OPEN**.

1. **MAJOR — STILL OPEN, storage-failure case: Failed Undo can permanently lose its set after restart.**  
   [sessionRecovery.ts:36](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:36), [tombstones.ts:93](/Users/rabah/projects/anygym/src/db/tombstones.ts:93)  
   Delete succeeds, but Undo acceptance, its IndexedDB intent, and localStorage fallback fail. The unresolved request survives only in memory. Restart after five seconds expires the tombstone. **Reproduced:** neither set nor recovery record remained; Finish discarded the workout.  
   **Exact fix:** Retain expired deleted records for explicit recovery when durable intent is unavailable. After restart, require an explicit restore/discard decision before permanently removing such records; memory alone cannot protect them.

2. **MAJOR — Finish ignores failed Edit and set-type writes.**  
   [logQueue.ts:113](/Users/rabah/projects/anygym/src/lib/logQueue.ts:113), [WorkoutScreen.tsx:312](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:312)  
   Save an edit, dismiss the sheet while saving, then Finish. `mutate()` converts rejection into a resolved tracking promise; Finish proceeds, and the closed queue suppresses the error toast. **Reproduced:** changing 10 reps to 17 failed, but Finish reported success with 10 saved. Set-type changes use the same tracking path.  
   **Exact fix:** Retain failed mutation payloads independently of running promises. Block Finish until retry or explicit discard, preserve the edited values, and display the failure even while finishing.

3. **MAJOR — STILL OPEN, partial recovery gap: Successful Log can leave other pending rows unrecoverable.**  
   [ExerciseView.tsx:180](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:180), [rowLog.ts:214](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:214)  
   The journal contains only the submitted row. If localStorage and draft-mirror writes fail, logging a later row can succeed without durably preserving preceding rows. **Reproduced:** pending `[7, 8, 19]`, log row 3, restart → saved `[19]`, recovered pending drafts `[]`.  
   **Exact fix:** Persist all affected pending rows and their stable identities before accepting Log. Commit their reconciled state with the set and receipt; abort logging if that persistence fails.

4. **MAJOR — STILL OPEN: An open weight picker can turn pounds into kilograms.**  
   [WeightSheet.tsx:73](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx:73), [ExerciseView.tsx:228](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:228)  
   Open a 65 lb picker, then change the gym to kg in another tab. The load becomes invalid, but Done remains enabled because plates exist. Confirmation passes unitless plates, which become **40 kg**. **Calculation reproduced; complete browser sequence untested.**  
   **Exact fix:** Carry the originating unit in `WeightPick`; validate it both when confirming and applying. Reject mismatches until reselection. Permit null loads with plates only for genuinely unknown bases with valid units and inventory.

5. **MAJOR — STILL OPEN: Delayed bar selection discards newer plates.**  
   [SetLoadInput.tsx:192](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:192)  
   Choose a zero-base Smith bar with `[45]` loaded, then add 10 lb plates while the choice saves. Completion uses captured `[45]`, replacing the newer selection: **90 lb instead of 110 lb** can be saved. **Source-traced race; browser timing unverified.**  
   **Exact fix:** Read the latest plates when the asynchronous choice completes, reject obsolete completions, and prevent confirmation while bar selection is unsettled.

6. **MAJOR — STILL OPEN: Unavailable localStorage bypasses durable draft saving.**  
   [drafts.ts:149](/Users/rabah/projects/anygym/src/lib/drafts.ts:149), [durable.ts:73](/Users/rabah/projects/anygym/src/lib/durable.ts:73)  
   When accessing localStorage throws, persistence skips IndexedDB despite it working. **Reproduced:** a 17-rep draft existed in memory but produced zero durable records. Restart loses pending weights, reps and stopwatch state. Clears have the same missing fallback.  
   **Exact fix:** Write complete draft values and clears directly through `durableRow()` when storage is null. Make `mirrorValue()` support absent localStorage, and apply the fallback to rest state.

7. **MAJOR — STILL OPEN: Finish → Undo loses pending edits and added rows.**  
   [WorkoutScreen.tsx:430](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:430), [workouts.ts:357](/Users/rabah/projects/anygym/src/db/workouts.ts:357)  
   Finish clears drafts and extra rows; Undo restores only the session and plan pointer. **Reproduced:** reopening succeeded, but the pending 17-rep draft was absent and the extra-set count was zero.  
   **Exact fix:** Store an undo snapshot of pending drafts, extra rows and rest state within Finish’s transaction. Restore it transactionally when reopening, reconciling against committed submission receipts.

8. **MAJOR — STILL OPEN: Timestamp failure suppresses the IndexedDB copy.**  
   [durable.ts:48](/Users/rabah/projects/anygym/src/lib/durable.ts:48)  
   If saving the workout value succeeds but saving its timestamp fails, `mirror()` exits before attempting IndexedDB persistence. **Reproduced: zero mirror records.** This removes the intended protection against process termination; actual device-level loss remains unverified.  
   **Exact fix:** Capture value and timestamp first. Attempt timestamp storage separately, then attempt IndexedDB persistence regardless of timestamp failure.

9. **MAJOR — STILL OPEN: Changing units reclassifies legacy Smith sets as Olympic.**  
   [history.ts:50](/Users/rabah/projects/anygym/src/db/history.ts:50)  
   Legacy records without `barId` rely on today’s gym configuration. Changing units removes matching evidence and returns the exercise’s default bar. **Reproduced:** Smith became Olympic, allowing incompatible history to influence LAST TIME, targets and records.  
   **Exact fix:** Persist resolvable legacy identities before changing gym units or equipment. Leave ambiguous identities unresolved and excluded from equipment comparisons.

10. **MAJOR — STILL OPEN: A rest-storage read failure prevents opening the workout.**  
    [rest.ts:89](/Users/rabah/projects/anygym/src/lib/rest.ts:89), [WorkoutScreen.tsx:101](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:101)  
    If localStorage exists but `getItem()` throws, the exception escapes the workout’s state initializer. The error boundary replaces the app; reloading can repeat the failure, blocking access to saved sets. **Exception reproduced.**  
    **Exact fix:** Catch storage-read failures. Use the hydrated IndexedDB rest copy when available; otherwise open the workout with empty rest state and a recoverable notice.

Typecheck passed. In-memory fault injection confirmed transactional rollback for Log, Edit, Delete, Undo and Finish, same-ID deduplication, accepted-Undo recovery, and rejection of edits after Finish. Update guards deferred reload for active workouts and failed activity reads. Physical iPhone termination, full browser suites and live service-worker activation were not tested.