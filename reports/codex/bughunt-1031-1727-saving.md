**8 MAJOR findings in built features. No files edited.** Typecheck passed. Reproductions used the actual modules with in-memory IndexedDB and controlled failures; browser timing, physical iOS termination, and real service-worker activation remain unverified. Fixed earlier findings are excluded.

1. **MAJOR — STILL OPEN: Stale “Keep deleted” destroys a newer deletion.**  
   [tombstones.ts:122](/Users/rabah/projects/anygym/src/db/tombstones.ts:122), [sessionRecovery.ts:77](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:77)

   Leave an Undo unresolved in one tab. Elsewhere, restore, edit, and delete that set again. The older cancellation unconditionally deletes the newer tombstone; it can also delete a newer restored set. **Reproduced: the newer recovery record disappeared.**

   **Exact fix:** Pass the expected deletion token into cancellation and verify it transactionally before changing anything. Retain restoration-generation evidence so cancellation can delete only the matching restored copy.

2. **MAJOR — STILL OPEN, cross-tab variant: Finish can permanently discard a failed Undo.**  
   [workouts.ts:380](/Users/rabah/projects/anygym/src/db/workouts.ts:380), [sessionRecovery.ts:136](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:136)

   Tab A completes recovery. Tab B subsequently deletes a set and requests Undo, but acceptance and both intent stores fail. A’s cached recovery and local manager know nothing about that unresolved Undo. Finish deletes its unaccepted tombstone. **Reproduced: finishing the last-set case removed the session, set, and recovery copy.**

   **Exact fix:** Pass explicitly resolved or locally owned deletion tokens into Finish. Inside its transaction, reject unknown unfinalized tombstones until Restore/Keep deleted resolves them. A cached recovery promise must not authorize their removal.

3. **MAJOR — Another tab overwrites newer pending-set edits.**  
   [drafts.ts:124](/Users/rabah/projects/anygym/src/lib/drafts.ts:124), [drafts.ts:166](/Users/rabah/projects/anygym/src/lib/drafts.ts:166)

   Each tab caches the entire workout’s drafts indefinitely, then writes that whole snapshot. Editing another row in tab B overwrites tab A’s newer values. A still displays its memory copy, hiding the loss until restart. **Reproduced: A displayed 17 reps, while a fresh reader recovered 7.** Logging from B can also persist its stale snapshot into IndexedDB.

   **Exact fix:** Store drafts by stable row ID in IndexedDB. Transactionally merge only changed rows using revisions, and subscribe both tabs to committed changes. Do not replace the complete draft collection from a tab’s cached snapshot.

4. **MAJOR — A stale edit fallback overwrites a newer successful save.**  
   [mutations.ts:84](/Users/rabah/projects/anygym/src/db/mutations.ts:84), [mutations.ts:194](/Users/rabah/projects/anygym/src/db/mutations.ts:194)

   A failed 17-rep edit reaches the localStorage fallback. A newer 19-rep edit saves successfully, but removing the fallback fails. `pendingMutations()` still presents 17 as pending; Try again writes it over 19. **Reproduced: saved reps changed from 19 back to 17.** Restart preserves the stale fallback too.

   **Exact fix:** Persist an applied-operation/supersession marker in the successful mutation’s transaction. Filter fallback entries against that marker before presenting or replaying them; correctness must not depend on deleting localStorage successfully.

5. **MAJOR — Equal timestamps make Retry discard the newer correction.**  
   [mutations.ts:104](/Users/rabah/projects/anygym/src/db/mutations.ts:104), [mutations.ts:206](/Users/rabah/projects/anygym/src/db/mutations.ts:206)

   An older journaled edit and a newer edit whose journal write failed can share `at`. Sorting puts the newer fallback’s `rev: -1` before the older stored revision. Retry selects the older edit, then its cleanup removes the newer fallback. **Reproduced with identical timestamps: requested 19 became 17, Retry returned true, and no pending correction remained.**

   **Exact fix:** Track operation ordering consistently across journaled and fallback mutations. Select and clear entries by that ordering; never treat `rev: -1` as proof that a fallback operation predates a journaled one.

6. **MAJOR — STILL OPEN, reopened-editor variant: Save → Delete → Undo loses the correction.**  
   [mutations.ts:134](/Users/rabah/projects/anygym/src/db/mutations.ts:134), [EditSetSheet.tsx:35](/Users/rabah/projects/anygym/src/screens/workout/EditSetSheet.tsx:35)

   Start saving 17 over 10 reps, dismiss the saving sheet, reopen the set, and delete it before the edit applies. `apply()` sees no set, deletes the edit journal, and reports success. Undo restores the deletion’s 10-rep snapshot. **Reproduced: Save resolved successfully, but Undo returned 10 with no pending edit.**

   **Exact fix:** Include the journal in Delete’s transaction and refuse deletion while that set has unresolved mutations. If mutation application encounters a tombstoned set, retain its intent and report a retryable conflict instead of consuming it.

7. **MAJOR — STILL OPEN, recovery-token gap: A recovered Undo can reverse a newer deletion.**  
   [sessionRecovery.ts:102](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:102), [sessionRecovery.ts:65](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:65)

   Recovery hydrates the deleted set into the manager but omits its deletion token. Another tab can restore, edit, and delete it again. The older manager’s Restore passes `undefined`, so acceptance targets whichever deletion currently exists. **Reproduced: the newer deleted 17-rep set was resurrected and its tombstone consumed.**

   **Exact fix:** Hydrate an immutable deletion token alongside each manager record and carry it through Restore, cancellation, and expiry. Require exact token equality, including an explicit legacy-token case.

8. **MAJOR — Old fallback Undo intent resurrects a later intentional deletion.**  
   [undoIntents.ts:52](/Users/rabah/projects/anygym/src/db/undoIntents.ts:52), [workouts.ts:381](/Users/rabah/projects/anygym/src/db/workouts.ts:381)

   Undo intent falls back to localStorage. Restoration succeeds, but fallback removal fails. After editing and deleting the set again, the old intent still matches because it contains only session/set IDs. Finish interprets it as Undo of the new deletion. **Reproduced: Finish restored the intentionally deleted 17-rep set.**

   **Exact fix:** Include the deletion token in both intent stores. Acceptance, recovery, expiry, and Finish must validate that token against the current tombstone; cleanup must consume only the matching intent.

Additional probes passed for same-ID Log deduplication, failed-Log retention and retry, commit-before-cleanup reconciliation, Finish rollback, Finish→Undo pending snapshots, and update deferral during active workouts or failed activity reads.