**10 findings in completed features. No files edited.** Earlier fixed findings are excluded. Typecheck, 2,640 weight-sum cases and 18 solver round trips passed. Findings below were reproduced with in-memory database/helper probes; full browser races and physical iPhone behavior remain unverified.

1. **MAJOR — STILL OPEN: Stale “Keep deleted” can destroy a newer lift.**  
   [tombstones.ts:122](/Users/rabah/projects/anygym/src/db/tombstones.ts:122), [sessionRecovery.ts:77](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:77)

   Leave an unresolved Undo in one tab. Elsewhere, restore, correct and delete the set again. The old cancellation removes the newer deletion’s recovery record. It can also delete a newer restored set. **The newer recovery record’s loss was reproduced.**

   **Exact fix:** Pass the expected deletion token into `cancelUndo()` and verify it inside the transaction. Retain restoration-generation evidence so cancellation can remove only the matching restored copy.

2. **MAJOR — STILL OPEN: Finish can permanently discard another tab’s failed Undo.**  
   [workouts.ts:380](/Users/rabah/projects/anygym/src/db/workouts.ts:380), [sessionRecovery.ts:136](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:136)

   After tab A completes recovery, tab B deletes a set and requests Undo, but acceptance and intent persistence fail. A trusts its cached recovery and deletes the remaining tombstone during Finish. **The last-set case removed the session, set and recovery copy.**

   **Exact fix:** Pass locally owned or explicitly resolved deletion tokens into Finish. Inside its transaction, reject unknown, unfinalized tombstones until Restore/Keep deleted resolves them.

3. **MAJOR — STILL OPEN: Retry can overwrite a successfully saved weight with an obsolete correction.**  
   [mutations.ts:84](/Users/rabah/projects/anygym/src/db/mutations.ts:84), [mutations.ts:194](/Users/rabah/projects/anygym/src/db/mutations.ts:194)

   An older correction reaches the localStorage fallback. A newer correction saves successfully, but fallback cleanup fails. Retry subsequently replays the obsolete values. **Reproduced: saved 155 lb × 19 became 135 lb × 17.**

   **Exact fix:** Commit an applied/superseded operation marker with each successful mutation. Filter fallback entries against that marker before displaying or replaying them; successful cleanup must not be required for correctness.

4. **MAJOR — STILL OPEN: Equal timestamps make Retry discard the newer weight correction.**  
   [mutations.ts:104](/Users/rabah/projects/anygym/src/db/mutations.ts:104), [mutations.ts:206](/Users/rabah/projects/anygym/src/db/mutations.ts:206)

   An older journaled correction and a newer fallback correction can share `at`. Sorting places the fallback’s `rev: -1` first, so Retry chooses the older operation and clears the newer one. **Reproduced: requested 155 lb × 19 became 135 lb × 17; Retry returned success with nothing pending.**

   **Exact fix:** Give every operation a consistent ordering identity before persistence, shared across journal and fallback stores. Select and clear operations using that ordering rather than treating `rev: -1` as older.

5. **MAJOR — STILL OPEN: Save → dismiss → reopen → Delete → Undo loses the saved correction.**  
   [mutations.ts:134](/Users/rabah/projects/anygym/src/db/mutations.ts:134), [workouts.ts:264](/Users/rabah/projects/anygym/src/db/workouts.ts:264)

   Delete can run after an edit is journaled but before it applies. `apply()` finds the set absent, consumes the correction and resolves successfully. Undo restores the old deletion snapshot. **Reproduced: saving 155 lb × 17 resolved successfully, but Undo restored 135 lb × 10 with no pending correction.**

   **Exact fix:** Include the journal in Delete’s transaction and reject deletion while that set has unresolved mutations. If application encounters a tombstoned set, preserve the mutation and report a retryable conflict.

6. **MAJOR — STILL OPEN: Another tab silently overwrites pending weights.**  
   [drafts.ts:124](/Users/rabah/projects/anygym/src/lib/drafts.ts:124), [drafts.ts:166](/Users/rabah/projects/anygym/src/lib/drafts.ts:166)

   Each tab caches the workout’s entire draft collection. Editing another row writes that stale collection over newer changes elsewhere. **Reproduced: tab A still held 63 lb × 17, while a fresh reader recovered 53 lb × 7.** Restart or backup can therefore preserve the wrong pending lift.

   **Exact fix:** Persist drafts by stable row ID and revision. Transactionally merge only changed rows and subscribe open tabs to committed changes instead of replacing the complete cached collection.

7. **MAJOR — NEW: Backup omits weight corrections retained in the mutation fallback.**  
   [backup.ts:38](/Users/rabah/projects/anygym/src/db/backup.ts:38), [mutations.ts:182](/Users/rabah/projects/anygym/src/db/mutations.ts:182)

   When journaling fails, the correction survives in memory/localStorage, but export includes only the database journal. **Reproduced: the source retained a pending 155 lb × 19 correction; restoring its backup produced 135 lb × 10 with no pending correction.** The previously fixed journal-only submission omission is a different path.

   **Exact fix:** Include fallback mutation intents in the backup contract, preserving operation identity, ordering, units and complete replacement values. Restore those intents before enabling Finish or Retry.

8. **MAJOR — STILL OPEN: Recovered Undo can reverse a newer intentional deletion.**  
   [sessionRecovery.ts:102](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:102), [sessionRecovery.ts:65](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:65)

   Recovery hydrates the deleted set without its deletion token. After another tab restores, edits and deletes it again, the old manager passes `undefined`, accepting whichever deletion exists now. **Reproduced: the newer, intentionally deleted 155 lb × 17 set returned.**

   **Exact fix:** Hydrate an immutable deletion token alongside every manager record. Require exact token matching for restoration, cancellation and expiry, including an explicit representation for legacy tokenless records.

9. **MAJOR — STILL OPEN: An obsolete fallback Undo adds an intentionally deleted lift to the finished workout.**  
   [undoIntents.ts:52](/Users/rabah/projects/anygym/src/db/undoIntents.ts:52), [workouts.ts:381](/Users/rabah/projects/anygym/src/db/workouts.ts:381)

   Undo falls back to localStorage. Restoration succeeds, but removing that fallback fails. After the set is corrected and deleted again, Finish interprets the old intent as requesting restoration of the new deletion. **Reproduced: Finish restored the intentionally deleted 155 lb × 17 set**, inflating saved sets and total lifted.

   **Exact fix:** Store the deletion token in both intent stores. Validate it against the current tombstone during recovery and Finish, and consume only the matching intent.

10. **MAJOR — STILL OPEN: Suggested loads and bar changes accept physically impossible plate stacks.**  
    [load.ts:643](/Users/rabah/projects/anygym/src/lib/load.ts:643), [exerciseLoad.ts:134](/Users/rabah/projects/anygym/src/screens/workout/exerciseLoad.ts:134)

    Manual additions check the selected sleeve, but progression solving and confirmation do not. **Reproduced: a women’s bar accepted 315 kg using six 25 kg plates per side—384 mm of plates on its 320 mm sleeve.** The impossible loading remains confirmable and loggable.

    **Exact fix:** Carry the selected sleeve length through `LoadSetup` into every solver call. Validate sleeve fit during prefill, confirmation and bar changes; reject stacks that exceed the selected bar’s capacity.