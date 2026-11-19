The most direct weight risks are shared machine settings, stale equipment units, and a coach comparison that ignores stack add-ons. I also found several previously reported save and recovery paths that remain open and can lose or resurrect a weight.

1. **MAJOR — Different cable stations share one setting.**  
   [exerciseLoad.ts:57](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:57)  
   Every exercise whose name contains “cable” uses the same `cable_station` key. If a gym has two cable stations with different stack increments, setting up one also changes the picker for the other. The user can be offered and save a pin weight that does not exist on the station they used.  
   **Exact fix:** Give each physical machine a stable gym-specific identity, let the user select it for the exercise, and key stack settings and saved loads to that identity. Do not assume all cable exercises use one station.

2. **MAJOR — STILL OPEN: A stale equipment edit can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:30](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:30)  
   The dumbbell-range setter receives numbers without their originating unit. If the gym changes to kg before a pending **5–50 lb** edit saves, it can store **5–50 kg**. The screen also retains a cached range when dumbbells are toggled off. The picker can consequently offer and save weights that do not describe the equipment.  
   **Exact fix:** Pass the unit in which the range was entered and reject a mismatch inside the save transaction. Clear the range fields and cached range when the gym unit changes.

3. **MAJOR — STILL OPEN: Finish can omit a submitted set.**  
   [workoutFinish.ts:78](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:78)  
   If another tab’s journal write fails, a submitted set can remain only in the durable draft mirror. Finish checks the journal and held corrections but does not reconcile that mirror, so it can finish without the lift.  
   **Exact fix:** Admit submissions under the session lock. Within Finish’s transaction, reconcile submitted drafts against commit and cancellation receipts, refuse unresolved submissions, and build Undo from the reconciled state.

4. **MAJOR — STILL OPEN: Recovery can erase a different unsaved weight.**  
   [setTable.ts:163](/Users/rabah/projects/anygym/src/lib/setTable.ts:163)  
   Tabs assign revisions independently, but reconciliation checks for different payloads only when revisions match. A pending **73 lb × 19** at a lower revision can be discarded against a saved **53 lb × 10**, even though the pending values were never saved.  
   **Exact fix:** Consume a draft only when its payload matches committed evidence or explicit causal history proves it was superseded. Preserve conflicting payloads regardless of revision order.

5. **MAJOR — STILL OPEN: Rapid checks can leave a set unsaved.**  
   [useLogRow.ts:34](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:34), [logQueue.ts:77](/Users/rabah/projects/anygym/src/lib/logQueue.ts:77)  
   Two rows can be claimed before their deferred writes start. The second can receive the first row’s in-flight promise and appear successful even though its own set was not written. Earlier reports reproduced the queue behavior; I did not verify the precise browser timing.  
   **Exact fix:** Reserve the exercise synchronously before deferring the write. Deduplicate only identical submission IDs, queue distinct IDs, and acknowledge each claim only after its own submission commits.

6. **MAJOR — STILL OPEN: A backup can omit a retained weight correction.**  
   [backup.ts:82](/Users/rabah/projects/anygym/src/db/backup.ts:82)  
   Held corrections are captured before the database snapshot. A failed edit retained between those reads can be absent from the export, so restoring it returns the older weight.  
   **Exact fix:** Read durable held corrections in the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback and memory capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: Stack add-ons can trigger a false plateau.**  
   [recovery.ts:134](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:134)  
   The plateau check compares pin values without their add-ons. Hard workouts at **100 + 25 lb** and **100 + 50 lb** can be described as the same weight and prompt a lighter target, although resistance increased from **125 to 150 lb**.  
   **Exact fix:** Compare complete saved loads with `sameResistance()` and format the explanation from complete resistance.

8. **MAJOR — STILL OPEN: A removed draft can reappear.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   When localStorage is unavailable, the durable merge can reinsert a clean cached draft whose IndexedDB slot is absent, including after another tab deliberately removed it. Old weight and reps can reappear and be logged again.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt the committed state, including absence; refresh memory from the committed merge.

9. **MINOR — STILL OPEN: Total lifted undercounts reps performed on each side.**  
   [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14)  
   Saved sets do not record whether reps were performed per side. A single-arm row of **20 lb × 10 per arm** contributes **200 lb** to total lifted instead of **400 lb**.  
   **Exact fix:** Snapshot the repetition-count mode with the set and include the number of performed sides in volume calculations.

This was a read-only source review; no files were edited and I did not run tests or reproduce the races on a phone. The earlier single-horn machine finding is excluded: the current flow asks for an unknown horn count and snapshots it.