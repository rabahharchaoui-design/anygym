**10 findings: 9 MAJOR, 1 MINOR.** Reviewed completed `[x]` features and earlier reports. No files edited; fixed findings excluded.

1. **MAJOR — NEW: Single-horn machines double the plate weight.**  
   [load.ts:467](/Users/rabah/projects/anygym/src/lib/load.ts:467), [plan-exercise-overrides.json:159](/Users/rabah/projects/anygym/data/plan-exercise-overrides.json:159)  
   Every plate machine uses `start + 2 × plates`. On a single-horn seated calf machine, one physical **45 lb plate**, with “Plates only,” displays and saves **90 lb**. The shipped calf-raise demo depicts this machine layout.  
   **Exact fix:** Add a confirmed loading-horn count per machine and snapshot it on each load. Apply that count consistently in calculations, solving, drawings, import, and saved-record display.

2. **MAJOR — STILL OPEN: Failed Retry deletes the last durable weight correction.**  
   [mutations.ts:402](/Users/rabah/projects/anygym/src/db/mutations.ts:402)  
   Retry removes the original recovery record even when both replacement journaling and fallback persistence fail. **Reproduced:** a retained **73 lb × 19** correction disappeared after reopening; **53 lb × 10** remained saved with nothing pending.  
   **Exact fix:** Remove the unconditional `forget()` after failed registration. Keep the predecessor until its replacement commits durably or the user explicitly discards it.

3. **MAJOR — STILL OPEN: Finish omits a submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:666](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:666)  
   Another tab’s failed journal write can leave its submission only in the durable draft mirror. Finish overlooks it, succeeds, and clears drafts. **Reproduced:** submitted **73 lb × 19** was absent from the finished workout.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against committed and cancellation receipts, reject unresolved submissions, and snapshot that reconciled state for Undo.

4. **MAJOR — STILL OPEN: A higher revision erases different lifting evidence.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect conflicting payloads only at equal revisions, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**. Different bars, collars, or starting resistance are vulnerable too.  
   **Exact fix:** Preserve unmatched payloads regardless of revision ordering. Require matching committed evidence before consuming input; coordinate revisions transactionally and retain immutable submission identities.

5. **MAJOR — STILL OPEN: “Finish without it” discards a weight the user never reviewed.**  
   [ExerciseView.tsx:319](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:319), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry reuses its operation ID; discard compares no payload fingerprint. **Reproduced:** the sheet represented **53 lb × 17**, but discarded a later **73 lb × 19** journal sharing its ID, revision, and operation.  
   **Exact fix:** Generate `op: newId()` on every toast Retry. Snapshot the payload fingerprint in `ShownRow` and transactionally require identity, revision, operation, and fingerprint to match before cancellation.

6. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79)  
   Held corrections are captured before the table snapshot. **Reproduced:** a **73 lb × 19** correction became durable during that gap; backup contained the old **53 lb × 10** and a subsequently logged **83 lb** set, without the correction. Restore loses the intended weight.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals, and suppression receipts. Coordinate memory and fallback capture with mutation registration under the session lock.

7. **MAJOR — STILL OPEN: Lighter-week targets drop stack add-ons.**  
   [recovery.ts:101](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:101), [recovery.ts:151](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:151)  
   Deload, welcome-back, and plateau reductions scale the pin alone and reconstruct without added resistance. **Reproduced through saving:** **100 lb pin + 25 lb added** became **90 lb total**, described as “−10 lb”; the actual reduction is **35 lb**. The kg path likewise changed **60 kg to 45 kg**, described as “−5 kg.”  
   **Exact fix:** Calculate reductions and explanation deltas from complete resistance through `load.ts`. Reconstruct a correctly rounded total or preserve the pin/add-on breakdown through the stored target.

8. **MAJOR — STILL OPEN: Checking a failed Log again changes its gym identity.**  
   [ExerciseView.tsx:296](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:296), [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213)  
   Log at gym A, let journaling fail, switch to B, then retry using the row’s check. `markSubmitted()` replaces the original gym with B. **Reproduced:** the machine lift entered B’s history, contaminating its Last time, records, and targets.  
   **Exact fix:** Preserve `base.gymId` for an already-submitted draft. Capture the current gym only for a fresh submission after resolving or discarding the previous operation.

9. **MAJOR — STILL OPEN: Logging resurrects removed pending input.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage unavailable, a clean cached draft is reinserted whenever IndexedDB lacks its slot—even after deliberate removal elsewhere. **Reproduced through Log:** removed squat input, **73 lb × 19**, returned to durable storage and became available to log again.  
   **Exact fix:** Merge only dirty changes and explicit deletions. Clean rows must adopt committed state, including absence; refresh memory from the committed merge.

10. **MINOR — NEW: “Total lifted” undercounts exercises prescribed per side.**  
    [load.ts:948](/Users/rabah/projects/anygym/src/lib/load.ts:948), [HistoryDetail.tsx:40](/Users/rabah/projects/anygym/src/screens/history/HistoryDetail.tsx:40)  
    The hotel plan prescribes single-arm rows **each side**, but saved sets retain no counting mode. **Reproduced:** **20 lb × 10 per arm** produces **200 lb lifted** instead of **400 lb**. Finish uses the same calculation.  
    **Exact fix:** Snapshot the repetition-count mode on submission. Multiply volume by the performed side count while keeping the displayed implement weight and per-side progression reps unchanged.

Verification: **3,954 independent sum checks and 60 solver round trips passed**, including lb/kg, bars, collars, and unit/inventory rejection. Failures above were exercised with production functions and in-memory IndexedDB; physical iPhone timing was not tested. Typecheck fails on an existing unused `expect` import at [zz-gate-critic-explore.spec.ts:1](/Users/rabah/projects/anygym/tests/zz-gate-critic-explore.spec.ts:1).