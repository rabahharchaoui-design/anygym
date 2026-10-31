**9 MAJOR findings in completed `[x]` features. No files edited.** Earlier fixed cases are excluded; remaining variants are marked **STILL OPEN**.

1. **MAJOR — STILL OPEN: Finish can destroy an unknown legacy deletion’s recovery copy.**  
   [workouts.ts:415](/Users/rabah/projects/anygym/src/db/workouts.ts:415)

   After this tab completes recovery, an older open tab can leave a tokenless deletion whose Undo failed. `owned.get(id)` and `t.token` are both `undefined`, so Finish treats the unknown deletion as owned and deletes its tombstone. **Reproduced: both set and recovery copy were absent afterward.**

   **Exact fix:** Require `owned.has(t.id)` before comparing tokens. Give legacy deletions explicit identities during migration/recovery; missing ownership must always block Finish.

2. **MAJOR — STILL OPEN, cross-tab fallback variant: Finish silently discards a failed correction.**  
   [WorkoutScreen.tsx:452](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:452), [workouts.ts:406](/Users/rabah/projects/anygym/src/db/workouts.ts:406)

   A checks pending changes; B then fails to journal a 19-rep correction and stores it in fallback. Finish rechecks only IndexedDB journals and saves the original 10 reps. Retry afterward discards the correction because the workout ended. **This sequence reproduced successfully.**

   **Exact fix:** Serialize Finish and mutation registration—including failed-journal fallback handoff—across tabs. Recheck fallback intents inside that critical section before committing Finish; unresolved corrections must refuse completion.

3. **MAJOR — STILL OPEN, Finish → Undo variant: An obsolete correction overwrites a successful save.**  
   [workouts.ts:431](/Users/rabah/projects/anygym/src/db/workouts.ts:431), [mutations.ts:133](/Users/rabah/projects/anygym/src/db/mutations.ts:133)

   A failed 17-rep edit remains in fallback when cleanup fails. A newer 19-rep save correctly supersedes it. Finish deletes that supersession marker; Undo reopens the workout and exposes 17 as pending again. **Reproduced: Retry changed saved 19 back to 17.**

   **Exact fix:** Retain applied/superseded-operation markers across Finish and reopening, for the session’s lifetime. Delete them only when the session itself is permanently removed.

4. **MAJOR — STILL OPEN, cross-tab timestamp variant: A newer failed edit disappears from recovery.**  
   [mutations.ts:56](/Users/rabah/projects/anygym/src/db/mutations.ts:56), [mutations.ts:133](/Users/rabah/projects/anygym/src/db/mutations.ts:133)

   `nextAt()` is monotonic only within one database object. Two tabs can assign the same timestamp. When A saves 17 reps and B’s newer 19-rep edit falls back with that timestamp, B’s correction is filtered out as already superseded. **Reproduced: fallback contained 19, but pending changes returned zero.**

   **Exact fix:** Use a persisted operation sequence coordinated across tabs for journal, fallback and applied markers. Suppress only operations explicitly identified as applied or superseded; timestamp equality cannot establish that.

5. **MAJOR — STILL OPEN, equal-revision variant: Editing another row overwrites newer pending reps.**  
   [drafts.ts:180](/Users/rabah/projects/anygym/src/lib/drafts.ts:180), [drafts.ts:203](/Users/rabah/projects/anygym/src/lib/drafts.ts:203)

   A and B edit the same cached draft, independently producing revision 2: A writes 17, then B writes 19. A ignores B’s value because ID and revision match. A subsequently edits another row and serializes its stale 17 over 19. **Reproduced in shared storage.** Restart then recovers the wrong pending set.

   **Exact fix:** Persist changes by stable draft ID with transactionally allocated revisions. Merge only changed rows. For a clean cached row, adopt the authoritative stored value even when its local revision matches.

6. **MAJOR — STILL OPEN, legacy-intent variant: An old Undo resurrects a later intentional deletion.**  
   [undoIntents.ts:24](/Users/rabah/projects/anygym/src/db/undoIntents.ts:24)

   Missing tokens remain wildcards. A tokenless intent left by an older app version therefore matches a newly tokenized deletion after the set was restored, corrected and deleted again. **Reproduced: Finish restored the intentionally deleted 17-rep set.**

   **Exact fix:** Require exact deletion identity everywhere. Migrate tokenless intents only alongside their corresponding tokenless tombstones; an unmatched legacy intent must never authorize a newer deletion.

7. **MAJOR — A stale Delete creates Undo for another tab’s deletion.**  
   [sessionRecovery.ts:62](/Users/rabah/projects/anygym/src/screens/workout/sessionRecovery.ts:62), [deleteUndo.ts:115](/Users/rabah/projects/anygym/src/lib/deleteUndo.ts:115)

   Keep an editor open while another tab deletes that set. Delete from the stale editor returns no deleted record, but its manager retains an Undo record without a token. Undo then accepts whichever tombstone exists. **Reproduced: the other tab’s corrected 17-rep deletion was reversed.**

   **Exact fix:** Treat “nothing deleted” as an explicit no-op: remove the provisional manager record and withdraw its Undo action. Require an owned deletion token before any restoration attempt.

8. **MAJOR — Backup bypasses the deletion-token fix and resurrects an unwanted set.**  
   [backup.ts:44](/Users/rabah/projects/anygym/src/db/backup.ts:44)

   Export matches Undo intents by set ID alone. An obsolete token-bearing intent correctly rejected by ordinary recovery still causes export to mark the newer tombstone `undo: true`. **Reproduced: restoring that backup resurrected the intentionally deleted 17-rep set.**

   **Exact fix:** Match each exported tombstone against its exact intent token using `hasUndoIntent(..., t.token)`. Read database tombstones and intents in one consistent transaction; preserve deletion identities in the exported snapshot.

9. **MAJOR — STILL OPEN: Backup omits corrections retained in fallback.**  
   [backup.ts:38](/Users/rabah/projects/anygym/src/db/backup.ts:38), [mutations.ts:226](/Users/rabah/projects/anygym/src/db/mutations.ts:226)

   A failed journal write leaves the correction in memory/localStorage, while export includes only database journals. **Reproduced: the source retained a pending 19-rep correction; restoring its backup produced 10 reps with no pending correction.**

   **Exact fix:** Export validated fallback mutation intents alongside journal entries, preserving operation identity, ordering and complete replacement values. Restore those intents durably before enabling workout actions.

Typecheck passed. Control probes passed for Log deduplication/retry, commit-before-cleanup reconciliation, delete rollback, accepted-Undo recovery after reopening, Finish rollback, and update deferral during active workouts or failed activity reads. Findings were reproduced with in-memory IndexedDB and controlled failures; actual browser race timing, physical iOS termination and service-worker activation remain unverified.