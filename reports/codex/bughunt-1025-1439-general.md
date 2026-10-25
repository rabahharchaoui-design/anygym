**12 findings in completed `[x]` features.** No files edited. Earlier fixed findings are excluded. Typecheck passed; in-memory probes checked recovery failures and 5,280 plate sums. UI races are source-traced; physical iPhone behavior was not tested.

1. **MAJOR — STILL OPEN: Failed Undo acceptance can permanently lose a set.**  
   [sessionRecovery.ts:38](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:38), [tombstones.ts:80](/Users/rabah/projects/anygym/src/db/tombstones.ts:80)  
   Reject the write accepting Undo, then restart after five seconds. Protection existed only in memory; recovery deletes the tombstone. **Reproduced: both set and recovery record disappeared.**  
   **Exact fix:** Persist Undo intent through a durable fallback before restoration; hydrate it before expiry and Finish. Preserve unresolved records until restoration or explicit cancellation succeeds.

2. **MAJOR — STILL OPEN: Startup recovery errors expose obsolete weights and reps.**  
   [main.tsx:31](/Users/rabah/projects/anygym/src/main.tsx:31)  
   `.catch(() => [])` mounts the app after hydration fails. **Reproduced: the visible draft contained 135 lb/10 reps while IndexedDB held 185 lb/17 reps.** Logging can save the obsolete values, violating SPEC §0.  
   **Exact fix:** Block workout mutations and mirror writes until hydration succeeds. Render Retry and rerun `restoreMirrors()` before enabling logging.

3. **MAJOR — STILL OPEN: Automatic diagnostics can disclose personal text.**  
   [capture.ts:45](/Users/rabah/projects/anygym/src/lib/reporting/capture.ts:45), [mask.ts:66](/Users/rabah/projects/anygym/src/lib/reporting/mask.ts:66)  
   `Error: workout for jane doe at 12 oak road failed` survives masking and crash-push formatting unchanged. The masking failure is reproduced; actual disclosure depends on an error containing personal text. This breaks SPEC §§0 and 24.  
   **Exact fix:** Allowlist automatic error codes and fixed messages. Replace arbitrary error text with a placeholder; retain approved script locations. Restrict free text to explicitly authored reports.

4. **MAJOR — STILL OPEN: Restored dumbbell settings can freeze the app.**  
   [load.ts:309](/Users/rabah/projects/anygym/src/lib/load.ts:309), [load.ts:319](/Users/rabah/projects/anygym/src/lib/load.ts:319)  
   `{ min: 5, max: 5, step: 1e-12 }` passes backup validation. Integer scaling makes the step zero, so enumeration never advances. **Parser acceptance and execution timeout reproduced.**  
   **Exact fix:** Reject steps below supported precision or whose scaled value is zero. Generate a validated, bounded number of options instead of an open-ended loop.

5. **MAJOR — STILL OPEN: Restore accepts plates that crash weight selection.**  
   [backup.ts:154](/Users/rabah/projects/anygym/src/lib/backup.ts:154)  
   An enabled `999 kg` plate passes parsing. After restoration, the solver throws `Unknown kg plate: 999`. **Reproduced.**  
   **Exact fix:** Validate inventory weights against `PLATE_SPECS[gym.unit]`, and validate stored plate breakdowns against their own units, before committing either restore mode.

6. **MAJOR — STILL OPEN: “Keep it deleted” can save the unwanted set anyway.**  
   [sessionRecovery.ts:39](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:39), [tombstones.ts:93](/Users/rabah/projects/anygym/src/db/tombstones.ts:93)  
   Accept Undo, fail restoration, then minimize/resume. Automatic recovery restores the set but leaves the manager unresolved. “Keep it deleted” subsequently removes only the tombstone. **Reproduced: Finish retained the set.**  
   **Exact fix:** Route recovery through the manager and resolve its state after restoration. Serialize cancellation with recovery and verify tombstone state inside the restoration transaction.

7. **MAJOR — STILL OPEN: A timestamp-storage failure skips the durable draft/rest copy.**  
   [durable.ts:48](/Users/rabah/projects/anygym/src/lib/durable.ts:48)  
   If the workout value saves to localStorage but writing its timestamp fails, `mirror()` exits before writing IndexedDB. **Reproduced: zero mirror records.** Pending state then lacks its intended protection against process termination; actual loss requires device confirmation.  
   **Exact fix:** Attempt the IndexedDB write independently of timestamp persistence. Handle timestamp failure separately so it cannot suppress the mirror.

8. **MAJOR — STILL OPEN: An open editor can change another pending row.**  
   [ExerciseView.tsx:202](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:202), [ExerciseView.tsx:249](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:249)  
   Start a delayed Log for row 3, then open row 2’s weight/type editor. When logging finishes, pending positions move; confirmation still targets the old index and can change the preceding row. **Source-traced race**, violating SPEC §20.  
   **Exact fix:** Persist a stable draft ID when opening either editor. Resolve its current slot on confirmation and propagate weight changes downward from that identity.

9. **MAJOR — STILL OPEN: Edit Save bypasses Finish’s mutation lock.**  
   [WorkoutScreen.tsx:293](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:293), [workouts.ts:151](/Users/rabah/projects/anygym/src/db/workouts.ts:151)  
   Edits neither join Finish’s tracked writes nor check whether the parent workout ended. **Reproduced: `updateSet()` changed a completed set to 155 lb/17 reps.** The browser race remains source-traced.  
   **Exact fix:** Guard editor opening and Save with the finishing lock, track saves through `logQueue.mutate()`, and transactionally reject updates whose parent is missing or ended.

10. **MAJOR — STILL OPEN: Legacy Smith sets contaminate Olympic history.**  
    [history.ts:33](/Users/rabah/projects/anygym/src/db/history.ts:33)  
    Loads lacking `barId` inherit the exercise’s current default. **Reproduced: a legacy plates-only Smith record from gym A appeared in gym B’s Olympic history**, affecting targets and records.  
    **Exact fix:** Treat missing equipment identity as unresolved. Exclude ambiguous records from equipment-specific comparisons until the user confirms their bar; persist that confirmation.

11. **MAJOR — STILL OPEN: Kettlebells use dumbbell availability and silently change targets.**  
    [SetLoadInput.tsx:78](/Users/rabah/projects/anygym/src/screens/workout/SetLoadInput.tsx:78), [load.ts:546](/Users/rabah/projects/anygym/src/lib/load.ts:546)  
    A 53 lb kettlebell cannot be selected from the default 5 lb-step range. **Reproduced: 53 lb history produces a loggable 55 lb target saying only “Aim for 10 or better.”**  
    **Exact fix:** Give kettlebells independent availability or exact numeric entry. Use it consistently in selection, validation, prefill and progression, and disclose suggested weight changes.

12. **MINOR — STILL OPEN: Equivalent stack loads miss rep records.**  
    [load.ts:588](/Users/rabah/projects/anygym/src/lib/load.ts:588)  
    Previous: 100 lb pin +25 lb added, 10 reps. Today: 125 lb pin, 12 reps. Both total 125 lb, but same-unit comparison requires matching add-on values. **Reproduced: no rep record.**  
    **Exact fix:** Compare total resistance consistently across units and loading breakdowns. Keep pin/add-on decomposition separate from resistance equality while retaining equipment filtering.