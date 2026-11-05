**7 MAJOR findings** in completed `[x]` features. No files edited. Earlier fixed findings are excluded.

1. **MAJOR — NEW: Finish interrupts exercise removal and prevents rollback.**  
   [WorkoutScreen.tsx:466](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:466), [WorkoutScreen.tsx:498](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:498)  
   Remove an exercise, then tap Finish while its sets are being deleted. Finish closes the manager between deletions; the next deletion fails, and rollback’s `undoAll()` refuses because the manager is closed. **Reproduced:** one set permanently disappeared, removal failed, and Finish deleted its recovery record.  
   **Exact fix:** Delete the exercise and all its sets/tombstones in one transaction. Track the complete removal and rollback as one admitted operation that Finish must await.

2. **MAJOR — STILL OPEN, higher-revision variant: Logging overwrites another tab’s pending set.**  
   [drafts.ts:192](/Users/rabah/projects/anygym/src/lib/drafts.ts:192)  
   The merge still lets a clean cached draft overwrite IndexedDB when its revision is higher—even when the slot now contains a different draft identity. After another tab logs and shifts rows, logging elsewhere can replace the new pending set with the old row. **Reproduced:** pending Y, 73 lb × 19, was replaced by stale X, 53 lb × 7. Restart recovers X.  
   **Exact fix:** Merge only dirty changes and explicit deletions. Clean rows must adopt IndexedDB state; compare revisions only within the same draft identity.

3. **MAJOR — STILL OPEN, app-update compatibility: Legacy receipts acknowledge values never saved.**  
   [rowLog.ts:225](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:225), [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Receipts created before 2.0l lack fingerprints. The current code treats a matching revision as sufficient evidence of success. **Reproduced:** 10 reps remained saved, submitting 19 returned success, fired the landed callback, and cleared the 19-rep draft. Installed users retain these older receipts after updating.  
   **Exact fix:** Compare available saved payload evidence for legacy receipts. If the payload cannot be established, preserve the conflicting input and leave reconciliation unresolved; never acknowledge it from revision alone.

4. **MAJOR — NEW: Finish resets mutation identities, letting stale discard delete a newer correction.**  
   [workouts.ts:496](/Users/rabah/projects/anygym/src/db/workouts.ts:496), [mutations.ts:293](/Users/rabah/projects/anygym/src/db/mutations.ts:293)  
   Finish deletes revision counters. After Finish → Undo, a new correction can reuse an old operation ID. A suspended tab’s earlier unsaved sheet can then discard the newer correction using its stale ID. **Reproduced:** both corrections received `mut:edit:a:1`; discarding the old identity removed the new 19-rep correction, leaving 10 saved.  
   **Exact fix:** Retain mutation counters throughout the session’s lifetime, including Finish → Undo, or use persistent UUID operation IDs. Discard must identify the exact operation shown.

5. **MAJOR — STILL OPEN under write failure: Discarded corrections return after Finish → Undo.**  
   [mutations.ts:448](/Users/rabah/projects/anygym/src/db/mutations.ts:448)  
   For held corrections, discard swallows a failed suppression-receipt transaction and still removes its local recovery copies. Another tab retains an unsuppressed memory copy. **Reproduced:** discard appeared successful, Finish saved 10 reps, and after reopening, the other tab’s Retry changed the set to the discarded 19 reps.  
   **Exact fix:** Require the discard receipt to commit before removing any copy or continuing Finish. On failure, retain the correction and report a retryable discard failure.

6. **MAJOR — NEW: Discarded failed Logs can return through a stale recovered tab.**  
   [rowLog.ts:329](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:329), [rowLog.ts:339](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:339)  
   Failed-Log discard deletes the journal but records cancellation only in runtime memory and draft cleanup. A tab hydrated while localStorage is unavailable can retain the submitted draft. **Reproduced with shared backing storage:** A discarded the Log and finished; after Finish → Undo, B still reported it as failed, and Retry saved the discarded set.  
   **Exact fix:** Commit a durable cancellation receipt with journal deletion. Recovery, failed-row detection, and submission must honor it across tabs and restarts. Explicit resubmission should use a fresh submission identity.

7. **MAJOR — NEW: Backup can reactivate a superseded correction.**  
   [backup.ts:46](/Users/rabah/projects/anygym/src/db/backup.ts:46), [backup.ts:48](/Users/rabah/projects/anygym/src/db/backup.ts:48)  
   Export captures held corrections before its table snapshot. A newer successful edit between those reads supersedes the captured correction, but its suppression receipt does not travel with the backup. **Reproduced:** source and backup contained 19 reps alongside an obsolete pending 17-rep correction; restoring and retrying changed 19 back to 17.  
   **Exact fix:** Snapshot tables, durable held changes, and suppression receipts in one IndexedDB read transaction. Filter captured memory/fallback corrections against that same snapshot before exporting.

Typecheck passed. Production-module probes confirmed these data failures and passed rollback/restart controls for Log, Edit, Delete, accepted Undo, and Finish. Update deferral passed for active workouts and failed activity reads. Browser race timing, physical iOS termination, and live service-worker activation remain unverified.