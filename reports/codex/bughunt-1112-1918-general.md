Found **10 MAJOR and 1 MINOR findings** in completed work. No files edited. Typecheck passed; targeted in-memory probes reproduced the main failures. Browser and physical iPhone checks were not run.

1. **MAJOR — STILL OPEN: Finish omits a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83)  
   A failed Log retained only in the durable draft mirror escapes Finish’s checks. Reproduced: Finish saved the earlier set while omitting **73 lb × 19**; subsequent draft cleanup removes its recovery input. Violates §§0, 13.3.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against commit/cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from that authoritative state.

2. **MAJOR — STILL OPEN: Discard → Undo loses pending input.**  
   [discard.ts:14](/Users/rabah/projects/anygym/src/db/discard.ts:14), [TodayScreen.tsx:200](/Users/rabah/projects/anygym/src/screens/TodayScreen.tsx:200)  
   A failed first Log can leave a submitted draft without a set or journal. Discard considers the workout empty and clears its drafts; Undo restores only the session and counter. Ordinary unsubmitted picks also disappear.  
   **Exact fix:** Coordinate Discard with logging under the session lock; refuse unresolved submissions/held corrections. Transactionally snapshot drafts, extra rows and rest, then restore their durable records and runtime stores on Undo.

3. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Payload conflicts receive protection only at equal revisions, although tabs allocate revisions independently. Reproduced: pending **73 lb × 19, revision 1** disappeared against a different revision-5 submission.  
   **Exact fix:** Consume a draft only when committed payload evidence matches or explicit causal supersession exists. Preserve mismatching fingerprints at every revision under a recoverable identity; coordinate revision allocation transactionally.

4. **MAJOR — STILL OPEN: Backup omits a durable correction.**  
   [backup.ts:80](/Users/rabah/projects/anygym/src/db/backup.ts:80)  
   Held corrections are captured before the table snapshot. Reproduced: a correction retained during that gap was absent from the backup, although a later committed set was included. Restore therefore loses the correction.  
   **Exact fix:** Read durable held corrections in the same transaction as sets, journals and suppression receipts. Coordinate fallback/memory capture with mutation registration under the session lock.

5. **MAJOR — STILL OPEN: Logging resurrects deliberately removed drafts.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage unavailable, the durable merge reinserts clean cached rows whenever IndexedDB lacks their slot—including deliberate removals elsewhere. Reproduced: removed **73 lb × 19** input returned to durable storage.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence; refresh memory from the committed merge.

6. **MAJOR — STILL OPEN: Single-horn machines double the entered plates.**  
   [loads.ts:47](/Users/rabah/projects/anygym/src/lib/load/loads.ts:47), [plan-exercise-overrides.json:159](/Users/rabah/projects/anygym/data/plan-exercise-overrides.json:159)  
   Every plate machine calculates `start + 2 × plates`. A single-horn seated calf machine with one **45 lb** plate and “Plates only” records **90 lb**. Violates §0’s exact-data rule.  
   **Exact fix:** Ask whether the machine loads one horn or two symmetric horns. Store that mode per machine and snapshot it on each load; use it throughout calculations, solving, drawings and import. Preserve existing historical totals.

7. **MAJOR — STILL OPEN: Beginner targets ignore stack add-ons.**  
   [useWorkout.ts:282](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:282)  
   The test-set calculation receives only the pin value, then reconstructs without added resistance. Reproduced: **100 lb pin + 50 lb added**, lifted for ten reps, produces a **110 lb** eight-rep working target.  
   **Exact fix:** Estimate strength and apply increase limits from complete resistance through `src/lib/load/`. Reconstruct an explicit pin/add-on combination preserving the intended target total.

8. **MAJOR — STILL OPEN: An unresolved generated plan becomes Quick workout behavior.**  
   [useWorkout.ts:163](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:163), [workoutFinish.ts:30](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:30)  
   An older tab can observe a generated session without knowing its definition. It substitutes Quick prescriptions; Finish omits plan advancement. This remains source-confirmed; browser timing was not rerun. Violates §20.  
   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`. Block fallback while a nonempty plan ID is unresolved. Include `db.plans` in Finish’s transaction and resolve the definition there before calculating progress.

9. **MAJOR — NEW: Restore loads personal plans before their required approvals.**  
   [backup.ts:183](/Users/rabah/projects/anygym/src/db/backup.ts:183), [backup.ts:239](/Users/rabah/projects/anygym/src/db/backup.ts:239), [main.tsx:68](/Users/rabah/projects/anygym/src/main.tsx:68)  
   Plans containing newly approved candidate exercises fail registration before those approvals load. Reproduced: after Replace restore, the plan existed in IndexedDB and was valid once approvals loaded, but remained unavailable in the plan registry. Cold startup has the same ordering race.  
   **Exact fix:** Await `loadApprovals()` before `loadSavedPlans()` in Replace, Merge and startup. Surface registration/read failures with Retry instead of silently continuing without the saved plan.

10. **MAJOR — STILL OPEN: Rechecking a failed Log changes its gym.**  
    [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213), [useLogRow.ts:49](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:49)  
    Log at gym A, let journaling fail, switch to B, then retry through the row’s check. `markSubmitted()` replaces the captured gym with B. The helper reproduction confirmed this, contaminating machine history and future targets.  
    **Exact fix:** Preserve `base.gymId` for an already-submitted draft. Capture the current gym only for a fresh submission after resolving or discarding the previous operation.

11. **MINOR — STILL OPEN: Available lighter loads can be reported as unavailable.**  
    [steps.ts:94](/Users/rabah/projects/anygym/src/lib/load/steps.ts:94)  
    `stepDown()` rounds to the nearest weight, which can be the current weight across an inventory gap, then returns `null`. Reproduced with a 320 mm women’s sleeve and enabled 25/0.5 kg plates: stepping down from **70 kg** returned `null` despite lighter loadable totals; a lighter-week target also disappeared.  
    **Exact fix:** Select the greatest loadable total strictly below the current weight using the solver’s lower result, respecting sleeve capacity and collars. When lighter scaling rounds back to the current weight, use that strict lower result.