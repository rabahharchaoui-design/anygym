Found **11 issues in completed `[x]` features**. No files edited. Fixed earlier findings are excluded.

Typecheck passed. Read-only probes passed **5,280 weight combinations and 84 solver round trips**. Recovery failures below were reproduced with in-memory IndexedDB; UI races are source-traced, without physical iPhone testing.

1. **MAJOR — STILL OPEN: Failed Undo acceptance can permanently lose a lift after restart.**  
   [sessionRecovery.ts:38](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:38), [tombstones.ts:80](/Users/rabah/projects/anygym/src/db/tombstones.ts:80)  
   If persisting Undo acceptance fails, its protection remains memory-only. Restart after expiry deletes the tombstone. **Reproduced: neither the set nor its recovery record remained.**  
   **Exact fix:** Journal Undo intent through a durable fallback and hydrate it before expiry or Finish. Preserve ambiguous deleted records for explicit recovery when intent could not be persisted.

2. **MAJOR — STILL OPEN: Startup can expose an obsolete weight as the current draft.**  
   [main.tsx:31](/Users/rabah/projects/anygym/src/main.tsx:31)  
   Startup swallows mirror-read failures and mounts without recovery. **Reproduced: the app-facing draft contained 135 lb while IndexedDB held the newer 185 lb draft.** Subsequent logging can save the obsolete value.  
   **Exact fix:** Keep workout mutations and mirror writes blocked until hydration succeeds. Show Retry on failure and rerun `restoreMirrors()` before enabling logging.

3. **MAJOR — STILL OPEN: “Keep it deleted” can retain a restored set.**  
   [sessionRecovery.ts:39](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:39), [tombstones.ts:93](/Users/rabah/projects/anygym/src/db/tombstones.ts:93)  
   Accept Undo, fail restoration, then minimize and resume. Automatic recovery restores the set but leaves the manager unresolved. Finish offers “Keep it deleted”; cancellation removes only the tombstone. **Reproduced: the finished workout retained the unwanted set and its lifted total.**  
   **Exact fix:** Perform recovery through the manager and resolve its state after restoration. Serialize recovery with cancellation and verify the tombstone transactionally before restoring.

4. **MAJOR — STILL OPEN: An open weight editor can change the wrong pending rows.**  
   [ExerciseView.tsx:198](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:198), [ExerciseView.tsx:249](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:249)  
   Check row 3 during a delayed save, then open row 2’s picker. Logging moves pending rows, but Done still uses the old index. It can change an unintended preceding row’s weight; the type picker has the same dependency. **Source-traced race.**  
   **Exact fix:** Materialize a stable draft ID when opening either editor. Resolve its current slot before applying changes, including downward weight propagation.

5. **MAJOR — STILL OPEN: Edit Save can change weights after Finish.**  
   [WorkoutScreen.tsx:293](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:293), [workouts.ts:151](/Users/rabah/projects/anygym/src/db/workouts.ts:151)  
   Edit saves bypass the finishing lock and tracked mutation queue. A save queued behind Finish can alter the completed workout’s weight and total. **Reproduced: `updateSet()` accepted 155 lb after completion.** Browser timing remains source-traced.  
   **Exact fix:** Block opening/saving edits once finishing starts, track saves through `logQueue.mutate()`, and transactionally reject updates whose parent session is missing or ended.

6. **MAJOR — STILL OPEN, legacy identity: Older Smith sets enter Olympic history.**  
   [history.ts:33](/Users/rabah/projects/anygym/src/db/history.ts:33)  
   A saved barbell load without `barId` inherits the exercise’s default identity. Older Smith bench records therefore become Olympic records. **Reproduced: a legacy plates-only Smith set from gym A appeared in gym B’s Olympic history**, affecting LAST TIME, targets and records.  
   **Exact fix:** Treat missing equipment identity as unresolved. Exclude ambiguous legacy sets from equipment-specific comparisons until the user confirms their bar; persist that confirmation.

7. **MAJOR — STILL OPEN, remaining single-weight path: Kettlebells use dumbbell availability.**  
   [SetLoadInput.tsx:78](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:78), [load.ts:546](/Users/rabah/projects/anygym/src/lib/load.ts:546)  
   A 53 lb kettlebell cannot be entered in the default 5 lb-step dumbbell range. **Reproduced: 53 lb kettlebell history generates a loggable 55 lb target saying only “Aim for 10 or better.”**  
   **Exact fix:** Give kettlebells and fixed single implements independent availability or exact numeric entry. Use it consistently for selection, validation, prefill and progression, and disclose any suggested weight change.

8. **MAJOR — STILL OPEN: A restored dumbbell range can freeze the app.**  
   [load.ts:309](/Users/rabah/projects/anygym/src/lib/load.ts:309), [load.ts:319](/Users/rabah/projects/anygym/src/lib/load.ts:319)  
   `{ min: 5, max: 5, step: 1e-12 }` passes backup parsing. Integer scaling makes the step zero, so opening the picker loops indefinitely after Replace. **Parser acceptance and execution timeout reproduced.**  
   **Exact fix:** Reject steps below supported precision or whose scaled integer is zero. Generate a bounded, precomputed number of options.

9. **MAJOR — STILL OPEN: Unsupported restored plates crash loading.**  
   [backup.ts:154](/Users/rabah/projects/anygym/src/lib/backup.ts:154)  
   An enabled 999 kg plate passes backup parsing. Loading then throws `Unknown kg plate: 999`, after Replace has committed. **Reproduced.**  
   **Exact fix:** Validate inventory weights against `PLATE_SPECS[gym.unit]` before restoration. Validate stored plate breakdowns against their own units too.

10. **MINOR — STILL OPEN: Equivalent mixed-unit sets fail progression eligibility.**  
    [progression.ts:154](/Users/rabah/projects/anygym/src/lib/progression.ts:154), [progression.ts:174](/Users/rabah/projects/anygym/src/lib/progression.ts:174)  
    Equivalent 20 kg and 44.092… lb dumbbells, both reaching the top rep target, retain 20 kg instead of progressing to available 22 kg. `sameAll` still requires identical units. **Reproduced.**  
    **Exact fix:** Use normalized resistance comparison for both `sameAll` and the bodyweight streak check.

11. **MINOR — NEW: Equal stack resistance misses rep records when its breakdown changes.**  
    [load.ts:588](/Users/rabah/projects/anygym/src/lib/load.ts:588), [records.ts:57](/Users/rabah/projects/anygym/src/lib/records.ts:57)  
    Previous: 100 lb pin +25 lb added, 10 reps. Today: 125 lb pin, 12 reps. Both total 125 lb, but same-unit comparison requires matching `added`. **Reproduced: no rep record.**  
    **Exact fix:** Compare complete resistance consistently in every unit. Keep pin/add-on decomposition separate from resistance equality, while retaining equipment identity filtering.