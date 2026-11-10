Found **8 MAJOR and 1 MINOR findings**, all **STILL OPEN** from earlier reports. Reviewed completed `[x]` features only; excluded fixed findings. No files edited.

1. **MAJOR — STILL OPEN: Finish can lose a submitted set.**  
   [workouts.ts:530](/Users/rabah/projects/anygym/src/db/workouts.ts:530), [WorkoutScreen.tsx:659](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:659)  
   Another tab’s failed Log can survive solely in the IndexedDB draft mirror. Finish overlooks it, succeeds, then clears drafts. **Reproduced:** submitted **73 lb × 19** was omitted. Violates §§0.4 and 13.3.  
   **Exact fix:** Serialize Log admission with Finish under the session lock. Inside Finish’s transaction, reconcile durable submitted drafts against commit/cancellation receipts, refuse unresolved submissions, and capture reconciled drafts for Undo.

2. **MAJOR — STILL OPEN: Recovery erases conflicting lower-revision input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Tabs allocate revisions independently, but differing payloads are protected only at equal revisions. **Reproduced:** pending **73 lb × 19, revision 1** disappeared against saved **53 lb × 10, revision 5**.  
   **Exact fix:** Preserve differing fingerprints regardless of revision ordering. Consume input only with matching committed evidence or explicit causal supersession; coordinate revisions transactionally and retain conflicting input under recoverable identities.

3. **MAJOR — STILL OPEN: Backup omits a durable correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:101](/Users/rabah/projects/anygym/src/db/backup.ts:101)  
   Held corrections are read before the database snapshot. **Reproduced:** a failed correction became durable during that gap; backup included the original set and a later committed set, but omitted the correction. Restore loses the intended edit.  
   **Exact fix:** Read durable held corrections inside the same snapshot transaction as sets, journals and suppression receipts. Coordinate memory/fallback capture with mutation registration under the session lock.

4. **MAJOR — STILL OPEN: Logging resurrects deliberately removed input.**  
   [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)  
   With localStorage unavailable, the durable merge reinserts clean cached drafts whenever IndexedDB lacks their slot—including intentional removals from another tab. **Reproduced:** removed **73 lb × 19** returned to storage.  
   **Exact fix:** Merge only dirty updates and explicit deletions. Clean cached rows must adopt committed state, including absence; refresh memory from the successful merge.

5. **MAJOR — STILL OPEN: Single-horn machines double the entered plates.**  
   [load.ts:467](/Users/rabah/projects/anygym/src/lib/load.ts:467), [plan-exercise-overrides.json:159](/Users/rabah/projects/anygym/data/plan-exercise-overrides.json:159)  
   Every plate machine assumes two equally loaded horns. On a single-horn seated calf machine, entering one physical **45 lb plate** with “Plates only” displays and saves **90 lb**. The current picker offers no correct loading mode.  
   **Exact fix:** Ask whether the machine uses one horn or two symmetric horns. Store that mode per machine and snapshot it on each load; use it consistently in calculations, solving, diagrams and import. Preserve historical totals.

6. **MAJOR — STILL OPEN: An unresolved generated plan becomes Quick workout behavior.**  
   [useWorkout.ts:161](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:161), [workouts.ts:428](/Users/rabah/projects/anygym/src/db/workouts.ts:428)  
   An older tab can see a session created elsewhere without knowing its generated plan. It substitutes Quick prescriptions; Finish omits plan advancement. **Reproduced with isolated module contexts:** all 12 prescribed sets were saved, but the plan pointer remained unchanged. Violates §20.  
   **Exact fix:** Resolve saved definitions reactively from IndexedDB by `planId`. Include loading/errors in readiness, block fallback for unresolved nonempty plan IDs, and resolve the definition inside Finish’s transaction.

7. **MAJOR — STILL OPEN: Beginner targets forget stack add-on resistance.**  
   [useWorkout.ts:280](/Users/rabah/projects/anygym/src/screens/workout/useWorkout.ts:280)  
   The test-set calculation receives the pin value and reconstructs without the add-on. **Reproduced:** **100 lb pin + 50 lb added**, lifted for 10 reps, produces a **110 lb** target for eight reps. The calculation ignores 50 lb actually lifted.  
   **Exact fix:** Calculate the estimate and increase limits from complete resistance through `load.ts`. Reconstruct the target with an explicit add-on policy that preserves the intended total.

8. **MAJOR — STILL OPEN: Rechecking a failed Log changes its gym identity.**  
   [ExerciseView.tsx:258](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:258), [setTable.ts:213](/Users/rabah/projects/anygym/src/lib/setTable.ts:213)  
   Log at gym A, let journaling fail, switch to B, then retry through the row’s check. `markSubmitted()` replaces A with B, contaminating machine history and future targets. **Helper reproduction confirmed the identity change; browser sequence source-traced.**  
   **Exact fix:** Preserve `base.gymId` when retrying an already-submitted draft. Capture the current gym only for a fresh submission after resolving or discarding the previous operation.

9. **MINOR — STILL OPEN: “Total lifted” undercounts per-side exercises.**  
   [load.ts:948](/Users/rabah/projects/anygym/src/lib/load.ts:948), [HistoryDetail.tsx:40](/Users/rabah/projects/anygym/src/screens/history/HistoryDetail.tsx:40)  
   Saved sets retain no repetition-count mode. Consequently, **20 lb × 10 per arm** contributes **200 lb**, rather than **400 lb**, to Finish and History totals.  
   **Exact fix:** Snapshot whether repetitions are per side on submission. Calculate volume using the performed side count through `load.ts`, while preserving implement weight and per-side progression reps.

Verification: TypeScript passed; 170 independent plate-sum checks and 12 solver round trips passed. Reproductions used production modules with in-memory IndexedDB. Physical iPhone layouts, native gestures and VoiceOver were not verified.