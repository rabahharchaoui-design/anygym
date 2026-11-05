**5 confirmed findings: 4 MAJOR, 1 MINOR. All STILL OPEN.** Reviewed completed `[x]` scope only; fixed earlier findings excluded. No files edited.

1. **MAJOR — STILL OPEN: “Finish without it” can discard input the user never saw.**  
   [rowLog.ts:353](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:353), [rowLog.ts:359](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:359)  
   The sheet matches failed Logs by row ID and revision. Two tabs can assign those same identifiers to different values. **Reproduced:** the sheet represented 19 reps; another tab journaled 23 reps; dismissing the original sheet deleted the 23-rep journal, and Finish succeeded without saving it.  
   **Exact fix:** Give each submission an immutable, globally unique operation ID and payload fingerprint. Snapshot both in `ShownRow`; transactionally discard only that exact operation. Changed input must remain unresolved.

2. **MAJOR — STILL OPEN, same-ID variant: Logging overwrites another tab’s pending weight.**  
   [drafts.ts:194](/Users/rabah/projects/anygym/src/lib/drafts.ts:194)  
   Clean cached drafts still overwrite IndexedDB when their revision is higher and the draft ID matches. Revisions are allocated independently by each tab, so higher does not establish newer. **Reproduced with localStorage writes failing:** durable **73 lb × 19, revision 1** reverted to stale **53 lb × 7, revision 5**.  
   **Exact fix:** Merge only dirty changes and explicit deletions. Clean rows must adopt committed IndexedDB state regardless of their cached revision. Allocate revisions transactionally across tabs.

3. **MAJOR — STILL OPEN: Deleted sets’ legacy receipts erase conflicting input.**  
   [workouts.ts:169](/Users/rabah/projects/anygym/src/db/workouts.ts:169), [rowLog.ts:283](/Users/rabah/projects/anygym/src/screens/workout/rowLog.ts:283), [setTable.ts:170](/Users/rabah/projects/anygym/src/lib/setTable.ts:170)  
   The legacy-receipt check compares payloads only while the saved set exists. After deletion, reconciliation accepts revision equality without payload evidence. **Reproduced:** a deleted **53 lb × 10** set’s old receipt caused a **73 lb × 19** submission to return success and clear its draft, leaving no saved set.  
   **Exact fix:** Consult trustworthy saved/tombstone payload evidence. If neither a fingerprint nor trustworthy payload exists, leave reconciliation unresolved. Neither submission nor reconciliation may consume input solely from revision equality.

4. **MAJOR — STILL OPEN: Backup revives an explicitly discarded failed Log.**  
   [backup.ts:55](/Users/rabah/projects/anygym/src/db/backup.ts:55), [backup.ts:59](/Users/rabah/projects/anygym/src/db/backup.ts:59)  
   Export captures drafts before its database snapshot, but never filters them against cancellation receipts. **Reproduced:** discard during export left the source with zero sets; restoring the backup offered the discarded **53 lb × 19** Log, and Retry saved it.  
   **Exact fix:** Read cancellation receipts in the snapshot transaction and reconcile captured drafts against them. Exclude canceled submissions, or carry their validated cancellation receipts through restore.

5. **MINOR — STILL OPEN: Storage failure lets a stale tab erase added rows.**  
   [extraSets.ts:108](/Users/rabah/projects/anygym/src/lib/extraSets.ts:108), [extraSets.ts:133](/Users/rabah/projects/anygym/src/lib/extraSets.ts:133)  
   When localStorage rejects writes, each tab still persists its complete cached adjustment collection. **Reproduced:** two durable extra squat rows became one after another tab added a bench row. Removal markers share this overwrite path, so removed rows can return.  
   **Exact fix:** Apply count deltas and removal-marker changes transactionally against the latest IndexedDB value. Refresh memory and localStorage from the committed result.

Typecheck passed. In-memory production-module probes reproduced all five findings; 680 weight-sum checks and 14 solver round trips passed. Physical iPhone layout, native gestures, and VoiceOver were not tested.