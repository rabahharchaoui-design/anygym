Found **12 findings in completed `[x]` features**, all **STILL OPEN** from earlier reports. Fixed findings are excluded. No files changed.

Typecheck passed. Read-only probes passed 600 arithmetic/solver cases and reproduced the calculation and recovery failures below. Physical iPhone testing was not performed.

1. **MAJOR — STILL OPEN: Switching units fabricates pending plate weights.**  
   [exerciseLoad.ts:125](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:125)  
   Pick 135 lb, minimize, switch Settings to kg, then resume. The `[45]` plates become kilograms, producing a loggable **110 kg**, including unavailable 45 kg plates. Plate machines share this path; the fabricated load reaches storage unchanged. **Reproduced.**  
   **Exact fix:** Store the originating unit alongside draft plates, including unknown-base drafts. Reject incompatible units and unavailable plates until explicit reselection or confirmed conversion through the destination equipment solver.

2. **MAJOR — STILL OPEN: Failed Undo acceptance allows permanent set loss.**  
   [tombstones.ts:24](/Users/rabah/projects/anygym/src/db/tombstones.ts:24), [deleteUndo.ts:109](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:109)  
   Delete succeeds, but persisting Undo acceptance fails. After the rejected promise settles, Finish proceeds and deletes the recovery record. **Reproduced:** neither the set nor its tombstone remained.  
   **Exact fix:** Track unresolved Undo requests independently of running promises. Preserve their tombstones, prevent expiry, and block Finish until restoration succeeds or the user explicitly cancels.

3. **MAJOR — STILL OPEN: Failed Log submissions disappear after restart.**  
   [ExerciseView.tsx:156](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:156), [drafts.ts:125](/Users/rabah/projects/anygym/src/lib/drafts.ts:125)  
   Log ignores failed draft persistence. If the submission-marker write and set write both fail, restart recovers an older, unmarked draft. Finish no longer recognizes the checked lift as unsaved. **Reproduced:** zero failed rows after restart.  
   **Exact fix:** Await an IndexedDB journal write containing submission ID, revision and complete values before attempting Log. Retain it until successful reconciliation or explicit discard; make Finish inspect it.

4. **MAJOR — STILL OPEN: Finish → Undo can resurrect a deliberately deleted set.**  
   [workouts.ts:298](/Users/rabah/projects/anygym/src/db/workouts.ts:298), [drafts.ts:203](/Users/rabah/projects/anygym/src/lib/drafts.ts:203)  
   Finish deletes submission receipts before confirming draft cleanup. If cleanup fails, reopening exposes a stale draft for a logged-and-deleted set as “not saved.” Retry inserts it again, inflating workout totals. **Reproduced.**  
   **Exact fix:** Retain committed submission receipts for the session’s lifetime, including across Finish and reopening. Reconcile recovered drafts against them before offering retries.

5. **MAJOR — STILL OPEN: Recovery makes consumed older drafts loggable again.**  
   [setTable.ts:92](/Users/rabah/projects/anygym/src/lib/setTable.ts:92)  
   Every revision unequal to the committed revision is treated as a newer edit. **Reproduced:** after revision 2 committed, stale revision 1 returned with a fresh ID, allowing another saved lift.  
   **Exact fix:** Consume drafts where `draft.rev <= committed.rev`. Preserve and reidentify only strictly newer revisions.

6. **MAJOR — STILL OPEN: Restore reports success without durable pending sets.**  
   [backup.ts:58](/Users/rabah/projects/anygym/src/db/backup.ts:58), [backup.ts:98](/Users/rabah/projects/anygym/src/db/backup.ts:98)  
   Replace and Merge commit database changes before restoring drafts, then ignore draft persistence failure. **Reproduced:** Restore reported success, but its pending 17-rep row disappeared after runtime memory was discarded.  
   **Exact fix:** Persist restored drafts in IndexedDB within the restore transaction. Abort the entire restore if persistence fails; populate localStorage from committed data.

7. **MAJOR — STILL OPEN: Wheel confirmation can save a different weight from the readout.**  
   [DumbbellWheel.tsx:97](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:97), [WeightSheet.tsx:98](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx:98)  
   Scrolling changes the displayed selection immediately but publishes the load after 110 ms. Done/Save can retain **30 each while displaying 50 each**, saving 60 total instead of 100. Single weights are affected too. **Source-confirmed timing window; physical touch reproducibility remains unverified.**  
   **Exact fix:** Publish the displayed snapped selection synchronously, or disable confirmation until it settles. Enforce this in both Weight and Edit sheets.

8. **MAJOR — STILL OPEN: Switching units silently removes bodyweight add-ons.**  
   [exerciseLoad.ts:129](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:129)  
   A weighted draft fails the unit compatibility check, and the fallback substitutes zero added resistance. **Reproduced:** pending **+25 lb** dips became unweighted bodyweight, with logging enabled.  
   **Exact fix:** Preserve the original weighted draft. Require explicit conversion or reselection on unit mismatch; never substitute zero for incompatible added resistance.

9. **MAJOR — STILL OPEN: Stack progression drops added resistance.**  
   [progression.ts:112](/Users/rabah/projects/anygym/src/lib/progression.ts:112), [progression.ts:145](/Users/rabah/projects/anygym/src/lib/progression.ts:145)  
   Ranking and conversion use the pin value. **Reproduced:** **100 lb pin +25 lb added** produces a **45 kg** target and “last time 100 lb”; actual resistance was approximately **56.7 kg**. Ranking also favors 110 without additions over 100 +25.  
   **Exact fix:** Compare and convert complete resistance. Keep the pin coordinate separate for stepping, round complete resistance to a loadable destination—57.5 kg here—and quote complete previous resistance.

10. **MAJOR — STILL OPEN: Saved rows inherit today’s units and count mode.**  
    [SetTable.tsx:125](/Users/rabah/projects/anygym/src/screens/workout/SetTable.tsx:125)  
    After logging 135 lb and switching to kg, the saved row displays **135 beneath “kg.”** Changing “Loaded with” can put a single weight under “each,” or hide historical reps under today’s Hold heading. Storage remains correct; the visible record is misleading.  
    **Exact fix:** Render saved rows using each set’s stored unit, load kind and count mode. Explicitly label differences from current headings, including “each” versus “total.”

11. **MINOR — STILL OPEN: Current stack increments prevent honest historical corrections.**  
    [StackSelector.tsx:53](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:53)  
    Log a 15 lb pin, change increments to 10 lb, then edit its reps. Mounting the picker clears the historical load and disables Save until another weight is selected.  
    **Exact fix:** Preserve historical pin, added resistance and total during Edit. Apply current-equipment validation only after an explicit weight change.

12. **MINOR — STILL OPEN: Equivalent resistance across units misses rep records.**  
    [records.ts:57](/Users/rabah/projects/anygym/src/lib/records.ts:57)  
    Record detection requires `sameLoad()`, which requires matching units. **Reproduced:** ten unweighted push-ups recorded in lb followed by twelve in kg earns no rep record.  
    **Exact fix:** Compare compatible resistance after unit conversion with a defined tolerance. Treat unweighted bodyweight as unit-independent.