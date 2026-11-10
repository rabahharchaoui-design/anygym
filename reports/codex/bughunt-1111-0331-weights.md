**11 findings: 10 MAJOR, 1 MINOR.** Reviewed completed `[x]` scope and earlier reports; fixed findings excluded. No files edited.

1. **MAJOR — STILL OPEN: Failed Retry loses a durable weight correction.**  
   [mutations.ts:402](/Users/rabah/projects/anygym/src/db/mutations.ts:402)  
   When replacement journaling and fallback persistence both fail, Retry deletes the previous recovery record. **Reproduced:** after reopening, the intended **73 lb × 19** correction vanished; **53 lb × 10** remained saved.  
   **Exact fix:** Retain the predecessor until its replacement commits durably or the user explicitly discards it. Remove the unconditional `forget()` following failed registration.

2. **MAJOR — STILL OPEN: Finish omits a submitted lift.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:659](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:659)  
   Another tab’s failed journal write can leave its submission solely in the durable draft mirror. Finish overlooks it, succeeds, then clears drafts. **Reproduced:** Finish saved only the earlier set despite durable submitted **73 lb × 19** input.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against submission/cancellation receipts, refuse unresolved submissions, and construct the Undo snapshot from that reconciled state.

3. **MAJOR — STILL OPEN: A higher revision erases different lifting evidence.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect conflicting payloads only at equal revisions, although tabs allocate revisions independently. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**. Different bars, collars and machine starts are vulnerable too.  
   **Exact fix:** Preserve differing fingerprints regardless of revision ordering. Consume drafts only with matching committed payload evidence or explicit causal supersession; coordinate revisions transactionally.

4. **MAJOR — STILL OPEN: “Finish without it” discards values the user never reviewed.**  
   [ExerciseView.tsx:281](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:281), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   Toast Retry reuses its operation ID; discard checks identifiers without comparing payloads. **Reproduced:** the sheet represented **53 lb × 17**, but discarded a later **73 lb × 19** journal sharing those identifiers.  
   **Exact fix:** Generate a fresh operation ID on every toast Retry. Snapshot the payload fingerprint in `ShownRow`; transactionally require identity, revision, operation and fingerprint to match before cancellation.

5. **MAJOR — STILL OPEN: Backup omits a durably retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are captured before the table snapshot. **Reproduced:** a correction became durable during that gap; backup contained the original **53 lb × 10** and a subsequently logged set, without the **73 lb × 19** correction. Restore loses the intended weight.  
   **Exact fix:** Read durable held corrections inside the snapshot transaction alongside sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

6. **MAJOR — STILL OPEN: Single-horn machines double the entered plates.**  
   [load.ts:467](/Users/rabah/projects/anygym/src/lib/load.ts:467), [plan-exercise-overrides.json:159](/Users/rabah/projects/anygym/data/plan-exercise-overrides.json:159)  
   Every plate machine uses `start + 2 × plates`. On a single-horn seated calf machine, one physical **45 lb plate**, with “Plates only,” produces a **90 lb** load record.  
   **Exact fix:** Ask whether plates are loaded on one horn or symmetrically on two. Store that loading mode per machine and snapshot it on each load; apply it consistently in sums, solving, drawings, import and saved-record display. Preserve existing historical totals.

7. **MAJOR — STILL OPEN: Rechecking a failed Log changes its gym identity.**  
   [ExerciseView.tsx:258](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:258), [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213)  
   Log at gym A, let journaling fail, switch to B, then retry through the row’s check. `markSubmitted()` replaces A with B. **Helper reproduction confirmed the change.** Machine history, records and future targets then use the wrong equipment context.  
   **Exact fix:** Preserve `base.gymId` for an already-submitted draft. Capture the current gym only for a fresh submission after resolving or discarding the previous operation.

8. **MAJOR — STILL OPEN: Lighter-week targets drop stack add-ons.**  
   [recovery.ts:101](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:101), [recovery.ts:151](/Users/rabah/projects/anygym/src/lib/coach/recovery.ts:151)  
   Deload, welcome-back and plateau reductions scale the pin alone, then reconstruct without added resistance. **Tests reproduced:** **100 lb pin + 50 lb added = 150 lb** becomes **90 lb total**, rather than **135 lb**. **75 kg** similarly becomes **45 kg**, rather than **67.5 kg**. Explanation deltas also understate the reduction.  
   **Exact fix:** Calculate reductions and explanation deltas from complete resistance through `load.ts`. Either preserve the pin/add-on breakdown through the stored target or produce a correctly rounded pin-only total.

9. **MAJOR — NEW: Beginner test-set targets also forget stack add-ons.**  
   [useWorkout.ts:280](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:280), [useWorkout.ts:282](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:282)  
   The test-set calculation receives only `pickedWeight()`—the pin—and reconstructs without `added`. **Reproduced:** a **150 lb** test set, comprising **100 + 50 added**, for 10 reps produces a **110 lb** working target for eight reps. The kg equivalent changes **75 kg to 55 kg**. It forgets real resistance when setting the beginner’s number.  
   **Exact fix:** Calculate the test-set estimate and limits from complete resistance in `load.ts`; reconstruct the target with an explicit, consistent add-on policy.

10. **MAJOR — STILL OPEN: Logging resurrects intentionally removed pending input.**  
    [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
    With localStorage unavailable, the merge reinserts clean cached rows whenever IndexedDB lacks their slot—including deliberate removals elsewhere. **Reproduced:** removed **73 lb × 19** input returned to durable storage and became available for logging again.  
    **Exact fix:** Merge only dirty changes and explicit deletions. Clean rows must adopt committed state, including absence; refresh memory from the committed merge.

11. **MINOR — STILL OPEN: “Total lifted” undercounts exercises prescribed per side.**  
    [load.ts:948](/Users/rabah/projects/anygym/src/lib/load.ts:948), [HistoryDetail.tsx:40](/Users/rabah/projects/anygym/src/screens/history/HistoryDetail.tsx:40)  
    Saved sets retain no repetition-count mode. **20 lb × 10 per arm** therefore contributes **200 lb**, rather than **400 lb**, to Finish and History totals.  
    **Exact fix:** Snapshot the repetition-count mode on submission. Multiply volume by the performed side count while preserving implement weight and per-side progression reps.

Verification: Typecheck passed; **3,600 independent sum checks and 48 solver round trips passed**. Focused tests: **83 passed, five failed**, confirming findings 1, 4 and 8. Other failures were checked with production-function probes. The broader suite encountered sandbox-blocked filesystem tests. Browser race timing and physical iPhone behavior remain unverified.