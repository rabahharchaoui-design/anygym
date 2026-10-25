Found **11 issues in completed `[x]` features**, all **STILL OPEN** from earlier reports. Fixed findings are excluded. No files edited. Typecheck passed; read-only, in-memory probes confirmed six calculation/recovery failures. Physical iPhone testing was not performed.

1. **MAJOR — STILL OPEN: Failed Undo can permanently lose a set.**  
   [deleteUndo.ts:109](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:109), [tombstones.ts:24](/Users/rabah/projects/anygym/src/db/tombstones.ts:24)  
   If persisting Undo acceptance fails, Finish subsequently proceeds and removes the recovery record. Reproduced: finishing left neither the set nor its tombstone.  
   **Exact fix:** Track unresolved Undo requests separately from running promises. Preserve their recovery records and block Finish until restoration succeeds or the user explicitly cancels.

2. **MAJOR — STILL OPEN: Failed Log submissions can disappear after restart.**  
   [ExerciseView.tsx:156](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:156)  
   Logging ignores a failed `writeDrafts()`. If draft persistence and the set write both fail, restarting loses the submission marker; Finish can discard the attempted lift without identifying it as unsaved. The new IndexedDB mirror runs only after successful localStorage writes, so it does not cover this case.  
   **Exact fix:** Await an IndexedDB journal write containing the submission’s ID, revision and complete values before attempting Log. Retain it until successful reconciliation or explicit discard; make Finish inspect it.

3. **MAJOR — STILL OPEN: Restore reports success without durable pending sets.**  
   [backup.ts:58](/Users/rabah/projects/anygym/src/db/backup.ts:58)  
   Replace commits the database before calling `replaceDrafts()` and ignores its failure. Restored weights, reps and running holds can remain only in memory and disappear after termination. Merge has the same problem.  
   **Exact fix:** Persist restored drafts in IndexedDB within the restore transaction. Abort the entire restore if draft persistence fails; initialize localStorage from the committed records.

4. **MAJOR — STILL OPEN: Recovery resurrects consumed older drafts.**  
   [setTable.ts:92](/Users/rabah/projects/anygym/src/lib/setTable.ts:92)  
   Every revision unequal to the committed revision is treated as newer. Reproduced: revision 1’s eight-rep draft returned under a fresh ID after revision 2 committed, allowing another set to be logged.  
   **Exact fix:** Consume drafts with `draft.rev <= committed.rev`. Preserve and reidentify only strictly newer revisions.

5. **MAJOR — STILL OPEN: Unit changes fabricate pending plate loads.**  
   [exerciseLoad.ts:125](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:125)  
   Pick 135 lb, minimize, switch Settings to kg, then resume. Reproduced: `[45]` plates become **110 kg**, including unavailable 45 kg plates, and remain loggable. Plate machines share this path. This violates SPEC §0.  
   **Exact fix:** Store the originating unit with draft plates, including unknown-base drafts. Reject incompatible units and unavailable plates until explicitly reselected or converted through the destination equipment solver.

6. **MAJOR — STILL OPEN: Unit changes silently remove bodyweight add-ons.**  
   [exerciseLoad.ts:129](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:129)  
   Reproduced: a pending **+25 lb** dip becomes unweighted bodyweight after switching to kg. The fallback silently substitutes zero and enables logging.  
   **Exact fix:** Preserve the weighted draft across unit changes. Require explicit conversion or reselection before logging; never replace incompatible added resistance with zero.

7. **MAJOR — STILL OPEN: Wheel confirmation can save a different displayed weight.**  
   [DumbbellWheel.tsx:97](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:97)  
   Scrolling updates the readout immediately but publishes the load after 110 ms. Done/Save can therefore confirm **30 each while displaying 50 each**. Single weights are affected too. **Source-confirmed timing window; physical touch reproduction remains unverified.**  
   **Exact fix:** Publish the displayed snapped selection synchronously, or block confirmation until selection settles. Apply the guarantee to both Weight and Edit sheets.

8. **MAJOR — STILL OPEN: Stack progression drops added resistance.**  
   [progression.ts:112](/Users/rabah/projects/anygym/src/lib/progression.ts:112), [progression.ts:145](/Users/rabah/projects/anygym/src/lib/progression.ts:145)  
   Ranking and conversion use the pin value. Reproduced: **100 lb pin +25 lb added** generates **45 kg**, with “last time 100 lb”; actual resistance was approximately **56.7 kg**. Ranking also favors 110 without additions over 100 +25.  
   **Exact fix:** Compare and convert total resistance, keeping the pin coordinate separate for stepping. Round complete resistance to a loadable destination and quote complete previous resistance.

9. **MAJOR — STILL OPEN: Saved rows inherit today’s unit and count mode.**  
   [SetTable.tsx:125](/Users/rabah/projects/anygym/src/screens/workout/SetTable.tsx:125)  
   After logging 135 lb and switching to kg, the saved row displays **135 beneath “kg.”** Changing “Loaded with” can similarly put a single weight under “each,” or hide a historical rep count when today’s mode is timed. This misrepresents saved data in SPEC §20’s lifting table.  
   **Exact fix:** Render saved rows using each set’s stored load kind, unit and count mode. Explicitly label differences from current headings, including “each” versus “total.”

10. **MINOR — STILL OPEN: Current stack increments prevent historical rep corrections.**  
    [StackSelector.tsx:53](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:53)  
    Log a 15 lb pin, change increments to 10 lb, then edit that set’s reps. Mounting the picker clears the historical load and disables Save until a different weight is chosen.  
    **Exact fix:** Preserve the saved pin, added weight and total during historical edits. Apply current-equipment validation only after an explicit weight change.

11. **MINOR — STILL OPEN: Equivalent loads across units miss rep records.**  
    [records.ts:57](/Users/rabah/projects/anygym/src/lib/records.ts:57)  
    Record detection requires `sameLoad()`, which requires matching units. Reproduced: ten unweighted push-ups recorded in lb followed by twelve in kg earns no rep record.  
    **Exact fix:** Compare compatible resistance after unit conversion with a defined tolerance. Treat unweighted bodyweight as unit-independent.