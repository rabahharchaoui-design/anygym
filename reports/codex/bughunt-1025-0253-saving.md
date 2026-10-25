Found **11 issues in completed `[x]` features**. No files changed. Fixed earlier findings are excluded. Typecheck passed; in-memory probes used the actual modules. Physical iPhone termination and touch timing were not tested.

1. **MAJOR — STILL OPEN: Failed Undo acceptance allows permanent set loss.**  
   [tombstones.ts:24](/Users/rabah/projects/anygym/src/db/tombstones.ts:24), [deleteUndo.ts:109](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:109)  
   Delete succeeds, but persisting Undo’s acceptance fails. Once that promise settles, Finish sees no outstanding write and deletes the unaccepted tombstone. **Reproduced:** Finish discarded the session, leaving neither set nor recovery record.  
   **Exact fix:** Track unresolved Undo requests independently of running promises. Preserve their tombstones, prevent expiry, and block Finish until restoration succeeds or the user explicitly cancels.

2. **MAJOR — STILL OPEN: Failed Log submissions disappear after restart.**  
   [ExerciseView.tsx:156](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:156), [drafts.ts:120](/Users/rabah/projects/anygym/src/lib/drafts.ts:120)  
   Log ignores failed draft persistence. If saving the submission marker and the IndexedDB set write both fail, restarting recovers an older, unmarked draft. Finish then overlooks the attempted set. **Reproduced:** Log returned `false`; after simulated restart, failed rows were empty and Finish discarded the workout.  
   **Exact fix:** Await an IndexedDB journal containing submission ID, revision and complete values before attempting Log. Retain it until successful reconciliation or explicit discard; make Finish inspect it. Surface journal failure before treating the submission as accepted.

3. **MAJOR — NEW: Finish → Undo can resurrect an intentionally deleted set.**  
   [workouts.ts:298](/Users/rabah/projects/anygym/src/db/workouts.ts:298), [drafts.ts:203](/Users/rabah/projects/anygym/src/lib/drafts.ts:203)  
   Finish deletes submission receipts before confirming draft cleanup. If localStorage cleanup fails, undoing Finish reloads stale drafts without their receipts. A previously logged-and-deleted set appears as “not saved”; Try again inserts it anew. **Reproduced:** a workout finished with one retained set, then contained that set plus the deleted nine-rep set after reopening and retrying.  
   **Exact fix:** Retain committed submission receipts across Finish and reopening. Remove them only when stale drafts cannot return, or retain them for the session’s lifetime. Reconcile recovered drafts against these receipts before offering retries.

4. **MAJOR — STILL OPEN: Restore reports success without durable pending sets.**  
   [backup.ts:58](/Users/rabah/projects/anygym/src/db/backup.ts:58), [backup.ts:98](/Users/rabah/projects/anygym/src/db/backup.ts:98)  
   Replace and Merge commit database changes before restoring drafts, then ignore draft persistence failure. Pending weights, reps and running holds can survive only in memory. **Reproduced:** Restore reported success and restored the active session, but its pending 17-rep row disappeared after dropping runtime memory.  
   **Exact fix:** Persist restored drafts in IndexedDB within the restore transaction. Abort the complete restore if persistence fails; populate localStorage from the committed records.

5. **MAJOR — STILL OPEN: Recovery makes consumed older drafts loggable again.**  
   [setTable.ts:92](/Users/rabah/projects/anygym/src/lib/setTable.ts:92)  
   Reconciliation treats every unequal revision as a newer edit. If storage retains revision 1 after revision 2 commits, recovery assigns the obsolete row a fresh ID. **Reproduced:** an older eight-rep draft returned as a new pending set despite its identity already having committed at revision 2.  
   **Exact fix:** Consume drafts when `draft.rev <= committed.rev`. Preserve and reidentify only strictly newer revisions.

6. **MAJOR — STILL OPEN: Unit changes fabricate pending plate loads.**  
   [exerciseLoad.ts:125](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:125)  
   Pick 135 lb, minimize, change Settings to kg, then resume. The stored `[45]` plates are interpreted as kilograms. **Reproduced:** the draft became a loggable **110 kg**, including unavailable 45 kg plates. Plate machines share this path.  
   **Exact fix:** Store the originating unit with draft plates, including unknown-base drafts. Reject cross-unit rebuilding and unavailable plates until explicit reselection or conversion through the destination equipment solver.

7. **MAJOR — STILL OPEN: Unit changes silently erase bodyweight add-ons.**  
   [exerciseLoad.ts:129](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:129)  
   A weighted bodyweight draft fails the unit compatibility check and falls back to zero added resistance. **Reproduced:** a pending **+25 lb** dip became unweighted bodyweight after switching to kg, with logging still enabled.  
   **Exact fix:** Preserve the original weighted draft. Require explicit conversion or reselection on unit mismatch; never substitute zero for incompatible added resistance.

8. **MAJOR — STILL OPEN: Wheel confirmation can save a different displayed weight.**  
   [DumbbellWheel.tsx:97](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:97), [WeightSheet.tsx:98](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx:98)  
   Scrolling changes the readout immediately but publishes the load after 110 ms. Done or Edit’s Save can confirm the previous **30 each while displaying 50 each**. Single weights are affected too. **The timing window is source-confirmed; physical touch reproduction remains unverified.**  
   **Exact fix:** Publish the displayed snapped selection synchronously, or disable confirmation until it settles. Enforce the same guarantee in Weight and Edit sheets.

9. **MAJOR — STILL OPEN: Stack progression loses added resistance.**  
   [progression.ts:112](/Users/rabah/projects/anygym/src/lib/progression.ts:112), [progression.ts:145](/Users/rabah/projects/anygym/src/lib/progression.ts:145)  
   Ranking and conversion use the pin value rather than complete resistance. **Reproduced:** **100 lb pin +25 lb added** generated a **45 kg** target and “last time 100 lb”; actual resistance was approximately 56.7 kg. Ranking also favors 110 without additions over 100 +25.  
   **Exact fix:** Compare and convert total resistance. Keep the pin coordinate separate for incrementing; round complete resistance to a loadable destination—57.5 kg here—and quote complete previous resistance.

10. **MAJOR — STILL OPEN: Saved rows inherit today’s units and count mode.**  
    [SetTable.tsx:125](/Users/rabah/projects/anygym/src/screens/workout/SetTable.tsx:125)  
    After logging 135 lb and switching to kg, the saved row shows **135 beneath “kg.”** Changing “Loaded with” can put a single weight beneath “each,” or hide historical reps beneath today’s Hold heading. Stored data remains correct, but the lifting table misrepresents it.  
    **Exact fix:** Render saved rows using each set’s stored unit, load kind and count mode. Explicitly label differences from current headings, including “each” versus “total.”

11. **MINOR — STILL OPEN: Current stack increments prevent historical rep corrections.**  
    [StackSelector.tsx:53](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:53)  
    Log a 15 lb pin, change increments to 10 lb, then edit its reps. Mounting the picker clears the historical load and disables Save until another weight is selected.  
    **Exact fix:** Preserve historical pin, added resistance and total during Edit. Apply current-equipment validation only after an explicit weight change.

Fault-injection checks confirmed transactional rollback for Log, Edit, Delete, accepted-Undo restoration and Finish, plus same-ID deduplication. Update activity checks now defer on an active workout or unreadable storage; I found no additional confirmed update-specific defect.