Found **8 findings in completed `[x]` features**. No files edited. TypeScript checking passed. Recovery and conversion probes used actual modules with in-memory IndexedDB; physical iPhone termination and touch timing were not tested. Fixed earlier findings are excluded.

1. **MAJOR — STILL OPEN, storage-failure variant: Failed Log submissions can disappear after restart.**  
   [ExerciseView.tsx:157](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:157)  
   Log ignores `writeDrafts()` returning `false`. If localStorage cannot save the submission mark and IndexedDB logging also fails or aborts, restarting recovers an unmarked older draft. Finish then misses the failed submission and clears it. **Probe:** recovery reported zero failed rows.  
   **Exact fix:** persist pending row values, identity, revision and submission status in IndexedDB before attempting Log. Retain that journal until successful reconciliation or explicit discard; make Finish check it.

2. **MAJOR — STILL OPEN, partially fixed: Failure to persist Undo acceptance lets Finish permanently discard the set.**  
   [tombstones.ts:24](/Users/rabah/projects/anygym/src/db/tombstones.ts:24), [deleteUndo.ts:109](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:109)  
   Delete succeeds, Undo’s `undo: true` write fails, then Finish is tapped. The rejected restore leaves no running write; Finish deletes the unaccepted tombstone. **Reproduced:** the last-set case returned `{saved:false}`, with neither set nor recovery record remaining.  
   **Exact fix:** retain unresolved Undo requests separately from running promises. Journal intent before dismissing Undo; prevent expiry and block Finish until the request succeeds or is explicitly cancelled. Retry unresolved requests during recovery.

3. **MAJOR — NEW: Recovery treats older draft revisions as newer edits and resurrects consumed rows.**  
   [setTable.ts:92](/Users/rabah/projects/anygym/src/lib/setTable.ts:92)  
   Reconciliation preserves every revision unequal to the committed revision. If storage retained revision 1 while revision 2 logged successfully, restart gives the stale row a fresh ID and makes it loggable again. **Reproduced:** a committed 10-rep row returned as an 8-rep pending row with a new ID.  
   **Exact fix:** consume drafts whose revision is **less than or equal to** the committed revision. Preserve and reidentify only revisions strictly greater than the submitted revision.

4. **MAJOR — STILL OPEN: Switching units fabricates pending plate loads.**  
   [exerciseLoad.ts:125](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:125)  
   Pick 135 lb, minimize, switch Settings to kg, then resume. Stored `[45]` plates are reinterpreted as kilograms. **Reproduced:** the pending load became **110 kg**, including unavailable 45 kg plates, and can be saved. Plate machines have the same defect.  
   **Exact fix:** store the originating unit with draft plates, including unknown-base drafts. Require explicit reselection across units and validate plates against the current inventory before enabling Log.

5. **MAJOR — STILL OPEN: Wheel confirmation can save a different weight from its readout.**  
   [DumbbellWheel.tsx:97](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:97)  
   Scrolling updates the visible weight immediately but publishes the canonical load after 110 ms. Done or Save can therefore confirm 30 each while displaying 50 each. **Source-confirmed race; physical touch reproduction remains unverified.**  
   **Exact fix:** synchronously publish the displayed snapped selection, or disable confirmation until it settles. Apply this to Weight and Edit sheets.

6. **MAJOR — STILL OPEN: Converted stack targets lose added weight.**  
   [progression.ts:145](/Users/rabah/projects/anygym/src/lib/progression.ts:145)  
   Conversion uses the pin value and clears added weight. **Reproduced:** a previous 100 lb pin plus 25 lb added generated a **45 kg** target and an explanation claiming “last time 100 lb.” The actual resistance was approximately 56.7 kg.  
   **Exact fix:** convert complete stack resistance before rounding to a loadable destination weight. Preserve both components if retaining their breakdown, and use the complete resistance in the explanation.

7. **MAJOR — STILL OPEN: Saved pounds display beneath a kilogram heading.**  
   [SetTable.tsx:125](/Users/rabah/projects/anygym/src/screens/workout/SetTable.tsx:125)  
   After logging 135 lb and switching the gym to kg, the logged row displays `135` under `kg`. Storage remains correct, but the lifting screen misrepresents the recorded load.  
   **Exact fix:** append the stored unit whenever it differs from the column unit, or explicitly convert the displayed value while preserving the original record.

8. **MINOR — STILL OPEN: Current stack increments prevent correcting historical reps honestly.**  
   [StackSelector.tsx:53](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:53)  
   Log a 15 lb pin, change the machine step to 10 lb, then edit that set’s reps. Mounting the picker clears its historical load and disables Save until another weight is selected.  
   **Exact fix:** preserve historical pin, added weight and total during Edit. Validate against current increments only after an explicit weight change.