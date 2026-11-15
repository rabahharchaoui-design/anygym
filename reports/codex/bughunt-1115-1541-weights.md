**10 findings: 8 MAJOR, 2 MINOR.** Reviewed completed `[x]` features and earlier reports. Fixed findings are excluded. No files edited.

1. **MAJOR — STILL OPEN: Single-horn machines still double the plates.**  
   [PlateMachineInput.tsx:46](/Users/rabah/projects/anygym/src/components/load/PlateMachineInput.tsx:46), [exerciseLoad.ts:142](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:142)  
   The math helpers support one horn, but the workout picker and load reconstruction never supply that count. With “Plates only,” one physical **45 lb plate becomes 90 lb**; **20 kg becomes 40 kg**.  
   **Exact fix:** Resolve and save the machine’s horn count, asking when unknown. Thread it through the picker, diagram, solver, progression setup, copying, editing and import. Preserve each saved load’s count and historical total.

2. **MAJOR — STILL OPEN: Finish can omit a submitted lift.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83), [useFinish.ts:76](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:76)  
   Another tab’s failed journal write can leave **73 lb × 19** only in the durable draft mirror. Finish overlooks it, succeeds, and clears recovery input. The expected-failure regression still reproduces this.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against committed/cancelled submissions, reject unresolved input, and snapshot the reconciled state for Undo.

3. **MAJOR — STILL OPEN: Recovery deletes weights never saved.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Payload fingerprints protect conflicts only at equal revisions. Pending **73 lb × 19, revision 1** disappears against saved **53 lb × 10, revision 5**. Different bars, collars and machine starts are affected too.  
   **Exact fix:** Consume a draft only with matching payload evidence or explicit causal supersession, regardless of revision ordering. Preserve conflicting input under a recoverable identity.

4. **MAJOR — NEW: “Not now” drops stack add-ons while claiming the same weight.**  
   [levelUp.ts:102](/Users/rabah/projects/anygym/src/lib/coach/levelUp.ts:102)  
   Declining a weekly increase copies the original pin into the hold target without its add-on. Reproduced through target persistence and set saving: **100 lb pin + 50 lb added becomes 100 lb**, labelled “Same as last time.” **75 kg similarly becomes 50 kg.**  
   **Exact fix:** Snapshot the original pin and add-on when constructing the proposed change. Have `holdChanges()` copy both into `to`/`toAdded`, preserving them through `targetOf()` and `loadAt()`.

5. **MAJOR — NEW: A stale dumbbell-range write can turn pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56), [GymEquipment.tsx:37](/Users/rabah/projects/anygym/src/screens/settings/GymEquipment.tsx:37)  
   Unlike bar-weight answers, this setter receives no originating unit. After another tab changes the gym to kg, an outstanding **5–50 lb, step-5** range is accepted as **5–50 kg**. The picker then permits a **100 kg dumbbell-pair record**. Database behavior reproduced; browser race timing remains untested.  
   **Exact fix:** Pass the range’s originating unit and reject mismatches inside the transaction. Reset the range fields and cached `lastRange` when the gym’s unit changes.

6. **MAJOR — STILL OPEN: Backup can omit a durable weight correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the database snapshot. A correction retained during that gap can be absent from the export even while a later committed set is included. Restore therefore retains the old weight without the correction.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals and supersession receipts. Coordinate memory/fallback capture with mutation registration.

7. **MAJOR — STILL OPEN: Logging can resurrect a draft removed in another tab.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   Without localStorage, the durable merge reinserts a clean cached draft whenever its slot is absent from IndexedDB. Reproduced through `submitRow()`: logging another row restored deliberately removed **73 lb × 19** input to durable storage and the pending rows. The one-tab regression passes; this two-tab variant remains.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed absence. Refresh memory from the committed merge.

8. **MAJOR — NEW: Changing stack add-ons can trigger a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137), [recovery.ts:148](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:148)  
   “Same weight” compares pins alone. Two Hard workouts at **100 + 25 lb**, then **100 + 50 lb**, trigger “felt hard twice … at 100 lb” and a lighter target, despite resistance increasing from **125 to 150 lb**. The kg path also reproduces.  
   **Exact fix:** Compare complete loads with `sameResistance()`. Format the plateau’s quoted weight from complete resistance through `src/lib/load/`.

9. **MINOR — NEW: Coach previews and Undo quote the pin as the previous lifted weight.**  
   [CoachSettings.tsx:84](/Users/rabah/projects/anygym/src/screens/settings/CoachSettings.tsx:84), [LeveledUpSheet.tsx:33](/Users/rabah/projects/anygym/src/screens/today/LeveledUpSheet.tsx:33)  
   For a **150 lb** stack load comprising **100 + 50**, Settings displays **100 → 155 lb**, exaggerating a 5 lb increase into 55 lb. Undo similarly says “Back to 100 lb.”  
   **Exact fix:** Populate `fromTotal` on every `autoExample()` path and display `fromTotal ?? from`. Format destinations with `toWeight()` so retained add-ons are included.

10. **MINOR — STILL OPEN: “Total lifted” undercounts repetitions performed per side.**  
    [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14), [hotel-gym-3-day.json:196](/Users/rabah/projects/anygym/data/plans/hotel-gym-3-day.json:196)  
    The shipped plan prescribes single-arm rows each side, but saved sets retain no repetition-count mode. **20 lb × 10 per arm** contributes **200 lb**, instead of **400 lb**, to Finish and History totals.  
    **Exact fix:** Snapshot repetition-count mode on submission and include performed side count in volume calculations, preserving implement weight and progression reps.

Validation: typecheck passed; focused Vitest runs produced **247 passes and five expected failures** confirming known defects. **26,400 independent sum checks and 223 solver round trips passed.** New examples were checked with production-function/database probes; physical iPhone and full browser sequences were not run.