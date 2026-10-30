**8 findings in completed `[x]` features.** No files edited. Earlier fixed findings are excluded.

1. **MAJOR — STILL OPEN: Failed Undo can permanently lose its set after restart.**  
   [tombstones.ts:59](/Users/rabah/projects/anygym/src/db/tombstones.ts:59), [sessionRecovery.ts:36](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:36)  
   Delete succeeds, but Undo acceptance and both intent-storage fallbacks fail. After iOS terminates the app, recovery expires the remaining tombstone after five seconds. **Reproduced:** neither the set nor its recovery record remained.  
   **Exact fix:** Persist explicit finalization when an ordinary deletion’s Undo window expires. On startup, retain unfinalized tombstones and require Restore/Keep deleted before Finish; elapsed time alone must not destroy them.

2. **MAJOR — STILL OPEN: Overlapping edits erase the newer failed edit’s recovery journal.**  
   [mutations.ts:37](/Users/rabah/projects/anygym/src/db/mutations.ts:37), [mutations.ts:49](/Users/rabah/projects/anygym/src/db/mutations.ts:49)  
   Concurrent saves share one journal ID. The older save deletes that entry even when it now contains the newer save. Closing/reopening a saving editor or using another tab allows overlap. **Reproduced:** 17 reps saved, the newer 19-rep write failed, and no pending mutation remained to block Finish.  
   **Exact fix:** Give each mutation an operation token. Inside `apply()`’s transaction, compare that token with the current journal entry; skip superseded operations and delete only the matching entry.

3. **MAJOR — Delayed Undo recovery can resurrect a second deletion with outdated values.**  
   [tombstones.ts:87](/Users/rabah/projects/anygym/src/db/tombstones.ts:87), [workouts.ts:295](/Users/rabah/projects/anygym/src/db/workouts.ts:295)  
   Recovery captures an accepted tombstone outside the restoration transaction. Meanwhile, another Undo restores the set, the user edits it and deletes it again. The delayed recovery checks only that *a* tombstone exists, then restores its old snapshot. **Reproduced:** a newly deleted 17-rep set returned as 10 reps, and its new tombstone disappeared.  
   **Exact fix:** Assign every deletion a unique token. Carry it through Undo and recovery; transactionally verify the same deletion still exists and restore its current stored record. Apply matching-token checks to cancellation and expiry too.

4. **MAJOR — STILL OPEN: A stale Delete can remove a set after Finish.**  
   [workouts.ts:252](/Users/rabah/projects/anygym/src/db/workouts.ts:252)  
   Unlike Edit and set-type changes, `deleteSet()` never checks its parent session. A stale editor in another tab can delete from an already-finished workout, invalidating its summary and plan completion. **Reproduced:** an ended workout lost its only set.  
   **Exact fix:** Include `db.sessions` in the delete transaction. Before deleting, reject missing or ended parents with `WorkoutFinishedError`; leave the set and tombstone tables unchanged.

5. **MAJOR — Finish can erase a failed submission journal created after its preliminary checks.**  
   [WorkoutScreen.tsx:438](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:438), [workouts.ts:346](/Users/rabah/projects/anygym/src/db/workouts.ts:346)  
   Finish checks pending writes before entering its transaction, then unconditionally deletes session journals. Another tab can create a failed Edit or Log between those steps. **Reproduced:** a pending 19-rep edit existed, but Finish removed its journal and saved the original 10 reps. The logging lock protects only the current JavaScript process.  
   **Exact fix:** Check for unresolved journals inside Finish’s transaction and reject while any exist. Validate session activity transactionally when creating journals, and coordinate finishing across tabs.

6. **MAJOR — STILL OPEN, journal-write failure variant: Finish overlooks failed Edit/type changes.**  
   [mutations.ts:49](/Users/rabah/projects/anygym/src/db/mutations.ts:49), [WorkoutScreen.tsx:329](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:329)  
   If the initial journal write fails, the mutation has no retained recovery entry. Dismissing Edit loses its local values; the type picker already closes before saving. Finish then sees no outstanding change. **Reproduced:** Save 17 reps failed at journaling, yet Finish succeeded with 10 reps and no retry/discard decision.  
   **Exact fix:** Register unresolved mutation payloads in session memory before journaling and retain them on journal failure. Include them in Finish’s checks, offer retry/explicit discard, and attempt a durable fallback. Keep the failure visible inside Edit.

7. **MAJOR — STILL OPEN: Delayed logging redirects the open reps editor to another row.**  
   [ExerciseView.tsx:406](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:406)  
   Weight/type editors use stable IDs, but the reps editor stores a displayed index. Log row 3, then open row 2’s stepper while saving. When row 3 commits, pending rows move and the stepper attaches to the former row 1. Subsequent taps change the wrong set’s reps. **Row movement reproduced; complete browser interaction remains source-traced.**  
   **Exact fix:** Store `idOf(row)` as the editor target. Resolve its current row on every render/change and close the editor when that identity commits or disappears.

8. **MAJOR — STILL OPEN: Backup omits hydrated pending sets when localStorage is unavailable.**  
   [drafts.ts:300](/Users/rabah/projects/anygym/src/lib/drafts.ts:300)  
   Startup can recover drafts from IndexedDB into `hydrated`, but `exportDrafts(null)` reads neither that store nor its contents until an exercise populates the session cache. Exporting from Settings immediately after restart silently omits pending weights, reps and holds. **Reproduced:** a readable 17-rep draft exported as `{}`.  
   **Exact fix:** Read and validate `hydrated.get(NO_STORAGE)` when storage is absent, then overlay the active memory cache. Verify export immediately after hydration without opening the workout.

Typecheck passed. Read-only probes confirmed ordinary transactional rollback, same-ID Log deduplication, committed-row reconciliation, accepted-Undo recovery, and Finish → Undo restoration of drafts, added rows and rest. Update guards deferred reload for active workouts and failed activity reads. Termination was simulated by dropping runtime state; physical iOS kills and real service-worker activation were not tested.