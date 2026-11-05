**7 MAJOR findings, all STILL OPEN from earlier reports.** Reviewed completed `[x]` features only. No files edited; fixed findings excluded.

1. **MAJOR — STILL OPEN: Finish interrupts exercise removal and permanently loses lifts.**  
   [WorkoutScreen.tsx:468](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:468), [WorkoutScreen.tsx:500](/Users/rabah/projects/anygym/src/screens/workout/WorkoutScreen.tsx:500)  
   Finish can close the delete manager between individual deletions. Removal then fails, but rollback cannot restore through the closed manager. **Reproduced:** one lift disappeared, removal failed, and Finish erased its recovery record.  
   **Exact fix:** Delete exercise membership, sets and tombstones atomically. Track the entire removal and rollback as one operation that Finish must await.

2. **MAJOR — STILL OPEN: Legacy Log receipts acknowledge weights never saved.**  
   [rowLog.ts:225](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:225), [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   Receipts from before fingerprint support accept matching revisions despite different payloads. **Reproduced:** submitting **155 lb** returned success, fired the landed callback and cleared the draft while **135 lb remained saved**. Installed users retain these legacy receipts.  
   **Exact fix:** Verify legacy submissions against trustworthy saved payload evidence. When that evidence is unavailable, preserve conflicting input and leave reconciliation unresolved; revision equality cannot establish success.

3. **MAJOR — STILL OPEN: Backup reactivates an obsolete weight correction.**  
   [backup.ts:46](/Users/rabah/projects/anygym/src/db/backup.ts:46), [backup.ts:48](/Users/rabah/projects/anygym/src/db/backup.ts:48)  
   Held corrections are captured before the table snapshot. A newer save between those reads supersedes the correction, but its suppression receipt is omitted from export. **Reproduced:** source and restored set held **175 lb**, yet Retry applied an obsolete **155 lb** correction.  
   **Exact fix:** Capture durable pending changes, tables and suppression receipts in one read transaction. Filter captured fallback/memory changes against that snapshot and preserve the required receipts during restore.

4. **MAJOR — STILL OPEN: Logging overwrites another tab’s pending weight.**  
   [drafts.ts:192](/Users/rabah/projects/anygym/src/lib/drafts.ts:192)  
   A clean cached row can replace authoritative IndexedDB data merely because its revision is higher—even when it has a different draft identity. **Reproduced:** pending **Y, 73 lb × 19**, became stale **X, 53 lb × 7**. Restart recovers the wrong lift.  
   **Exact fix:** Merge only dirty changes and explicit deletions. Clean rows must adopt committed state; compare revisions only within the same draft identity and allocate revisions transactionally.

5. **MAJOR — STILL OPEN: Finish → Undo reuses correction IDs, allowing stale discard to erase a newer weight.**  
   [workouts.ts:496](/Users/rabah/projects/anygym/src/db/workouts.ts:496), [mutations.ts:293](/Users/rabah/projects/anygym/src/db/mutations.ts:293)  
   Finish deletes revision counters. After reopening, a newer correction can receive an older operation’s ID. **Reproduced:** stale discard removed a pending **175 lb** correction because both operations were `mut:edit:lift:1`; **155 lb remained saved**.  
   **Exact fix:** Retain counters for the session’s lifetime, including Finish → Undo, or use persistent UUID operation IDs. Discard must target the exact operation shown.

6. **MAJOR — STILL OPEN: A discarded correction returns when its suppression write fails.**  
   [mutations.ts:448](/Users/rabah/projects/anygym/src/db/mutations.ts:448)  
   Discard swallows suppression-receipt failure and removes local recovery copies. Another tab’s memory copy remains actionable. **Reproduced:** Finish succeeded with **135 lb**; after Finish → Undo, another tab’s Retry restored the discarded **155 lb** correction.  
   **Exact fix:** Require the suppression receipt to commit before deleting any recovery copy. On failure, retain the correction, report a retryable discard error and keep Finish blocked.

7. **MAJOR — STILL OPEN: Discarded failed Logs return through a stale recovered tab.**  
   [rowLog.ts:329](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:329), [rowLog.ts:339](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:339)  
   Failed-Log cancellation is recorded only in runtime memory and draft cleanup. A tab holding hydrated drafts can retain the submission. **Reproduced:** after discard and Finish → Undo, its Retry added the discarded **155 lb set**, inflating workout totals.  
   **Exact fix:** Commit a durable cancellation receipt with journal deletion. Recovery, reconciliation and submission must honor it across contexts; intentional resubmission must receive a fresh identity.

Typecheck passed. Weight controls passed **280 lb/kg combinations, 30 solver round trips and 14 saved-load/history checks**, covering bar identity, collars, machine starts, stack add-ons, single versus paired weights, units and inventory changes. All seven failures were reproduced with production helpers and in-memory IndexedDB; physical iPhone race timing remains unverified.