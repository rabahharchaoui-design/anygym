I found **8 issues that remain open** in completed features. The highest-impact cases can lose a submitted or corrected set; the weight-specific cases can produce a wrong recommendation, equipment range, or total.

1. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83)  
   If another tab’s journal write fails after its submission reaches the durable draft mirror, Finish checks the journal but does not reconcile that mirror. It can finish successfully and clear recovery input without saving the lift.  
   **Fix:** Serialize submission admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts with commit and cancellation receipts, refuse unresolved submissions, and use that reconciled state for Undo.

2. **MAJOR — STILL OPEN: Recovery can erase a different, unsaved weight.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Payload differences protect drafts only when revisions match. Tabs allocate revisions independently, so a pending **73 lb × 19 at revision 1** can be discarded against a saved **53 lb × 10 at revision 5**, even though the pending lift was never saved.  
   **Fix:** Consume a draft only when its payload matches committed evidence or an explicit causal supersession proves it obsolete, regardless of revision ordering. Preserve conflicts under a recoverable identity.

3. **MAJOR — STILL OPEN: Two rapid row checks can leave one set unsaved.**  
   [useLogRow.ts:55](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:55), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two different rows can be claimed before the deferred writes start. The second submission can receive the first row’s in-flight promise, report success without writing its own set, and leave a claim that blocks further logging. The earlier report reproduced the queue behavior; browser timing remains unverified.  
   **Fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and mark a claim landed only when its own submission commits.

4. **MAJOR — STILL OPEN: Backup can omit a retained weight correction.**  
   [backup.ts:75](/Users/rabah/projects/anygym/src/db/backup.ts:75)  
   Held corrections are read before the database snapshot. A correction retained between those reads can be absent from the export even when the backup includes a later committed set. Restoring it loses the intended correction.  
   **Fix:** Read durable held corrections in the same snapshot transaction as sets, journals, and supersession receipts; coordinate fallback and memory capture with mutation registration.

5. **MAJOR — STILL OPEN: Discard → Undo can restore an empty workout after reporting success.**  
   [discardWorkout.ts:22](/Users/rabah/projects/anygym/src/hooks/discardWorkout.ts:22), [discard.ts:24](/Users/rabah/projects/anygym/src/db/discard.ts:24)  
   Undo restores the session first and writes its pending drafts separately. If local storage is unavailable and the draft write fails, Undo can return success while a submitted weight disappears after restart.  
   **Fix:** Persist the discard snapshot and restore the session, counter, drafts, and associated live state atomically. Report success only after the durable transaction commits.

6. **MAJOR — STILL OPEN: A stale equipment edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:35](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:35)  
   The dumbbell-range setter does not receive the unit in which the range was entered. If another tab changes the gym to kg before a pending **5–50 lb** range is saved, that range can be accepted as **5–50 kg**, allowing the user to select and save a substantially different lift.  
   **Fix:** Pass the originating unit to the setter and reject a mismatch inside its transaction. Clear the range fields and cached `lastRange` when the unit changes.

7. **MAJOR — STILL OPEN: Changing stack add-ons can produce a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137)  
   The plateau check compares stack pins without their add-ons. Two hard workouts at **100 + 25 lb**, followed by **100 + 50 lb**, can be described as hard twice at the same weight and trigger a lighter recommendation, although resistance increased from **125 to 150 lb**.  
   **Fix:** Compare complete saved loads using `sameResistance()` and format the explanation from the complete resistance.

8. **MINOR — STILL OPEN: Total lifted undercounts repetitions performed on each side.**  
   [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14)  
   Saved sets do not record whether reps were performed per side. A single-arm row of **20 lb × 10 per arm** contributes **200 lb** to the displayed total instead of **400 lb**.  
   **Fix:** Snapshot the repetition-count mode with the set and include the number of performed sides in volume calculations.

The earlier one-horn finding should **not** be repeated: the current picker asks for an unknown side count and snapshots a one-horn load. The earlier “Not now” stack add-on finding also appears fixed in the current target path.

I reviewed the existing code and prior reports without editing files. I attempted focused tests, but Vitest could not start because the read-only environment refused its temporary configuration file; the conclusions above are based on source inspection and the existing regression reports, not a fresh test run.