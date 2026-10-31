**12 MAJOR findings, all STILL OPEN from earlier reports.** Reviewed completed `[x]` features only; fixed findings excluded. No files edited. Typecheck passed. Controlled in-memory probes reproduced the failures below; browser race timing and physical iPhone behavior were not tested.

1. **MAJOR — STILL OPEN: Stale “Keep deleted” destroys newer recovery data.**  
   [tombstones.ts:122](/Users/rabah/projects/anygym/src/db/tombstones.ts:122)

   Restore, correct, and delete a set elsewhere while an older Undo remains unresolved. Cancelling the older Undo unconditionally removes the newer tombstone. It can also delete a newer restored set. **Reproduced: the corrected set’s recovery record disappeared.**

   **Exact fix:** Pass the expected deletion token into `cancelUndo()` and compare it inside the transaction. Retain restoration-generation metadata so cancellation can remove only the matching restored copy.

2. **MAJOR — STILL OPEN: Finish can permanently discard another tab’s failed Undo.**  
   [workouts.ts:380](/Users/rabah/projects/anygym/src/db/workouts.ts:380), [sessionRecovery.ts:136](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:136)

   After A completes recovery, B deletes a set and Undo fails to persist anywhere. A trusts its cached recovery and clears B’s unaccepted tombstone during Finish. **Reproduced: the last-set case removed both the workout and recovery record.**

   **Exact fix:** Pass explicitly authorized deletion tokens into Finish. Inside its transaction, refuse unknown, unfinalized tombstones until Restore or Keep deleted resolves them.

3. **MAJOR — STILL OPEN: Retry overwrites a successful correction with obsolete values.**  
   [mutations.ts:84](/Users/rabah/projects/anygym/src/db/mutations.ts:84), [mutations.ts:203](/Users/rabah/projects/anygym/src/db/mutations.ts:203)

   An older edit survives in localStorage fallback. A newer edit saves, but fallback cleanup fails. Retry subsequently applies the obsolete correction. **Reproduced: successfully saved 19 reps reverted to 17.**

   **Exact fix:** Commit applied/superseded operation markers with successful mutations. Filter fallback entries against those markers before displaying or replaying them; successful cleanup must not be required for correctness.

4. **MAJOR — STILL OPEN: Save → dismiss → reopen → Delete → Undo loses the correction.**  
   [mutations.ts:134](/Users/rabah/projects/anygym/src/db/mutations.ts:134), [workouts.ts:264](/Users/rabah/projects/anygym/src/db/workouts.ts:264)

   Delete can run after an edit is journaled but before application. Application finds no set, consumes the journal, and reports success. Undo restores the old deletion snapshot. **Reproduced: saving 17 over 10 resolved successfully, but Undo returned 10 with nothing pending.**

   **Exact fix:** Include the journal in Delete’s transaction and refuse deletion while that set has unresolved mutations. Application encountering a tombstoned set must retain the correction and return a retryable conflict.

5. **MAJOR — STILL OPEN: Another tab silently overwrites pending rows.**  
   [drafts.ts:124](/Users/rabah/projects/anygym/src/lib/drafts.ts:124), [drafts.ts:166](/Users/rabah/projects/anygym/src/lib/drafts.ts:166)

   Each tab caches the complete workout draft collection. Editing a different row writes that stale collection over another tab’s newer input. **Reproduced: A displayed 17 reps while a fresh reader recovered 7.** This breaks §13.3’s exact recovery requirement.

   **Exact fix:** Persist drafts by stable row ID and revision in IndexedDB. Transactionally merge only changed rows and subscribe tabs to committed changes; remove whole-collection replacement from cached snapshots.

6. **MAJOR — STILL OPEN: Backup omits corrections retained in fallback storage.**  
   [db/backup.ts:38](/Users/rabah/projects/anygym/src/db/backup.ts:38), [mutations.ts:182](/Users/rabah/projects/anygym/src/db/mutations.ts:182)

   Export includes the database journal but excludes mutation intents retained in memory/localStorage after journaling fails. **Reproduced: a pending 19-rep correction existed, but backup contained the original 10 reps and no correction.**

   **Exact fix:** Include fallback mutation intents in the validated backup format, preserving operation identity, ordering, and complete replacement values. Restore them before enabling Retry or Finish.

7. **MAJOR — STILL OPEN: Equal timestamps make Retry discard the newer correction.**  
   [mutations.ts:104](/Users/rabah/projects/anygym/src/db/mutations.ts:104), [mutations.ts:206](/Users/rabah/projects/anygym/src/db/mutations.ts:206)

   An older journaled edit and newer fallback edit can share a timestamp. The fallback’s `rev: -1` sorts first, causing Retry to select the older edit and clear the newer one. **Reproduced: requested 19 became 17; Retry returned success with nothing pending.**

   **Exact fix:** Assign consistently comparable operation-order metadata before attempting persistence. Preserve it across journal and fallback stores, and use it for both newest-operation selection and supersession cleanup.

8. **MAJOR — STILL OPEN: Recovered Undo reverses a newer intentional deletion.**  
   [sessionRecovery.ts:102](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:102), [sessionRecovery.ts:65](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:65)

   Recovery hydrates the set without its deletion token. After another tab restores, edits, and deletes it again, the older manager passes `undefined`, accepting the current deletion. **Reproduced: the newer deleted 17-rep set returned.**

   **Exact fix:** Attach an immutable deletion token to every hydrated manager record. Carry it through restoration, cancellation, and expiry; require exact matching, including an explicit legacy-token representation.

9. **MAJOR — STILL OPEN: An obsolete fallback Undo restores a later intentional deletion during Finish.**  
   [undoIntents.ts:18](/Users/rabah/projects/anygym/src/db/undoIntents.ts:18), [workouts.ts:381](/Users/rabah/projects/anygym/src/db/workouts.ts:381)

   Undo falls back to localStorage. Restoration succeeds, but removing the fallback fails. After correcting and deleting the set again, Finish mistakes the old intent for Undo of the new deletion. **Reproduced: Finish saved the intentionally deleted 17-rep set.**

   **Exact fix:** Store the deletion token in both intent stores. Recovery and Finish must match it against the current tombstone, and cleanup must consume only the matching intent.

10. **MAJOR — STILL OPEN: Suggested loads bypass the selected bar’s sleeve capacity.**  
    [load.ts:643](/Users/rabah/projects/anygym/src/lib/load.ts:643), [exerciseLoad.ts:134](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:134)

    Manual additions check capacity, but progression solving and confirmation omit the selected sleeve length. **Reproduced: a women’s bar accepted 315 kg—six 25 kg plates per side, requiring 384 mm on a 320 mm sleeve.** The impossible setup remains confirmable, violating §0.

    **Exact fix:** Add sleeve length to `LoadSetup`, propagate it through every solver call, and validate capacity during prefill, confirmation, and bar changes.

11. **MAJOR — STILL OPEN: Restore accepts state that can crash or freeze the app.**  
    [lib/backup.ts:204](/Users/rabah/projects/anygym/src/lib/backup.ts:204), [lib/backup.ts:336](/Users/rabah/projects/anygym/src/lib/backup.ts:336)

    Parsing accepts `nextDayIndex: -1` and one billion added sets. The negative index reaches [DayCard.tsx:32](/Users/rabah/projects/anygym/src/screens/today/DayCard.tsx:32), dereferencing an absent day; the added count drives enormous row construction. **Parser acceptance reproduced; the billion-row loop was not executed.**

    **Exact fix:** Validate integer plan positions against the referenced plan. Bound added-set counts and draft-slot indexes before restoration, with defensive bounds in consumers.

12. **MAJOR — STILL OPEN: A transient startup failure prevents further workout starts until reload.**  
    [bootstrap.ts:35](/Users/rabah/projects/anygym/src/db/bootstrap.ts:35)

    `startDb()` permanently caches its rejected promise. Even after storage recovers, Quick workout and plan Start continue receiving the original error. **Reproduced: direct initialization succeeded afterward while `startDb()` still rejected.**

    **Exact fix:** Clear the cached promise when that initialization attempt rejects. Provide Retry that reruns initialization and reinstalls the active-gym subscription.