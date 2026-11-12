Found **10 findings: 8 MAJOR, 2 MINOR**, all **STILL OPEN** from earlier reports. Reviewed completed features only; no files edited. Fixed findings are excluded.

1. **MAJOR — STILL OPEN: Single-horn machines double the lifted weight.**  
   [loads.ts:47](/Users/rabah/projects/anygym/src/lib/load/loads.ts:47)  
   Every plate machine uses `start + 2 × plates`. One physical **45 lb plate** on a single-horn calf machine with “Plates only” saves and displays **90 lb**. Reproduced through saving and formatting the record.  
   **Exact fix:** Ask for one or two loading horns per machine/gym. Snapshot that count on each load and use it consistently in construction, solving, drawings, copying and import. Preserve existing historical totals.

2. **MAJOR — STILL OPEN: Finish can omit a submitted lift.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83), [useFinish.ts:76](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:76)  
   If another tab’s journal write fails, its submitted **73 lb × 19** can survive only in the durable draft mirror. Finish overlooks that mirror, succeeds, and clears recovery input. The existing expected-failure regression still reproduces this.  
   **Exact fix:** Serialize Log admission and Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against commit/cancellation receipts and reject unresolved submissions. Build the Undo snapshot from that reconciled state.

3. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision weights.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect different payloads only at equal revisions. Independently editing tabs can therefore lose pending **73 lb × 19, revision 1** against saved **53 lb × 10, revision 5**. Different bars, collars and machine starts are also affected. Existing expected-failure tests confirm this.  
   **Exact fix:** Require matching payload evidence or explicit causal supersession before consuming a draft, regardless of revision ordering. Retain conflicts under distinct recoverable identities.

4. **MAJOR — STILL OPEN: Backup can omit a durable weight correction.**  
   [backup.ts:80](/Users/rabah/projects/anygym/src/db/backup.ts:80), [backup.ts:102](/Users/rabah/projects/anygym/src/db/backup.ts:102)  
   Held corrections are captured before the database snapshot. A correction retained during that gap can be absent from both exported sets and pending changes—even while a later committed set is included. Restore loses the correction. The existing expected-failure regression confirms this boundary.  
   **Exact fix:** Read durable held corrections within the same snapshot transaction as sets, journals and supersession receipts. Coordinate fallback/memory capture with mutation registration.

5. **MAJOR — STILL OPEN: Discard → Undo loses a failed first set.**  
   [discard.ts:14](/Users/rabah/projects/anygym/src/db/discard.ts:14), [TodayScreen.tsx:200](/Users/rabah/projects/anygym/src/screens/TodayScreen.tsx:200)  
   After the first Log’s journal write fails, Discard sees no saved set or journal and accepts the workout as empty. It clears drafts; Undo restores only the session and counter. Reproduced: **73 lb × 19** disappeared after successful Undo.  
   **Exact fix:** Coordinate Discard with Log admission, inspect submitted drafts and held changes, and retain pending state transactionally for Undo. Restore drafts, added rows and rest alongside the session.

6. **MAJOR — STILL OPEN: Logging can resurrect deliberately removed input.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage unavailable, the durable merge reinserts a clean cached draft whenever its slot is absent from IndexedDB. A removal elsewhere therefore becomes pending input again. Reproduced with a removed **73 lb × 19** draft.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence. Refresh memory from the successfully committed merge.

7. **MAJOR — STILL OPEN: Retrying through ✓ changes the lift’s gym identity.**  
   [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213), [useLogRow.ts:50](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:50)  
   Submit at gym A, let journaling fail, switch to B, then check the row again. `markSubmitted()` overwrites A with B. Reproduced through saving: the lift entered **B’s machine history**, contaminating Last time and future targets.  
   **Exact fix:** Preserve `base.gymId` whenever `base.submitted !== undefined`, including revision zero. Capture today’s gym only for a fresh submission.

8. **MAJOR — STILL OPEN: Beginner targets discard stack add-on resistance.**  
   [useWorkout.ts:282](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:282)  
   The strength calculation receives only the pin value, then reconstructs without the add-on. A **100 lb pin + 50 lb added** test set for ten reps produces a **110 lb** eight-rep target. The kg equivalent changes **75 kg to 55 kg**. Reproduced using production functions.  
   **Exact fix:** Calculate estimates and increase limits from complete resistance through `src/lib/load/`. Return an explicit pin/add-on load representing the intended total—**165 lb** in this example.

9. **MINOR — STILL OPEN: “Total lifted” undercounts repetitions performed per side.**  
   [records.ts:14](/Users/rabah/projects/anygym/src/lib/load/records.ts:14), [hotel-gym-3-day.json:196](/Users/rabah/projects/anygym/data/plans/hotel-gym-3-day.json:196)  
   The hotel plan prescribes single-arm rows each side, but saved sets retain no counting mode. **20 lb × 10 per arm** contributes **200 lb**, rather than **400 lb**, to Finish and History totals.  
   **Exact fix:** Snapshot repetition-count mode on submission and include performed side count in volume calculations. Preserve implement weight and per-side progression reps.

10. **MINOR — STILL OPEN: Available lighter loads can be reported as unavailable.**  
    [steps.ts:94](/Users/rabah/projects/anygym/src/lib/load/steps.ts:94)  
    Nearest rounding can return the current weight across an inventory gap, causing `stepDown()` and lighter-week scaling to return `null`. Reproduced with a **15 kg women’s bar, competition collars, 320 mm sleeves and 25/0.5 kg plates**: stepping down from **70 kg** fails although **46 kg** is loadable.  
    **Exact fix:** Add a solver operation returning the greatest physically loadable total strictly below the current total. Use it when lighter scaling rounds back to the current weight.

Validation: typecheck passed; **72 focused tests passed**, with **six expected failures** reproducing known defects. **15,840 independent sum checks and 15,840 solver round trips passed** across lb/kg, bars and collars. Browser sequences were source-traced; physical iPhone timing was not tested.