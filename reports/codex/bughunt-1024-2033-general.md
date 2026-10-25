Found **8 issues in completed features**. No files edited. Earlier fixed findings are excluded. Typecheck passed; in-memory probes confirmed the plate-unit, progression-conversion, and rep-record defects. UI timing and layout findings are source-traced; physical iPhone testing was not performed.

1. **MAJOR — STILL OPEN: Changing units silently reinterprets pending plates.**  
   [exerciseLoad.ts:125](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:125)  
   Pick 135 lb, minimize, change Settings to kg, then resume. The draft’s `[45]` plates become **110 kg**, including nonexistent 45 kg plates. This violates SPEC §0’s accurate-data requirement.  
   **Exact fix:** Store the originating unit alongside draft plates, including unknown-base drafts. Reject cross-unit or unavailable plates until explicitly reselected; solve converted suggestions against the destination inventory.

2. **MAJOR — STILL OPEN: Wheel confirmation can save a different weight from its readout.**  
   [DumbbellWheel.tsx:95](/Users/rabah/projects/anygym/src/components/load/DumbbellWheel.tsx:95), [WeightSheet.tsx:98](/Users/rabah/projects/anygym/src/screens/workout/WeightSheet.tsx:98)  
   Scrolling changes the visible weight immediately, but publishes the load after 110 ms. Confirming during that interval can show 50 each while saving 30 each. **The code permits this race; physical touch reproduction remains unverified.**  
   **Exact fix:** Publish the displayed selection synchronously, or block Done/Save until scrolling settles. Apply this to both Weight and Edit sheets.

3. **MAJOR — Logged pounds appear under a kilogram heading after switching units.**  
   [SetTable.tsx:125](/Users/rabah/projects/anygym/src/screens/workout/SetTable.tsx:125)  
   Log 135 lb, change the gym to kg, then resume. The logged row still displays `135`, beneath the `kg` column heading. Saved storage remains correct, but the lifting screen misrepresents the weight, violating SPEC §§0 and 20.  
   **Exact fix:** Show the stored unit whenever it differs from the column unit, or explicitly convert the displayed value. Preserve the original load on save.

4. **MAJOR — Progression chooses the “heaviest” mixed-unit set by its raw number.**  
   [progression.ts:107](/Users/rabah/projects/anygym/src/lib/progression.ts:107)  
   A workout containing 135 lb and 100 kg treats 135 lb as heavier. Subsequent targets derive from roughly 61 kg instead of the actual 100 kg reference. Mixed-unit sessions are possible through the built Settings flow.  
   **Exact fix:** Compare every candidate after conversion into one unit through `load.ts`; retain the winning set’s original load. Normalize equivalent loads for `sameAll` too.

5. **MAJOR — Converting stack history drops its added weight.**  
   [progression.ts:138](/Users/rabah/projects/anygym/src/lib/progression.ts:138)  
   A previous 100 lb pin plus 25 lb added becomes a **45 kg** suggestion after switching units. The engine converts only the pin and sets added weight to zero; the actual previous resistance was about **56.7 kg**.  
   **Exact fix:** Convert the complete resistance, including added weight, before rounding to a destination pin. If preserving the breakdown, convert both components and ensure their sum matches the suggestion and explanation.

6. **MINOR — STILL OPEN: Current stack increments prevent honest historical edits.**  
   [StackSelector.tsx:45](/Users/rabah/projects/anygym/src/components/load/StackSelector.tsx:45)  
   Log a 15 lb pin, later change the step to 10 lb, then edit the old set’s reps. Mounting the picker clears its historical load, disabling Save until a different weight is selected.  
   **Exact fix:** Preserve the historical pin, added load, and total while editing. Validate against current increments only after an explicit weight change.

7. **MINOR — STILL OPEN: Rep records disappear across units.**  
   [records.ts:57](/Users/rabah/projects/anygym/src/lib/records.ts:57)  
   Record detection requires `sameLoad()`, which requires identical units. Even 10 unweighted push-ups recorded in lb followed by 12 in kg produces no rep record.  
   **Exact fix:** Compare compatible loads after conversion with a defined tolerance. Treat unweighted bodyweight loads as unit-independent.

8. **MINOR — Rep controls shrink below the required touch target at 320 px.**  
   [SetTable.module.css:4](/Users/rabah/projects/anygym/src/screens/workout/SetTable.module.css:4)  
   Fixed outer columns, padding, and gaps leave the proportional reps column approximately **41 px wide** at the supported 320 px floor. This violates SPEC §§0 and 13’s 48 pt targets and makes adjacent controls harder to hit. **Calculated from CSS; device confirmation remains outstanding.**  
   **Exact fix:** Give interactive columns a 48 px minimum and reduce narrow-screen gaps/padding or rebalance the remaining columns without horizontal overflow.