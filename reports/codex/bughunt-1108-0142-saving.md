**8 confirmed MAJOR findings and 1 possible concurrency bug.** Reviewed completed `[x]` work against SPEC.md and earlier reports. Fixed cases excluded. No files edited.

1. **MAJOR — STILL OPEN, journal-failure variant: Finish permanently discards another tab’s failed Log.**  
   [rowLog.ts:302](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:302), [workouts.ts:523](/Users/rabah/projects/anygym/src/db/workouts.ts:523)  
   Tab B’s journal write fails, but its submitted **19-rep** row survives in IndexedDB’s draft mirror. Tab A checks its cached drafts, finds no failure, finishes and clears that durable copy. **Reproduced with two module runtimes.** The same stale snapshot path made Finish → Undo replace a newer 19-rep draft with 10 reps.  
   **Exact fix:** Coordinate Log registration and Finish through the session lock. Inside Finish’s transaction, inspect authoritative durable drafts for unresolved submissions and build its Undo snapshot from the merged committed state.

2. **MAJOR — NEW: A failed draft mirror causes newer input to be overwritten on restart.**  
   [drafts.ts:362](/Users/rabah/projects/anygym/src/lib/drafts.ts:362), [drafts.ts:203](/Users/rabah/projects/anygym/src/lib/drafts.ts:203)  
   A successful localStorage write clears `dirty` before IndexedDB commits. If that commit fails, a later Log’s durable merge preserves the old database value and gives it a newer timestamp. Startup then overwrites even the correct localStorage copy. **Reproduced: 19 reps became 10.**  
   **Exact fix:** For phone storage, remove the immediate `m.dirty.clear()`. Acknowledge each unchanged submitted value only after its IndexedDB transaction commits, using the existing identity check in `persistRows()`.

3. **MAJOR — STILL OPEN, lower-revision variant: Duplicate Log erases conflicting input.**  
   [setTable.ts:175](/Users/rabah/projects/anygym/src/lib/setTable.ts:175)  
   Fingerprints protect conflicting values only when revisions match. Separate tabs allocate revisions independently: a newer input can have a lower number. **Reproduced:** saved 53 lb × 10 at revision 5; submitting 73 lb × 19 at revision 1 returned success and removed the pending input without saving it.  
   **Exact fix:** Do not consume differing fingerprints based on tab-local revision ordering. Persist globally unique operation identities and coordinated revisions; retain unmatched payloads as unresolved conflicts.

4. **MAJOR — STILL OPEN, toast-retry variant: “Finish without it” discards values never shown.**  
   [ExerciseView.tsx:311](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:311), [rowLog.ts:363](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:363)  
   The toast’s Retry retains the original operation ID. Two tabs correcting that failed draft can therefore submit different values with identical ID, revision and operation. **Reproduced:** the sheet represented 17 reps; another retry journaled 19; discarding the sheet deleted 19 and allowed Finish.  
   **Exact fix:** Generate `op: newId()` in this retry path, as `retryFailed()` already does. Also snapshot and transactionally compare the submitted payload fingerprint before discarding.

5. **MAJOR — STILL OPEN: Switching gyms moves a deleted machine set’s history.**  
   [gymSwitch.ts:152](/Users/rabah/projects/anygym/src/db/gymSwitch.ts:152)  
   Switching stamps only sets currently in `db.sets`. A temporarily deleted set remains unstamped inside its tombstone. Undo after switching restores it under the destination session gym. **Reproduced:** a machine set performed at A appeared only in B’s history after Undo → Finish.  
   **Exact fix:** Include tombstones in the switch transaction and stamp their contained sets with the original gym. Extend the switch receipt and its Undo to preserve those stamps correctly.

6. **MAJOR — STILL OPEN: Equipment changes lose or reclassify legacy Smith history.**  
   [history.ts:85](/Users/rabah/projects/anygym/src/db/history.ts:85), [equipment.ts:75](/Users/rabah/projects/anygym/src/db/equipment.ts:75)  
   Legacy preservation skips deleted sets and sets whose session moved away from their recorded gym. **Reproduced:** changing units while a Smith set was deleted removed it from comparable history after Undo; changing the Smith answer reclassified it as free-bar history. The moved-session case also lost its history.  
   **Exact fix:** Preserve legacy identities across both live sets and tombstone snapshots, selecting by `set.gymId ?? session.gymId`. Include tombstones in every equipment-change transaction that performs preservation.

7. **MAJOR — NEW: A Log tapped before a gym switch saves against the destination gym.**  
   [ExerciseView.tsx:300](/Users/rabah/projects/anygym/src/screens/workout/ExerciseView.tsx:300), [workouts.ts:212](/Users/rabah/projects/anygym/src/db/workouts.ts:212)  
   Logging waits until after paint before journaling. Another tab can switch gyms during that gap; the switch sees no journal. The eventual set carries no originating gym, so machine history attributes the completed lift to the destination. **Production-helper interleaving reproduced; browser timing unverified.**  
   **Exact fix:** Capture the gym ID when Log is tapped. Carry it unchanged through the draft, journal, `NewSet` and saved set; validate submission admission under the session lock.

8. **MAJOR — STILL OPEN, export-boundary variant: Backup omits a newly retained correction.**  
   [backup.ts:79](/Users/rabah/projects/anygym/src/db/backup.ts:79), [backup.ts:81](/Users/rabah/projects/anygym/src/db/backup.ts:81)  
   Held corrections are captured before the database snapshot. A correction whose journal subsequently fails can become durable in `kv` without entering the backup. **Reproduced:** the file included a later logged set, but omitted the preceding pending 19-rep correction; restore retained 10 with nothing retryable.  
   **Exact fix:** Capture durable held entries inside the table snapshot transaction. Coordinate memory/fallback capture with mutation registration under the session lock, then filter everything against that snapshot’s suppression receipts.

9. **MAJOR — POSSIBLE BUG: Stale “Keep deleted” removes a newer successful correction.**  
   [tombstones.ts:143](/Users/rabah/projects/anygym/src/db/tombstones.ts:143), [workouts.ts:248](/Users/rabah/projects/anygym/src/db/workouts.ts:248)  
   Restore a deletion elsewhere, successfully correct it to 19 reps, then invoke the older cancellation. The restoration token survives editing, so cancellation deletes the corrected set without a tombstone. **Reproduced: neither set nor recovery copy remained.** Whether this is intended depends on the unspecified concurrent-edit policy.  
   **Exact fix if newer corrections must be protected:** Invalidate restoration provenance transactionally on committed edits/type changes, and reject cancellation when the set changed or has pending corrections.

Typecheck passed. Control probes passed for Log deduplication, transaction rollback, failed-edit retry, accepted-Undo recovery after reopening, Finish rollback, Finish → Undo, and update deferral during active workouts or unreadable activity. Physical iOS termination and live service-worker activation were not tested.