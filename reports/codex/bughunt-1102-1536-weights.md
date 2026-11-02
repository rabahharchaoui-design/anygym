**10 findings: one new, nine STILL OPEN.** Reviewed completed `[x]` features only. No files edited; fixed earlier findings are excluded.

1. **MAJOR — STILL OPEN: Legacy “Keep deleted” destroys newer recovery data.**  
   [tombstones.ts:136](/Users/rabah/projects/anygym/src/db/tombstones.ts:136)  
   A recovered tokenless deletion treats its missing token as a wildcard. After another tab restores, corrects and deletes that lift again, the old cancellation deletes the newer recovery copy. **Reproduced.**  
   **Exact fix:** Require exact deletion-token equality, including legacy cases. Assign legacy tombstones persistent identities before recovery; require matching restoration identity before removing a restored set.

2. **MAJOR — STILL OPEN: Failed weight corrections disappear after restart.**  
   [mutations.ts:267](/Users/rabah/projects/anygym/src/db/mutations.ts:267)  
   If journaling fails and localStorage refuses writes, the correction remains only in memory despite working IndexedDB. **Reproduced: a pending 155 lb correction disappeared; a fresh instance finished with 135 lb.**  
   **Exact fix:** Persist `heldRows([held])` into IndexedDB `kv` when journaling fails. Retain it until application or explicit discard, and inspect it during recovery and Finish.

3. **MAJOR — STILL OPEN: Finish can discard another tab’s correction.**  
   [workouts.ts:374](/Users/rabah/projects/anygym/src/db/workouts.ts:374)  
   Finish snapshots localStorage fallback before asynchronous database reads. A correction registered afterward escapes that check. **Reproduced: Finish retained 135 lb while 155 lb remained pending; Retry then removed the correction without applying it.**  
   **Exact fix:** Serialize mutation registration, fallback handoff and Finish under a shared per-session lock across tabs. Check journal and fallback intents while holding it; preserve unresolved corrections.

4. **MAJOR — STILL OPEN: Retry overwrites a newer successful weight correction.**  
   [mutations.ts:150](/Users/rabah/projects/anygym/src/db/mutations.ts:150)  
   Separate tabs can assign identical timestamps. When fallback cleanup fails, an obsolete correction survives the strict timestamp comparison and Retry promotes it into a new operation. **Reproduced: successfully saved 175 lb reverted to 155 lb.**  
   **Exact fix:** Use unique operation identities and ordering coordinated across tabs. Commit explicit supersession evidence with each save, and preserve the original operation’s identity during Retry.

5. **MAJOR — STILL OPEN: Another tab overwrites pending weights during storage failure.**  
   [drafts.ts:169](/Users/rabah/projects/anygym/src/lib/drafts.ts:169)  
   Hydrated tabs skip merging and mirror their entire cached draft collection into IndexedDB. **Reproduced: tab A displayed 73 lb; tab B’s unrelated row edit replaced the durable value with 53 lb.** Restart recovers the wrong weight.  
   **Exact fix:** Persist changed rows individually by stable identity. Merge them inside an IndexedDB transaction with transactionally allocated revisions; stop replacing the whole collection from cached snapshots.

6. **MAJOR — NEW: Changing “Loaded with” invents a selected weight.**  
   [exerciseLoad.ts:135](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:135)  
   Existing drafts survive load-type changes, but the barbell and machine branches do not reject an incompatible stored kind. **Reproduced: a selected single 60 lb weight became a loggable 45 lb bare bar—or a 50 lb machine start—and saved those values without another weight selection.**  
   **Exact fix:** Preserve the draft’s load-kind identity and reject incompatible kinds during rebuilding and confirmation. Require explicit weight reselection after a type change; clear the previous weight’s selection flag.

7. **MAJOR — STILL OPEN: Undo restores a lift into a removed exercise.**  
   [workouts.ts:225](/Users/rabah/projects/anygym/src/db/workouts.ts:225)  
   Delete an exercise’s only set, accept Undo, temporarily fail restoration, then remove the exercise. Recovery restores the set without restoring exercise membership. **Reproduced: one saved set existed with an empty workout exercise list**, hiding the lift from correction.  
   **Exact fix:** Include tombstones and journals in `removeExercise()`’s transaction and refuse removal while unresolved operations exist. Defensively restore exercise membership during accepted-Undo recovery.

8. **MAJOR — STILL OPEN: The muscle browser exposes rejected demos.**  
   [exerciseInfo.ts:27](/Users/rabah/projects/anygym/src/data/exerciseInfo.ts:27)  
   `infoForCatalog()` declares every catalog entry exact. The public muscle browser consequently shows Plank’s kneeling setup photo, although audit 2.5 rejected it and plan screens suppress it. **Image inspected.**  
   **Exact fix:** Store catalog-level demo eligibility and enforce it for public thumbnails and exercise sheets. Keep rejected assets available only through an explicit owner-review path.

9. **MAJOR — STILL OPEN: A Review read failure erases previous decisions.**  
   [ReviewScreen.tsx:55](/Users/rabah/projects/anygym/src/screens/review/ReviewScreen.tsx:55)  
   The initial read failure is swallowed, then controls become available with empty state. The next verdict overwrites previously stored decisions. **Source-confirmed; UI fault injection was not run.**  
   **Exact fix:** Enable verdict controls only after successful loading, expose Retry, and save each decision through a transaction that reads and merges existing decisions.

10. **MINOR — STILL OPEN: Some muscle selections remain inaccessible.**  
    [MuscleMap.tsx:266](/Users/rabah/projects/anygym/src/components/muscles/MuscleMap.tsx:266)  
    The native selector lists only highlighted muscles, while touch users can select every drawn region. The Review map still requires SVG taps. **Source-confirmed; physical VoiceOver behavior was not tested.**  
    **Exact fix:** Provide the same labelled native selector in both map variants, listing every selectable drawn region and invoking the shared selection handler.

Typecheck passed, alongside **5,280 lb/kg sum cases and 24 solver round trips**. Findings 1–7 were reproduced with actual helpers and in-memory IndexedDB. Full browser races and physical iPhone behavior remain unverified.