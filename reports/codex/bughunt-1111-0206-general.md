Found **11 findings: 10 MAJOR, 1 MINOR**, all **STILL OPEN** from earlier reports. Reviewed completed `[x]` features only; excluded fixed findings. No files edited.

1. **MAJOR — STILL OPEN: Failed Retry loses a durable correction.**  
   [mutations.ts:402](/Users/rabah/projects/anygym/src/db/mutations.ts:402)  
   If replacement journaling and fallback persistence both fail, Retry deletes the previous recovery record anyway. **Reproduced:** after reopening, the intended **73 lb × 19** correction vanished; **53 lb × 10** remained saved.  
   **Exact fix:** Retain the predecessor until its replacement commits durably or the user explicitly discards it. Remove the unconditional `forget()` on failed registration.

2. **MAJOR — STILL OPEN: Finish overlooks a submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:659](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:659)  
   Another tab’s failed Log can survive only in the IndexedDB draft mirror. Finish ignores that mirror, succeeds, then clears the recovery drafts. **Reproduced:** Finish accepted a workout containing unresolved submitted input.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against submission and cancellation receipts; reject unresolved submissions and snapshot the reconciled state for Undo.

3. **MAJOR — STILL OPEN: “Finish without it” discards different values from those shown.**  
   [ExerciseView.tsx:281](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:281), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry reuses its operation ID, and discard checks no payload fingerprint. **Reproduced:** a sheet representing **53 lb × 17** deleted a later **73 lb × 19** journal with the same identity, revision and operation.  
   **Exact fix:** Generate a new operation ID on every toast Retry. Snapshot the payload fingerprint in `ShownRow`; transactionally require identity, revision, operation and fingerprint to match before cancellation.

4. **MAJOR — STILL OPEN: Reconciliation erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect differing values only at equal revisions, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**.  
   **Exact fix:** Preserve unmatched payloads regardless of revision ordering. Consume input only with matching committed evidence; coordinate revisions transactionally and retain immutable submission identities.

5. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the table snapshot. **Reproduced:** a correction became durable during that gap; backup included the original set and a later logged set but omitted the correction. Restoring loses the edit.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

6. **MAJOR — STILL OPEN: Single-horn machines double the entered plate weight.**  
   [load.ts:467](/Users/rabah/projects/anygym/src/lib/load.ts:467), [plan-exercise-overrides.json:159](/Users/rabah/projects/anygym/data/plan-exercise-overrides.json:159)  
   Every plate machine uses `start + 2 × plates`. The shipped seated-calf demo depicts one loading horn: entering its single **45 lb plate** with “Plates only” displays and saves **90 lb**.  
   **Exact fix:** Ask for and store the machine’s loading-horn count; snapshot it on each load. Apply that count consistently in calculations, solving, drawings, import and historical display. Preserve existing saved totals.

7. **MAJOR — STILL OPEN: Lighter-week targets drop stack add-on resistance.**  
   [recovery.ts:101](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:101), [recovery.ts:151](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:151)  
   Deload, welcome-back and plateau reductions scale the pin alone, then reconstruct without added weight. **Reproduced:** **100 lb pin + 25 lb added** becomes **90 lb total**, described as “−10 lb”; the actual reduction is **35 lb**.  
   **Exact fix:** Calculate reductions and explanation deltas from complete resistance through `load.ts`. Reconstruct a correctly rounded total, or preserve the pin/add-on breakdown through the stored target.

8. **MAJOR — STILL OPEN: Rechecking a failed Log changes its gym identity.**  
   [ExerciseView.tsx:258](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:258), [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213)  
   Log at gym A, let journaling fail, switch to B, then retry using the row’s check. `markSubmitted()` replaces A with B. **Reproduced:** the retry draft’s gym changed to B, contaminating machine history and targets.  
   **Exact fix:** Preserve `base.gymId` when retrying an already-submitted draft. Capture the current gym only for a fresh submission after resolving or discarding the previous operation.

9. **MAJOR — STILL OPEN: An unresolved generated plan silently uses Quick workout prescriptions.**  
   [useWorkout.ts:161](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:161), [workouts.ts:428](/Users/rabah/projects/anygym/src/db/workouts.ts:428), [main.tsx:57](/Users/rabah/projects/anygym/src/main.tsx:57)  
   An older tab lacks plans generated elsewhere; startup also swallows saved-plan read failures. The workout falls back to **3 × 8–12**, and Finish omits plan progress. This remains source-confirmed; browser timing was not rerun.  
   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`. Include loading/errors in readiness, block fallback for unresolved nonempty plan IDs, and resolve the definition inside Finish’s transaction.

10. **MAJOR — STILL OPEN: Logging resurrects removed pending input.**  
    [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
    With localStorage unavailable, the durable merge reinserts clean cached drafts whenever IndexedDB lacks their slot—even after another tab deliberately removed them. **Reproduced:** removed **73 lb × 19** input returned to durable storage.  
    **Exact fix:** Merge only dirty changes and explicit deletions. Clean rows must adopt committed state, including absence; refresh memory from the committed merge.

11. **MINOR — STILL OPEN: “Total lifted” undercounts per-side exercises.**  
    [load.ts:948](/Users/rabah/projects/anygym/src/lib/load.ts:948), [HistoryDetail.tsx:40](/Users/rabah/projects/anygym/src/screens/history/HistoryDetail.tsx:40)  
    The hotel plan prescribes single-arm rows each side, but saved sets retain no side-count information. **20 lb × 10 per arm** produces **200 lb lifted** instead of **400 lb**.  
    **Exact fix:** Snapshot the repetition-count mode on submission. Multiply volume by the performed side count through `load.ts`, keeping displayed implement weight and progression reps unchanged.

Verification: **typecheck passed; 720 independent sum checks and eight solver round trips passed.** Failure probes used production functions and in-memory IndexedDB. Playwright, physical iPhone layouts, native gestures and VoiceOver were not executed.