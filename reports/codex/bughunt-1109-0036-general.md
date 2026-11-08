Found **6 confirmed findings: 2 new, 4 STILL OPEN** in completed `[x]` features. Fixed earlier findings are excluded. No files edited. TypeScript passed; in-memory production-helper probes reproduced these failures. Browser race timing and physical iPhone behavior were not tested.

1. **MAJOR — STILL OPEN: Finish silently omits a submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [rowLog.ts:302](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:302)  
   Another tab’s failed Log can survive only in the IndexedDB draft mirror. Finish checks cached drafts and journals, overlooks that submission, then clears drafts. Reproduced: pending **73 lb × 19**, but Finish succeeded with only the earlier set saved. Violates §§0.4 and 13.3.  
   **Exact fix:** Coordinate Log admission and Finish under the session lock. Inside Finish’s transaction, reconcile durable drafts against submission/cancellation receipts, refuse unresolved submissions, and derive the Undo snapshot from that reconciled state.

2. **MAJOR — STILL OPEN: Reconciliation erases conflicting input with a lower revision.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect different values only when revisions match, although tabs allocate revisions independently. Reproduced: pending **73 lb × 19, revision 1** vanished against saved **53 lb × 10, revision 5**.  
   **Exact fix:** Treat differing fingerprints as unresolved regardless of revision ordering. Preserve the conflicting draft and use immutable operation identities with transactionally coordinated revisions.

3. **MAJOR — STILL OPEN: “Finish without it” discards values different from those shown.**  
   [ExerciseView.tsx:313](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:313), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry reuses the previous operation ID. Two tabs can submit different values under identical ID, revision and operation. Reproduced: the sheet represented **53 lb × 17**; the journal subsequently held **73 lb × 19**; dismissing the sheet deleted that submission and allowed Finish.  
   **Exact fix:** Assign `op: newId()` on every toast Retry. Include the payload fingerprint in `ShownRow` and require an exact transactional match before discarding.

4. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the database snapshot. A correction retained during that gap enters neither exported sets nor pending changes. Reproduced: the source durably retained **73 lb × 19**, while backup contained the old **53 lb × 10** and a later set, without the correction. Restoring loses the intended edit.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

5. **MAJOR — NEW: A coach weight increase silently removes stack add-on resistance.**  
   [coach/levelUp.ts:61](/Users/rabah/projects/anygym/src/lib/coach/levelUp.ts:61), [useWorkout.ts:266](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:266)  
   The coach calculates from the stack’s pin value, then rebuilds its target without `added`. Reproduced: **100 lb pin + 25 lb added = 125 lb** earned “+5 lb,” but the resulting target was **105 lb total**—20 lb lighter. Violates §§0.1 and 20.2.  
   **Exact fix:** Carry the pin/add-on breakdown through `PlannedChange` and `CoachTarget`. Calculate changes from complete resistance through `load.ts`, round the pin after accounting for the add-on, and preserve that add-on when rebuilding targets.

6. **MAJOR — NEW: Failed Quick workout setup leaves the wrong workout permanently selected.**  
   [db/quick.ts:85](/Users/rabah/projects/anygym/src/db/quick.ts:85)  
   Plan creation commits before trimming and deck swaps. If a subsequent write fails, Retry returns the partially configured active session without completing setup. Reproduced: a four-exercise, 30-minute deck became the original **16-exercise day**, untrimmed, after one failed trim write and Retry. Violates §20.3.  
   **Exact fix:** Check for an existing session, create the plan session, apply its trim and perform every deck swap within one outer Dexie transaction covering their tables. Any failure must roll back the newly created session.