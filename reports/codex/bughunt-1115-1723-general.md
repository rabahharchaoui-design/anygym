Found **9 MAJOR and 1 MINOR findings**, all **STILL OPEN** from earlier reports. Reviewed completed `[x]` work; fixed findings excluded. No files edited.

1. **MAJOR — STILL OPEN: Finish can silently omit a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83)  
   Another tab’s failed journal write can leave a submission only in the durable draft mirror. Finish overlooks it and succeeds; the screen then clears recovery input. Reproduced: **73 lb × 19** was omitted while Finish reported one saved set. Violates §§0 and 13.3.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against commit/cancellation receipts, reject unresolved submissions, and snapshot that reconciled state for Undo.

2. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect different payloads only when revisions match, although tabs allocate revisions independently. Reproduced: pending **73 lb × 19, revision 1** disappeared against a saved **53 lb × 10, revision 5**.  
   **Exact fix:** Require matching payload evidence or explicit causal supersession before consuming a draft, regardless of revision ordering. Preserve conflicting input under a recoverable identity and allocate revisions transactionally.

3. **MAJOR — STILL OPEN: Backup can omit a durable correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79)  
   Held corrections are captured before the table snapshot. Reproduced: a correction retained during that gap was missing from the export even though a later committed set was included. Restore loses the intended edit.  
   **Exact fix:** Read durable held corrections inside the same snapshot transaction as sets, journals and supersession receipts. Coordinate memory/fallback capture with mutation registration.

4. **MAJOR — STILL OPEN: One-horn machines record double the plates.**  
   [PlateMachineInput.tsx:46](/Users/rabah/projects/anygym/src/components/load/PlateMachineInput.tsx:46), [exerciseLoad.ts:142](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:142)  
   Helpers support one horn, but the picker and reconstruction omit the count. With “Plates only,” one physical **45 lb plate records 90 lb**. Violates §0’s exact-data rule.  
   **Exact fix:** Ask for the horn count when unknown and persist it per machine per gym. Pass it through picking, diagrams, solving, reconstruction, targets, editing and import. Snapshot it on new loads; preserve historical totals.

5. **MAJOR — STILL OPEN: A stale equipment write turns pounds into kilograms.**  
   [gymList.ts:56](/Users/rabah/projects/anygym/src/db/gymList.ts:56)  
   The setter receives no originating unit. After another tab changes a gym to kg, an outstanding **5–50 lb, step-5** range is accepted as **5–50 kg**. Reproduced: the picker permits a **100 kg dumbbell-pair load**. Browser race timing remains untested.  
   **Exact fix:** Pass the range’s originating unit and reject mismatches inside the transaction. Reset range fields and cached `lastRange` when the gym’s unit changes.

6. **MAJOR — STILL OPEN: “Not now” reduces weight while promising the same weight.**  
   [levelUp.ts:102](/Users/rabah/projects/anygym/src/lib/coach/levelUp.ts:102)  
   Declining a weekly increase copies the original stack pin without its add-on. Reproduced through target reconstruction: **100 + 50 lb becomes 100 lb**, labelled “Same as last time”; **50 + 25 kg becomes 50 kg**.  
   **Exact fix:** Snapshot the original pin and add-on in the proposed change. Have `holdChanges()` preserve both through `to`/`toAdded`, `targetOf()` and load reconstruction.

7. **MAJOR — STILL OPEN: An older tab silently changes a generated workout’s prescriptions.**  
   [useWorkout.ts:163](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:163), [workoutFinish.ts:30](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:30)  
   A generated plan can exist in IndexedDB but remain absent from the tab-local registry. The workout uses Quick defaults, and Finish cannot calculate plan advancement. The registry/progress mismatch reproduced; the full browser sequence remains untested. Violates §20.  
   **Exact fix:** Resolve saved definitions reactively by `planId`; block workout readiness while unresolved. Include `db.plans` in Finish’s transaction and resolve the definition there before calculating progress.

8. **MAJOR — STILL OPEN: Logging resurrects deliberately removed drafts.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   Without localStorage, the durable merge reinserts clean cached rows whenever IndexedDB lacks their slot—including deliberate removals elsewhere. Reproduced: removed **73 lb × 19** input returned to durable storage.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed absence. Refresh memory from the committed merge without overwriting subsequent edits.

9. **MAJOR — STILL OPEN: Increasing stack add-ons triggers a false plateau.**  
   [recovery.ts:137](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:137)  
   “Same weight” compares pins alone. Two Hard workouts at **100 + 25 lb**, then **100 + 50 lb**, trigger a plateau and lighter target despite resistance increasing from **125 to 150 lb**. The explanation incorrectly quotes “100 lb.”  
   **Exact fix:** Compare complete loads with `sameResistance()` and format the explanation from complete resistance through `src/lib/load/`.

10. **MINOR — STILL OPEN: “Total lifted” undercounts per-side repetitions.**  
    [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14)  
    Shipped plans prescribe repetitions per side, but saved sets retain no repetition-count mode. **20 lb × 10 per arm** contributes **200 lb**, rather than **400 lb**, to Finish and History totals.  
    **Exact fix:** Snapshot repetition-count mode on submission and include the performed side count in volume calculations, preserving implement weight and progression reps.

Validation: TypeScript passed. Targeted production-helper probes used in-memory IndexedDB. Physical iPhone layouts, VoiceOver and native gestures were not verified.