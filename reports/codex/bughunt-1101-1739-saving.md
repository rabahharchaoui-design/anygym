**6 MAJOR findings in completed `[x]` features, all STILL OPEN.** No files edited. Earlier fixed findings and unchecked 2.2d work are excluded.

1. **MAJOR — STILL OPEN: Legacy “Keep it deleted” destroys a newer deletion’s recovery copy.**  
   [tombstones.ts:136](/Users/rabah/projects/anygym/src/db/tombstones.ts:136)

   Recover a tokenless legacy deletion in tab A. In B, restore, correct, and delete that set again. A’s cancellation treats its missing token as a wildcard and deletes B’s newer tombstone. **Reproduced: both the set and its newer recovery copy were absent afterward.**

   **Exact fix:** Require exact token equality during cancellation and expiry, including legacy cases. Assign legacy deletions persistent identities before hydrating their managers. Require matching restoration identity before cancellation can delete an already-restored set.

2. **MAJOR — STILL OPEN: Finish can discard another tab’s failed correction.**  
   [workouts.ts:372](/Users/rabah/projects/anygym/src/db/workouts.ts:372), [workouts.ts:435](/Users/rabah/projects/anygym/src/db/workouts.ts:435)

   Finish snapshots fallback storage, then continues asynchronously. Another tab whose database connection fails can register a correction after that snapshot. **Reproduced: Finish saved 10 reps while 19 remained pending; Retry then consumed the correction without applying it.**

   **Exact fix:** Serialize mutation registration, fallback handoff, and Finish under one shared per-session lock across tabs. Check journal and fallback intents while holding that lock. Preserve unresolved corrections until saved or explicitly discarded.

3. **MAJOR — STILL OPEN: Failed edits disappear after termination when localStorage also refuses them.**  
   [mutations.ts:267](/Users/rabah/projects/anygym/src/db/mutations.ts:267)

   If the journal write fails and localStorage is blocked/full, the correction remains only in memory—even when IndexedDB `kv` still works. **Reproduced: the running instance retained a 19-rep correction; a fresh instance found zero pending changes and finished with the original 10 reps.**

   **Exact fix:** Persist `heldRows([held])` into `db.kv` when normal mutation journaling fails, as restore already does. Retain that copy until successful application or explicit discard. Recovery and Finish must inspect it.

4. **MAJOR — STILL OPEN: Equal timestamps let Retry overwrite a newer successful save.**  
   [mutations.ts:150](/Users/rabah/projects/anygym/src/db/mutations.ts:150), [mutations.ts:297](/Users/rabah/projects/anygym/src/db/mutations.ts:297)

   An older failed correction and a newer successful correction from separate tabs can share `at`. If fallback cleanup fails, the strict `<` supersession check retains the obsolete correction. **Reproduced: successfully saved 19 reps became 17 after Retry.**

   **Exact fix:** Replace timestamp-only supersession with explicit applied/superseded operation identities and ordering coordinated across tabs. Preserve that identity through fallback and retry; never promote an obsolete retry into a new latest correction.

5. **MAJOR — STILL OPEN: Storage failure lets another tab overwrite pending inputs despite working IndexedDB.**  
   [drafts.ts:169](/Users/rabah/projects/anygym/src/lib/drafts.ts:169), [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)

   Without writable localStorage, hydrated tabs skip merging and mirror their complete cached draft collections into IndexedDB. Editing different rows therefore overwrites another tab’s input. **Reproduced: A still displayed 17 reps, but B’s unrelated edit replaced the durable value with 7.** Restart recovers the wrong pending set.

   **Exact fix:** Persist changes individually by stable draft identity. Transactionally merge changed rows into IndexedDB with allocated revisions, and subscribe tabs to committed changes. Remove whole-collection replacement from stale caches.

6. **MAJOR — STILL OPEN: Undo recovery restores a set into an exercise missing from the workout.**  
   [workouts.ts:224](/Users/rabah/projects/anygym/src/db/workouts.ts:224), [workouts.ts:326](/Users/rabah/projects/anygym/src/db/workouts.ts:326)

   Delete an exercise’s only set, request Undo, and let restoration fail temporarily. Remove the exercise while its saved-set count is zero. Recovery later restores the accepted Undo without restoring the exercise’s membership. **Reproduced: one saved set existed while `session.exerciseIds` was empty**, hiding it from the workout list.

   **Exact fix:** Include tombstones and journals in `removeExercise()`’s transaction and refuse removal while that exercise has unresolved deletions or writes. Defensively restore exercise membership when recovering an accepted Undo.

Typecheck passed. Control probes passed for Log deduplication/retry, journal recovery, Delete/Finish rollback, accepted-Undo recovery, Finish→Undo snapshots, and update deferral during active workouts or failed activity reads.

Probes used actual modules with in-memory IndexedDB and simulated restarts. Physical iOS termination, browser race timing, and live service-worker activation remain unverified.