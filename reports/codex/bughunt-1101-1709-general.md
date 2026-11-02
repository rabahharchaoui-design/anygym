**8 findings in completed `[x]` features. No files edited.** Fixed earlier findings and unchecked 2.2d work are excluded. Typecheck passed; six in-memory/helper probes reproduced findings 1–6. Browser timing and physical iPhone behavior remain unverified.

1. **MAJOR — STILL OPEN, legacy variant: “Keep deleted” destroys newer recovery data.**  
   [tombstones.ts:136](/Users/rabah/projects/anygym/src/db/tombstones.ts:136)

   Recover a tokenless legacy deletion in A. Elsewhere, restore, correct and delete that set again. A’s cancellation treats its missing token as a wildcard and deletes the newer tombstone. **Reproduced: the newer recovery record disappeared.**

   **Exact fix:** Require exact token equality during cancellation, including legacy cases. Assign legacy deletions persistent identities before hydrating their managers; require matching restoration identity before deleting an already-restored set.

2. **MAJOR — STILL OPEN, remaining Finish race: another tab’s failed correction is silently discarded.**  
   [workouts.ts:372](/Users/rabah/projects/anygym/src/db/workouts.ts:372), [workouts.ts:435](/Users/rabah/projects/anygym/src/db/workouts.ts:435)

   Finish snapshots fallback storage, then continues asynchronously. Another tab can register a correction after that snapshot when its database connection fails. **Reproduced: Finish saved 10 reps while 19 remained pending; Retry then consumed the correction without applying it.**

   **Exact fix:** Serialize mutation registration, fallback handoff and Finish under one shared per-session lock across tabs. Hold unresolved operations against completion until saved or explicitly discarded; read both journal and fallback while holding that lock.

3. **MAJOR — STILL OPEN, reverse timestamp variant: Retry overwrites a newer successful save.**  
   [mutations.ts:150](/Users/rabah/projects/anygym/src/db/mutations.ts:150)

   An older failed correction and a newer successful correction from separate tabs can have identical timestamps. If fallback cleanup fails, the strict `<` supersession check retains the old correction. **Reproduced: successfully saved 19 reps became 17 after Retry.**

   **Exact fix:** Give operations unique identities and consistently ordered metadata across tabs. Commit explicit applied/superseded operation identities with each save; timestamp equality must not determine which correction survives.

4. **MAJOR — STILL OPEN, storage-failure variant: another tab overwrites pending inputs despite working IndexedDB.**  
   [drafts.ts:169](/Users/rabah/projects/anygym/src/lib/drafts.ts:169), [drafts.ts:210](/Users/rabah/projects/anygym/src/lib/drafts.ts:210)

   When localStorage refuses writes, hydrated tabs skip merging and mirror their entire cached draft collection to IndexedDB. Editing different rows therefore loses another tab’s input. **Reproduced: A displayed 17 reps, but B’s unrelated edit replaced the durable value with 7.**

   **Exact fix:** Persist changed rows individually by stable draft ID, merging them inside an IndexedDB read/write transaction with transactionally allocated revisions. Never replace the complete durable collection from a tab’s cached snapshot.

5. **MAJOR — NEW: Undo recovery restores a set into an exercise missing from the workout.**  
   [workouts.ts:224](/Users/rabah/projects/anygym/src/db/workouts.ts:224), [workouts.ts:326](/Users/rabah/projects/anygym/src/db/workouts.ts:326)

   Delete the exercise’s only set, request Undo, and let restoration fail temporarily. Remove the exercise while its saved-set count is zero. Recovery later restores the accepted Undo, but never restores the exercise to `session.exerciseIds`. **Reproduced: the set existed while the workout’s exercise list was empty**, making it inaccessible for correction.

   **Exact fix:** Include tombstones and journal entries in `removeExercise()`’s transaction and refuse removal while that exercise has unresolved deletions or writes.

6. **MAJOR — NEW: the muscle browser displays demos rejected by the photo audit.**  
   [exerciseInfo.ts:27](/Users/rabah/projects/anygym/src/data/exerciseInfo.ts:27)

   `infoForCatalog()` unconditionally declares every catalog demo exact, and the public muscle browser uses it. **Reproduced: Plank is listed under Abs with photos**, although audit 2.5 rejected its kneeling first frame and the plan correctly suppresses it. I inspected that image.

   **Exact fix:** Store catalog-level demo eligibility independently of plan mappings. Enforce it for public catalog sheets and thumbnails; retain an explicit owner-review path for inspecting rejected assets.

7. **MAJOR — NEW: a transient Review read failure can erase previous decisions.**  
   [ReviewScreen.tsx:55](/Users/rabah/projects/anygym/src/screens/review/ReviewScreen.tsx:55), [ReviewScreen.tsx:64](/Users/rabah/projects/anygym/src/screens/review/ReviewScreen.tsx:64)

   The initial read failure is swallowed and editing becomes enabled with an empty review state. The next verdict writes that whole state over the stored decisions. This is source-confirmed; UI fault injection was not run.

   **Exact fix:** Keep verdict controls disabled until loading succeeds and show a retryable error. Save each decision by transactionally reading and merging the stored review state.

8. **MINOR — STILL OPEN, partial accessibility fix: some muscle selections remain unavailable without tapping SVG paths.**  
   [MuscleMap.tsx:169](/Users/rabah/projects/anygym/src/components/muscles/MuscleMap.tsx:169), [MuscleMap.tsx:266](/Users/rabah/projects/anygym/src/components/muscles/MuscleMap.tsx:266)

   The workout’s new native selector exposes only highlighted muscles, although touch users can select every drawn muscle. The Review map still has no keyboard-accessible selection control. This leaves unequal access to the exercise browser under §13.3; physical VoiceOver behavior was not tested.

   **Exact fix:** Share a labelled native selector across both map variants, listing every selectable drawn region and invoking the same selection handler as direct taps.