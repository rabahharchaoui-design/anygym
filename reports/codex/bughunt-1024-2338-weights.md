Found **10 findings in completed `[x]` features**. No files edited. Fixed earlier findings are excluded.

Typecheck passed. Read-only probes passed **678 weight-sum and solver round trips** and reproduced the calculation/recovery failures below. UI sequences were source-traced; physical iPhone testing was not performed.

1. **MAJOR — STILL OPEN: Unit changes fabricate pending plate loads.**  
   [exerciseLoad.ts:125](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:125)  
   Pick 135 lb, minimize, change Settings to kg, then resume. The draft’s `[45]` plates become **110 kg**, including unavailable 45 kg plates. The row remains loggable, and `logSet()` stores that fabricated load unchanged. Plate machines share this path.  
   **Exact fix:** Store the originating unit with draft plates, including unknown-base drafts. Reject rebuilding across units or with unavailable plates; require explicit reselection. Solve converted suggestions against the destination inventory.

2. **MAJOR — STILL OPEN: Failed submissions can disappear after restart.**  
   [ExerciseView.tsx:156](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:156)  
   Logging ignores `writeDrafts()` returning `false`. If saving the submission marker fails and the set write also fails, restart recovers an older, unmarked draft. Finish cannot identify the checked lift as unsaved and can discard it. **Probe recovered zero failed rows.**  
   **Exact fix:** Persist the submitted values, stable ID, revision and submission status in an IndexedDB pending-write journal before attempting Log. Retain it until successful reconciliation or explicit discard, and make Finish inspect it.

3. **MAJOR — STILL OPEN: Failed Undo acceptance allows permanent loss during Finish.**  
   [tombstones.ts:24](/Users/rabah/projects/anygym/src/db/tombstones.ts:24), [deleteUndo.ts:109](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:109)  
   Delete succeeds, then persisting Undo’s acceptance fails. Once that promise settles, Finish sees no pending restoration and deletes the unaccepted tombstone. **Reproduced:** finishing the last-set case left neither the set nor its recovery record.  
   **Exact fix:** Track unresolved Undo requests independently of running promises. Preserve the request after acceptance fails, prevent expiry, and block Finish until restoration succeeds or the user explicitly cancels it. Persist acceptance before treating Undo as accepted.

4. **MAJOR — STILL OPEN: Recovery makes consumed older drafts loggable again.**  
   [setTable.ts:92](/Users/rabah/projects/anygym/src/lib/setTable.ts:92)  
   Reconciliation treats every unequal revision as a newer edit. If storage retained revision 1 while revision 2 logged successfully, restart assigns the stale draft a fresh ID. Checking it saves another lift and inflates workout totals. **Reproduced:** a committed 10-rep row returned as an 8-rep pending row.  
   **Exact fix:** Consume drafts whose revision is **less than or equal to** the committed revision. Preserve and reidentify only revisions strictly greater than the submitted revision.

5. **MAJOR — STILL OPEN: Wheel confirmation can save a different weight from its readout.**  
   [DumbbellWheel.tsx:97](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:97), [WeightSheet.tsx:98](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx:98)  
   Scrolling changes the displayed selection immediately, but publishes the canonical load after 110 ms. Done/Save can confirm **30 each while displaying 50 each**, saving 60 total instead of 100. Single weights are also affected. **The race exists in source; physical touch reproducibility remains unverified.**  
   **Exact fix:** Publish the displayed snapped selection synchronously, or disable confirmation until selection settles. Apply the same guarantee to Weight and Edit sheets.

6. **MAJOR — STILL OPEN: Stack progression loses added resistance.**  
   [progression.ts:145](/Users/rabah/projects/anygym/src/lib/progression.ts:145)  
   Conversion uses the pin value and clears added weight. **Reproduced:** 100 lb pin + 25 lb added produces a **45 kg** target and “last time 100 lb”; actual resistance was approximately **56.7 kg**. The same pin-only comparison also ranks 110 lb without additions above 100 + 25 lb.  
   **Exact fix:** Compare stack sets using complete resistance. Convert pin plus additions before choosing a destination loading; ensure its components sum to the target. Quote complete resistance in the explanation.

7. **MAJOR — NEW: Switching units silently removes bodyweight add-ons.**  
   [exerciseLoad.ts:129](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:129)  
   Select +25 lb for dips, minimize, switch to kg, then resume. `reusable()` rejects the old unit, but the fallback replaces the add-on with zero. **Reproduced:** the pending load becomes unweighted bodyweight and remains loggable, losing the resistance the user entered.  
   **Exact fix:** Preserve the original weighted draft. On a unit mismatch, require an explicit add-on selection or confirmation before logging; never substitute zero for an incompatible weighted load.

8. **MAJOR — STILL OPEN: Logged rows use today’s unit and loading convention.**  
   [SetTable.tsx:125](/Users/rabah/projects/anygym/src/screens/workout/SetTable.tsx:125)  
   Log 135 lb, switch Settings to kg, then resume: the saved row displays **135 beneath “kg.”** Storage remains correct. Changing “Loaded with” also creates misleading conventions: a saved single 60 lb weight appears beneath **“lb each”** after switching to dumbbells.  
   **Exact fix:** Render logged rows from each saved load’s unit and kind. Add explicit units and “each”/“total” qualifiers when they differ from the current header, or convert for display while preserving the stored record.

9. **MINOR — STILL OPEN: Current stack increments prevent honest historical corrections.**  
   [StackSelector.tsx:53](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:53)  
   Log a 15 lb pin, change increments to 10 lb, then edit the old set’s reps. Mounting the picker clears the historical load and disables Save. Correcting reps requires selecting a different recorded weight.  
   **Exact fix:** Give historical edits a snapshot mode preserving the saved pin, added weight and total. Apply current-increment validation only after an explicit weight change.

10. **MINOR — STILL OPEN: Equivalent loads across units miss rep records.**  
    [records.ts:57](/Users/rabah/projects/anygym/src/lib/records.ts:57)  
    The “lifted before” check calls `sameLoad()`, which requires identical units. Equivalent resistance misses rep records; even unweighted bodyweight is affected. **Reproduced:** 10 push-ups recorded in lb followed by 12 in kg produces no record.  
    **Exact fix:** Compare compatible resistance after conversion through `load.ts`, using a defined tolerance. Treat unweighted bodyweight as unit-independent.