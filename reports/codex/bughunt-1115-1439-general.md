Found **10 MAJOR and 1 MINOR findings**, all **STILL OPEN** from earlier reports. Reviewed completed `[x]` work only; fixed findings excluded. No files edited.

1. **MAJOR — STILL OPEN: Finish can silently omit a submitted set.**  
   [workoutFinish.ts:83](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:83), [useFinish.ts:79](/Users/rabah/projects/anygym/src/screens/workout/useFinish.ts:79)  
   Another tab’s failed Log can survive only in the durable draft mirror. Finish overlooks it, reports success, then clears recovery input. Reproduced: submitted **73 lb × 19** was omitted.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against commit/cancellation receipts, reject unresolved submissions, and snapshot that reconciled state for Undo.

2. **MAJOR — STILL OPEN: Discard → Undo loses pending input.**  
   [discard.ts:14](/Users/rabah/projects/anygym/src/db/discard.ts:14), [TodayScreen.tsx:171](/Users/rabah/projects/anygym/src/screens/TodayScreen.tsx:171)  
   A failed first Log without a journal passes the “empty workout” check. Discard clears its drafts; Undo restores only the session and counter. Ordinary unsubmitted weight/reps picks also disappear.  
   **Exact fix:** Coordinate Discard with Log admission, refuse unresolved submissions, and transactionally retain drafts, added rows and rest state. Undo must restore their durable records and runtime stores.

3. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect differing values only at equal revisions, although tabs allocate revisions independently. Reproduced: pending **73 lb × 19, revision 1** disappeared against a different revision-5 receipt.  
   **Exact fix:** Require matching payload evidence or explicit causal supersession before consuming a draft, regardless of revision ordering. Preserve conflicts under distinct recoverable identities.

4. **MAJOR — STILL OPEN: Backup can omit a durable correction.**  
   [backup.ts:80](/Users/rabah/projects/anygym/src/db/backup.ts:80), [backup.ts:102](/Users/rabah/projects/anygym/src/db/backup.ts:102)  
   Held corrections are captured before the table snapshot. Reproduced: a correction arriving between those reads was omitted while a later committed set was included. Restoring that backup loses the correction.  
   **Exact fix:** Read durable held corrections inside the same transaction as sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

5. **MAJOR — STILL OPEN: Logging resurrects deliberately removed drafts.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage unavailable, a clean cached draft is reinserted whenever its slot is absent from IndexedDB—even after removal elsewhere. Reproduced with removed **73 lb × 19** input.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence; refresh memory from the committed merge.

6. **MAJOR — STILL OPEN: Single-horn machines double the entered plates.**  
   [loads.ts:47](/Users/rabah/projects/anygym/src/lib/load/loads.ts:47), [plan-exercise-overrides.json:159](/Users/rabah/projects/anygym/data/plan-exercise-overrides.json:159)  
   Every plate machine assumes two symmetric horns. One physical **45 lb** plate on a single-horn seated calf machine records **90 lb** with “Plates only.” Violates §0’s exact-data rule.  
   **Exact fix:** Store a confirmed one/two-horn mode per machine and gym, asking when unknown. Snapshot it on each load and use it throughout calculations, solving, drawings and import. Preserve historical totals.

7. **MAJOR — STILL OPEN: Beginner targets ignore stack add-ons.**  
   [useWorkout.ts:282](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:282)  
   The strength calculation receives only the pin value, then reconstructs without added resistance. Reproduced: **100 lb pin + 50 lb added**, lifted for ten reps, produces a **110 lb** eight-rep target.  
   **Exact fix:** Calculate estimates and increase limits from complete resistance in `src/lib/load/`. Reconstruct an explicit pin/add-on combination representing the intended total.

8. **MAJOR — STILL OPEN: Restore loads personal plans before required approvals.**  
   [backup.ts:183](/Users/rabah/projects/anygym/src/db/backup.ts:183), [main.tsx:68](/Users/rabah/projects/anygym/src/main.tsx:68)  
   Plans containing newly approved candidate exercises fail registration before approvals load. Reproduced: the stored definition became valid after approvals loaded but remained unavailable in the registry. Startup has the same ordering race.  
   **Exact fix:** Await `loadApprovals()` before `loadSavedPlans()` during Replace, Merge and startup. Surface loading/registration failures with Retry instead of silently continuing.

9. **MAJOR — STILL OPEN: Missing generated-plan definitions silently change the workout.**  
   [useWorkout.ts:163](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:163), [workoutFinish.ts:30](/Users/rabah/projects/anygym/src/db/workoutFinish.ts:30)  
   An older tab can observe a generated session without its tab-local plan definition. The workout substitutes Quick prescriptions; Finish omits plan advancement. Reproduced: the definition existed in IndexedDB while lookup and finish progress remained undefined.  
   **Exact fix:** Resolve saved definitions reactively by `planId`; block fallback while a nonempty plan ID is unresolved. Include `db.plans` in Finish’s transaction and resolve the definition there.

10. **MAJOR — STILL OPEN: Rechecking a failed Log changes its gym.**  
    [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213), [useLogRow.ts:50](/Users/rabah/projects/anygym/src/screens/workout/useLogRow.ts:50)  
    Submit at gym A, let journaling fail, switch to B, then check the row again. `markSubmitted()` replaces A with B, contaminating machine history and future targets. The helper reproduction confirmed the identity change.  
    **Exact fix:** Preserve `base.gymId` whenever `base.submitted !== undefined`, including revision zero. Capture the current gym only for a fresh submission.

11. **MINOR — STILL OPEN: Available lighter loads can be reported as unavailable.**  
    [steps.ts:94](/Users/rabah/projects/anygym/src/lib/load/steps.ts:94)  
    Nearest rounding can return the current weight across an inventory gap, causing `stepDown()` and lighter-week scaling to return `null`. Reproduced at **70 kg** with a 320 mm women’s sleeve, competition collars and sparse plates, despite lighter loadable totals.  
    **Exact fix:** Select the greatest physically loadable total strictly below the current weight using the solver’s lower result. Use that result when lighter scaling rounds back to the current weight.

Validation: **Typecheck passed.** Targeted in-memory probes reproduced the logic/storage failures above. Browser layouts, native gestures and VoiceOver were not exercised.