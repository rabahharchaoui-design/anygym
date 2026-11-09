**7 confirmed MAJOR findings: 5 STILL OPEN, 2 new.** Completed `[x]` scope only. No files edited; fixed earlier findings excluded.

1. **MAJOR — STILL OPEN: Finish overlooks a submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530)  
   After another tab’s journal write fails, its submission can survive only in the durable draft mirror. Finish ignores that mirror and succeeds. **Reproduced:** pending **73 lb × 19** was omitted; normal Finish cleanup then removes its recovery draft. Violates §§0.4 and 13.3.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against committed and cancellation receipts, refuse unresolved submissions, and build the Undo snapshot from that state.

2. **MAJOR — STILL OPEN: Reconciliation erases conflicting input with a lower revision.**  
   [setTable.ts:176](/Users/rabah/projects/anygym/src/lib/setTable.ts:176)  
   Different fingerprints protect input only at equal revisions, although revisions are allocated independently across tabs. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**.  
   **Exact fix:** Preserve differing payload fingerprints regardless of revision ordering. Consume a draft only with matching committed evidence; coordinate revisions transactionally and retain immutable submission identities.

3. **MAJOR — STILL OPEN: “Finish without it” discards values the user never reviewed.**  
   [ExerciseView.tsx:318](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:318), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry reuses the operation ID, while discard checks no payload fingerprint. **Reproduced:** the sheet represented **53 lb × 17**; dismissing it deleted a later **73 lb × 19** journal sharing the same ID, revision, and operation.  
   **Exact fix:** Generate `op: newId()` on every toast Retry. Include the payload fingerprint in `ShownRow` and require an exact transactional match before cancellation.

4. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the database snapshot. **Reproduced with a failed journal write:** the source retained **73 lb × 19**, but the backup contained the old **53 lb × 10** and a subsequently logged set, without the correction. Restore loses the edit.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals, and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

5. **MAJOR — STILL OPEN: Logging resurrects a removed pending set.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage blocked, the merge reinserts clean cached rows whenever IndexedDB lacks their slot—including intentional removals elsewhere. **Reproduced through `saveDraft()` → `submitRow()`:** removed **73 lb × 19** squat input returned to durable storage after logging bench.  
   **Exact fix:** Remove the clean-row insertion fallback. Merge only dirty changes and explicit deletions; clean rows must adopt committed state, including absence. Refresh memory from the committed merge.

6. **MAJOR — NEW: Lighter-week targets understate resistance and drop stack add-ons.**  
   [recovery.ts:101](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:101), [recovery.ts:151](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:151)  
   Deload, welcome-back, and plateau targets scale the pin value, then rebuild without added resistance. **Reproduced:** **100 lb pin + 25 lb added** becomes **90 lb total**, described as “−10 lb”—actually **35 lb lighter**. The kg path fails too. Violates §§0.1 and 20.2.  
   **Exact fix:** Calculate reductions and explanation deltas from complete resistance through `load.ts`. Round that total to a loadable target; either retain the add-on breakdown through target reconstruction or explicitly produce a correct pin-only total.

7. **MAJOR — NEW: Another open tab substitutes Quick workout targets for a generated plan.**  
   [useWorkout.ts:161](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:161), [useWorkout.ts:200](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:200)  
   Generated definitions enter a tab-local registry only at startup or creation. An older tab sees the new session but cannot resolve its plan. **Reproduced with independent module instances:** prescribed **5 × 6–8** became **3 × 8–12**; finishing omitted plan progress and left the next day unchanged.  
   **Exact fix:** Resolve saved plans reactively from IndexedDB by ID across workout, Today, and Finish. Include loading/errors in readiness; an unresolved nonempty `planId` must block fallback and Finish.

Verification: TypeScript and **48 plate sum/solver controls** passed. Production-function probes reproduced all seven findings in memory. Live browser race timing, physical iPhone behavior, and VoiceOver were not tested.