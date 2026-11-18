I found 12 user-impacting defects in completed features. All were identified in earlier Codex reports and remain open in the current source. The most serious can lose an active run or submitted workout data.

1. **BLOCKER — STILL OPEN: Restoring a backup can erase an active run.**  
   [backup.ts:125](/Users/rabah/projects/anygym/src/db/backup.ts:125), [backup.ts:145](/Users/rabah/projects/anygym/src/db/backup.ts:145)  
   Restore checks for an active workout but not a run. Replace can clear the run’s saved row; if the app closes before another save, its route can be lost. A backup taken during a run can also restore it as active.  
   **Fix:** Coordinate run start with both restore modes. Refuse restore while a run is active, including one whose first save failed; check durable runs inside the restore transaction and exclude unfinished runs from imported backups.

2. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If another tab’s journal write fails, a submitted set can exist only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so it can finish without saving the set.  
   **Fix:** Admit submissions under the session lock. In Finish’s transaction, reconcile submitted drafts against committed and cancelled submissions, refuse unresolved ones, and build Undo from the reconciled state.

3. **MAJOR — STILL OPEN: Rapid checks can leave a set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before their deferred writes begin. The second can receive the first row’s promise and appear successful even though its own set was not written. The earlier report reproduced the queue behavior; the precise browser timing needs verification.  
   **Fix:** Reserve the exercise synchronously before deferring writes. Deduplicate only identical submission IDs, queue distinct IDs, and mark a claim landed only after its own write commits.

4. **MAJOR — STILL OPEN: Recovery can erase different unsaved input.**  
   [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Tabs assign revisions independently, but a lower-revision draft is discarded without comparing its values with the committed receipt. A user’s unsaved weight and reps can disappear even though different values were saved.  
   **Fix:** Consume a draft only when its payload matches committed evidence or explicit causal history proves it was superseded. Preserve conflicting payloads regardless of revision order.

5. **MAJOR — STILL OPEN: Failed run saves are invisible.**  
   [runEngine.ts:77](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:77)  
   A failed save sets a retry flag but does not warn the runner. If storage remains unavailable and iOS closes the app, the run and route can disappear without warning.  
   **Fix:** Expose initial and autosave failures in engine state, show a persistent actionable warning, keep retrying, and clear it only when the latest state is durably saved.

6. **MAJOR — STILL OPEN: A failed run recovery is treated as no run.**  
   [runEngine.ts:152](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:152)  
   A transient storage read failure enables a new run even if an unfinished run exists. Starting another can overwrite the single live snapshot, making the original run unreliable to recover.  
   **Fix:** Represent recovery failure separately from “no active run,” offer Retry, and block a new start until the check succeeds. Store snapshots by run ID and enforce one active run transactionally.

7. **MAJOR — STILL OPEN: Discard and Undo can report success while losing drafts.**  
   [discard.ts:10](/Users/rabah/projects/anygym/src/db/discard.ts:10), [discardWorkout.ts:18](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:18)  
   Discard can accept a workout whose failed submission exists only as a draft. Undo restores the session before separately writing the drafts; if that write fails and the app closes, the restored workout can be empty despite Undo reporting success.  
   **Fix:** Refuse discard while submissions or corrections are unresolved. Persist the discard snapshot and restore the session, counter, drafts and associated live state in one transaction; report success only after commit.

8. **MAJOR — STILL OPEN: A backup can omit a retained correction.**  
   [backup.ts:75](/Users/rabah/projects/anygym/src/db/backup.ts:75)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from both the backup’s sets and its retryable corrections, so restore brings back the older weight.  
   **Fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

9. **MAJOR — STILL OPEN: A stale equipment edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:35](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:35)  
   If another tab changes a gym to kg before a pending **5–50 lb** dumbbell range saves, the setter can accept that range as **5–50 kg**. The picker then offers weights that do not describe the equipment.  
   **Fix:** Pass the unit in which the range was entered to the setter and reject a mismatch inside its transaction. Clear the range fields and cached `lastRange` when the unit changes.

10. **MAJOR — STILL OPEN: Changing stack add-ons can trigger a false plateau.**  
    [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137)  
    The plateau check compares stack pins without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter recommendation even though resistance increased.  
    **Fix:** Compare complete saved loads with `sameResistance()` and format the explanation from the complete resistance.

11. **MAJOR — STILL OPEN: Old pace remains visible after GPS stops.**  
    [runEngine.ts:91](/Users/rabah/projects/anygym/src/hooks/runEngine.ts:91), [LiveStats.tsx:40](/Users/rabah/projects/anygym/src/screens/run/LiveStats.tsx:40)  
    GPS state changes on callbacks. If fixes stop arriving, the last rolling pace can remain displayed as the current pace indefinitely.  
    **Fix:** Track the age of the last accepted fix on a timer. After the GPS gap threshold, show `--` and a GPS-lost message, restart the watch, and restore pace only after valid fixes return.

12. **MAJOR — STILL OPEN: VoiceOver cannot reliably read the interval countdown.**  
    [LiveRun.tsx:192](/Users/rabah/projects/anygym/src/screens/run/LiveRun.tsx:192), [LiveStats.tsx:76](/Users/rabah/projects/anygym/src/screens/run/LiveStats.tsx:76)  
    The interval face sits inside a disabled button whose accessible name is “Show the next number big.” That label hides the block and countdown from the button’s accessible name, leaving a VoiceOver user without reliable interval instructions.  
    **Fix:** Render the interval face outside the cycle button and expose the block, round and remaining time as accessible text without announcing every tick.

This was a read-only source review; I made no edits. I did not rerun tests or verify the timing, storage-failure paths, or VoiceOver behavior on a physical iPhone. The earlier reports’ reproductions were not rerun here.